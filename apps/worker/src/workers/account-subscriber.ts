// apps/worker/src/workers/account-subscriber.ts
/* eslint-disable no-console */

import { BulkWebSocket, type AccountUpdate } from "@klub/api-client";
import { alertSubscriptions, users, type Db } from "@klub/db";
import { Queue } from "bullmq";
import { and, eq, isNull } from "drizzle-orm";
import type { Redis } from "ioredis";
import WebSocket from "ws";

import type { AlertJobPayload } from "./alerts-worker.js";

/**
 * Bulk account-stream subscriber.
 *
 * For each active user with alerts enabled, opens a subscription to
 * the `{ type: 'account', user: pubkey }` topic on Bulk. On every
 * position update, computes the buffer-to-liquidation and enqueues
 * an `AlertJobPayload` if the buffer crosses a tier the user has
 * subscribed to (25% / 10% / 3% by default).
 *
 * Why this is in Node (not the browser):
 *   - Alerts fire whether the user's tab is open or not
 *   - Runs in a persistent worker process (Railway, Fly, k8s)
 *   - Uses the `ws` package to give @klub/api-client's BulkWebSocket
 *     a Node-compatible WebSocket implementation
 *
 * Rate-limiting:
 *   - Per (user, symbol, tier), dedupe via Redis with a 5-min TTL
 *   - Prevents flapping when a buffer hovers near a tier boundary
 *
 * Reconnect:
 *   - BulkWebSocket handles exponential backoff + resubscribe
 *   - If a user signs up or enables alerts mid-session, call
 *     `subscribeUser(userId, pubkey)` to bring them into the pool
 */

const WS_URL =
  process.env["BULK_WS_URL"] ??
  process.env["NEXT_PUBLIC_BULK_WS_URL"] ??
  "wss://exchange-ws1.bulk.trade";
const ALERTS_QUEUE_NAME = "klub.alerts";

const TIERS = [
  { pct: 0.25, key: "tier25" as const, tier: 0.25 as const },
  { pct: 0.1, key: "tier10" as const, tier: 0.1 as const },
  { pct: 0.03, key: "tier03" as const, tier: 0.03 as const },
];

export interface AccountSubscriberHandle {
  /** Subscribe a newly-enabled user into the pool. Safe to call repeatedly. */
  readonly subscribeUser: (userId: string, pubkey: string) => void;
  /** Stop watching a user (they disabled alerts, deleted their account, etc.). */
  readonly unsubscribeUser: (userId: string) => void;
  /** Tear down the connection + all subscriptions. */
  readonly close: () => Promise<void>;
  /** Current # of active subscriptions, for metrics. */
  readonly size: () => number;
}

/**
 * Start the account-WS subscriber.
 *
 * On boot, loads every user with alerts enabled from Postgres and
 * opens a subscription for each. Returns a handle to manage the
 * subscriber lifecycle at runtime.
 */
