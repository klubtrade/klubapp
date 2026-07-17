// apps/worker/src/workers/alerts-worker.ts
/* eslint-disable no-console */

import { alertDeliveries, alertSubscriptions, type Db, users } from "@klub/db";
import { Queue, Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";

import { sendPush } from "../notifications/push.js";
import { sendAlertEmail } from "../notifications/resend.js";
import { formatAlertText, sendTelegram } from "../notifications/telegram.js";

/**
 * Alerts worker.
 *
 * Responsibilities:
 *   1. Subscribe to each active user's Bulk account WebSocket feed.
 *   2. On every position update, compute the buffer to liquidation.
 *   3. When the buffer crosses a configured threshold (default 25%, 10%, 3%),
 *      enqueue an alert delivery job.
 *   4. The Worker processes each alert job and dispatches to the user's
 *      selected channels (push / email / telegram).
 *   5. Every dispatch (success or error) is logged to alert_deliveries.
 *
 * Guards:
 *   - Never alert the same (user, symbol, tier) more than once per 5 min
 *     (in-memory Redis rate limit, not shown).
 *   - If a position improves past a tier, reset so it can alert again later.
 */

// -------------------------------------------------------------------
// Queue + Worker setup
// -------------------------------------------------------------------

const QUEUE_NAME = "klub.alerts";

export interface AlertJobPayload {
  readonly userId: string;
  readonly symbol: string;
  readonly tier: 0.25 | 0.1 | 0.03;
  readonly bufferPct: number;
  readonly liqPrice: number;
  readonly markPrice: number;
  readonly positionSizeBase: number;
  readonly side: "long" | "short";
  readonly detectedAt: number;
}

export function createAlertsWorker({
  redis,
  db,
}: {
  readonly redis: Redis;
  readonly db: Db;
}): Worker<AlertJobPayload> {
  // A shared queue used by the subscriber loop to enqueue work.
  // Reference kept so we can enqueue in the same process; in prod
  // the subscriber loop is its own service that writes to the same
  // Redis.
  const queue = new Queue<AlertJobPayload>(QUEUE_NAME, { connection: redis });
  void queue; // retained for future use; referenced to avoid unused warnings

  // TODO(phase-3.5): start the Bulk account-WS subscriber loop here.
  // For each active user with alerts enabled, open a subscription,
  // track open positions, compute buffer percentages on each tick,
  // and enqueue AlertJobPayloads when a tier is crossed.
  //
  // Stubbed today — the subscriber is the single biggest remaining
  // piece of backend engineering in this worker. See PHASE-3.5-BRIEF
  // for the exact integration plan with `@klub/api-client`'s
  // WebSocketClient.

  const worker = new Worker<AlertJobPayload>(
    QUEUE_NAME,
    async (job: Job<AlertJobPayload>) => {
      await handleAlertJob({ job, db });
    },
    {
      connection: redis,
      concurrency: 20, // tune per notification provider RPS
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[alerts] job ${job?.id} failed`, err);
  });

  return worker;
}

// -------------------------------------------------------------------
// Job handler
// -------------------------------------------------------------------

async function handleAlertJob({
  job,
  db,
}: {
  readonly job: Job<AlertJobPayload>;
  readonly db: Db;
}): Promise<void> {
  const p = job.data;

  const subRows = await db
    .select()
    .from(alertSubscriptions)
    .where(eq(alertSubscriptions.userId, p.userId));
  const sub = subRows[0];
  if (!sub || !sub.enabled) return;

  const userRows = await db.select().from(users).where(eq(users.id, p.userId));
  const user = userRows[0];
  if (!user || user.disabledAt) return;

  const channels = (sub.channels as readonly string[]) ?? ["push"];
  const message = composeAlertMessage(p);

  // Dispatch in parallel, log every attempt
  await Promise.all(
    channels.map(async (channel) => {
      try {
        switch (channel) {
          case "push":
            await sendPush(user.id, message);
            break;
          case "email":
            await sendAlertEmail(user.email, message);
            break;
          case "telegram":
            if (!sub.telegramChatId) {
              throw new Error("Telegram chat ID is not configured");
            }
            {
              const delivery = await sendTelegram({
                chatId: sub.telegramChatId,
                text: formatAlertText(p),
              });
              if (!delivery.ok) {
                throw new Error(
                  `Telegram delivery failed: ${delivery.error ?? "unknown"}`,
                );
              }
            }
            break;
        }
        await db.insert(alertDeliveries).values({
          userId: p.userId,
          symbol: p.symbol,
          tier: p.tier,
          channel,
          error: null,
        });
      } catch (err) {
        await db.insert(alertDeliveries).values({
          userId: p.userId,
          symbol: p.symbol,
          tier: p.tier,
          channel,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

// -------------------------------------------------------------------
// Pure helpers (tested in alerts-worker.test.ts)
// -------------------------------------------------------------------

export function composeAlertMessage(p: AlertJobPayload): {
  readonly title: string;
  readonly body: string;
  readonly severity: "info" | "warning" | "critical";
} {
  const severity: "info" | "warning" | "critical" =
    p.tier === 0.25 ? "info" : p.tier === 0.1 ? "warning" : "critical";
  const tierLabel =
    p.tier === 0.25
      ? "25% buffer"
      : p.tier === 0.1
        ? "10% buffer"
        : "3% buffer — act now";
  const title = `${p.symbol} ${p.side.toUpperCase()} · ${tierLabel}`;
  const body = `Mark $${p.markPrice.toFixed(2)} · Liq $${p.liqPrice.toFixed(2)} · Buffer ${(p.bufferPct * 100).toFixed(1)}%. Open KLUB to add margin, reduce, or close.`;
  return { title, body, severity };
}

/**
 * Determine which tier (if any) a position has just crossed.
 * Pure function so we can unit-test it.
 *
 * Returns the most severe tier the bufferPct has crossed since the
 * last known bufferPct, or null if no crossing.
 */
export function tierCrossed(
  previousBufferPct: number,
  currentBufferPct: number,
  tiers: readonly number[] = [0.25, 0.1, 0.03],
): number | null {
  // We only fire when buffer is SHRINKING past a tier (previous > tier >= current).
  const sorted = [...tiers].sort((a, b) => a - b); // ascending: 0.03, 0.10, 0.25
  for (const tier of sorted) {
    if (previousBufferPct > tier && currentBufferPct <= tier) {
      return tier;
    }
  }
  return null;
}
