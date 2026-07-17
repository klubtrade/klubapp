// apps/worker/src/index.ts
/* eslint-disable no-console */

import { randomUUID } from "node:crypto";

import { createDbClient } from "@klub/db";
import { Redis } from "ioredis";

import { startAccountSubscriber } from "./workers/account-subscriber.js";
import { createAlertsWorker } from "./workers/alerts-worker.js";
import { startCopyFollowScanner } from "./workers/copy-follow-scanner.js";
import { createCopyTradeWorker } from "./workers/copy-trade-worker.js";

/**
 * KLUB background worker entrypoint.
 *
 * Boots three concurrent services against a shared Redis connection:
 *
 *   1. accountSubscriber  — subscribes to Bulk account WS per active
 *                            user, computes buffer on each position
 *                            tick, enqueues alert jobs when a tier
 *                            is crossed.
 *   2. alertsWorker       — consumes the alert queue, dispatches
 *                            push / email / telegram, logs to Postgres.
 *   3. copyTradeWorker    — subscribes to leader account WS, replays
 *                            trades proportionally through follower
 *                            agent wallets (Phase 3.5 completion).
 *
 * Each worker is independent; if one crashes, the others stay up.
 */

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

async function main() {
  const instanceId = `${process.env["RAILWAY_SERVICE_ID"] ?? "local"}:${randomUUID()}`;
  console.log(`[klub-worker] boot · ${instanceId}`);

  const db = createDbClient({
    connectionString: env("DATABASE_URL"),
    maxConnections: 5,
  });

  const copyFollowScanner = startCopyFollowScanner({ db, instanceId });
  const redisUrl = process.env["REDIS_URL"];
  const redis = redisUrl
    ? new Redis(redisUrl, {
        maxRetriesPerRequest: null, // required by BullMQ
      })
    : null;

  const accountSubscriber = redis
    ? await startAccountSubscriber({ db, redis })
    : null;
  const alertsWorker = redis ? createAlertsWorker({ redis, db }) : null;
  const copyTradeWorker = redis ? createCopyTradeWorker({ redis, db }) : null;

  if (!redis) {
    console.warn(
      "[klub-worker] REDIS_URL is not set; queue-based alerts and copy execution are disabled. DB scanner is live.",
    );
  }

  async function shutdown(signal: string) {
    console.log(`[klub-worker] received ${signal}, shutting down`);
    copyFollowScanner.close();
    await accountSubscriber?.close();
    await Promise.allSettled([
      alertsWorker?.close(),
      copyTradeWorker?.close(),
    ]);
    await redis?.quit();
    process.exit(0);
  }

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("unhandledRejection", (reason) => {
    console.error("[klub-worker] unhandled rejection", reason);
  });

  console.log(
    `[klub-worker] live · copy-follow scanner ready · ${accountSubscriber?.size() ?? 0} account streams · queues ${redis ? "ready" : "disabled"}`,
  );
}

void main().catch((err) => {
  console.error("[klub-worker] fatal", err);
  process.exit(1);
});