export async function startAccountSubscriber({
  db,
  redis,
}: {
  readonly db: Db;
  readonly redis: Redis;
}): Promise<AccountSubscriberHandle> {
  const ws = new BulkWebSocket({
    url: WS_URL,
    // `ws` is a Node-side WebSocket impl; BulkWebSocket is transport-agnostic
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WebSocketImpl: WebSocket as any,
    log: (msg, meta) => {
      console.log(`[account-sub] ${msg}`, meta ?? "");
    },
  });

  ws.onStateChange((state) => {
    console.log(`[account-sub] ws state = ${state}`);
  });

  const alertsQueue = new Queue<AlertJobPayload>(ALERTS_QUEUE_NAME, {
    connection: redis,
  });
  const subscribedUsers = new Map<
    string,
    { pubkey: string; unsub: () => void }
  >();

  // Load every active user with alerts enabled and subscribe to their account stream.
  const activeUsers = await db
    .select({ id: users.id, pubkey: alertSubscriptions.userPubkey })
    .from(alertSubscriptions)
    .innerJoin(users, eq(users.id, alertSubscriptions.userId))
    .where(and(eq(alertSubscriptions.enabled, true), isNull(users.disabledAt)));

  ws.connect();

  for (const row of activeUsers) {
    if (!row.pubkey) continue;
    subscribeOne(row.id, row.pubkey);
  }

  console.log(
    `[account-sub] booted with ${subscribedUsers.size} user subscriptions`,
  );

  function subscribeOne(userId: string, pubkey: string): void {
    if (subscribedUsers.has(userId)) return;
    const unsub = ws.onAccount(pubkey, (payload) => {
      void processAccountUpdate({ userId, payload, alertsQueue, redis });
    });
    subscribedUsers.set(userId, { pubkey, unsub });
  }

  function unsubscribeOne(userId: string): void {
    const entry = subscribedUsers.get(userId);
    if (!entry) return;
    entry.unsub();
    subscribedUsers.delete(userId);
  }

  async function close(): Promise<void> {
    for (const [, entry] of subscribedUsers) entry.unsub();
    subscribedUsers.clear();
    ws.disconnect();
    await alertsQueue.close();
  }

  return {
    subscribeUser: subscribeOne,
    unsubscribeUser: unsubscribeOne,
    close,
    size: () => subscribedUsers.size,
  };
}

// ---------------------------------------------------------------------------
// Per-update processing: compute buffers, enqueue alerts if tier crossed
// ---------------------------------------------------------------------------

async function processAccountUpdate({
  userId,
  payload,
  alertsQueue,
  redis,
}: {
  readonly userId: string;
  readonly payload: AccountUpdate;
  readonly alertsQueue: Queue<AlertJobPayload>;
  readonly redis: Redis;
}): Promise<void> {
  for (const position of payload.positions) {
    const symbol = position.s;
    const markPrice = Number(position.markPx ?? position.entryPx ?? 0);
    const liqPrice = Number(position.liqPx ?? 0);
    const sizeBase = Number(position.sz ?? 0);
    if (
      !Number.isFinite(markPrice) ||
      !Number.isFinite(liqPrice) ||
      liqPrice === 0
    ) {
      continue;
    }
    if (sizeBase === 0) continue;

    const side = sizeBase > 0 ? "long" : "short";
    const buffer =
      side === "long"
        ? (markPrice - liqPrice) / markPrice
        : (liqPrice - markPrice) / markPrice;

    // Only alert when approaching liquidation (positive buffer shrinking)
    if (buffer <= 0) continue;

    for (const tier of TIERS) {
      if (buffer > tier.pct) continue; // not crossed yet

      // Redis dedupe key — one alert per (user, symbol, tier) per 5 min
      const dedupeKey = `klub:alert:${userId}:${symbol}:${tier.key}`;
      const acquired = await redis.set(dedupeKey, "1", "EX", 300, "NX");
      if (acquired !== "OK") {
        // Already fired recently; skip this tier but CHECK lower tiers —
        // if the position drops further it should still alert.
        continue;
      }

      await alertsQueue.add("tier-crossed", {
        userId,
        symbol,
        tier: tier.tier,
        bufferPct: buffer,
        liqPrice,
        markPrice,
        positionSizeBase: Math.abs(sizeBase),
        side,
        detectedAt: payload.ts ?? Date.now(),
      });

      // Once the tightest crossed tier fires, stop checking looser ones.
      // The tightest tier (3%) is always the most-urgent signal.
      break;
    }

    // When the position recovers past a tier (+15% hysteresis), clear
    // the dedupe so a later breach can re-fire. Prevents "silent once,
    // broken forever" when a user rides the edge for a day.
    for (const tier of TIERS) {
      if (buffer > tier.pct * 1.15) {
        const dedupeKey = `klub:alert:${userId}:${symbol}:${tier.key}`;
        await redis.del(dedupeKey);
      }
    }
  }
}
