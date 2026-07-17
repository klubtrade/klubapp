// apps/worker/src/index.ts
/* eslint-disable no-console */

import { createDbClient } from "@klub/db";
import { Redis } from "ioredis";

import { startAccountSubscriber } from "./workers/account-subscriber.js";
import { createAlertsWorker } from "./workers/alerts-worker.js";
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
  console.log("[klub-worker] boot");

  const redis = new Redis(env("REDIS_URL"), {
    maxRetriesPerRequest: null, // required by BullMQ
  });

  const db = createDbClient({
    connectionString: env("DATABASE_URL"),
    maxConnections: 5,
  });

  // Boot order matters: subscriber depends on Postgres + Redis;
  // queue workers depend on Redis only.
  const accountSubscriber = await startAccountSubscriber({ db, redis });
  const alertsWorker = createAlertsWorker({ redis, db });
  const copyTradeWorker = createCopyTradeWorker({ redis, db });

  async function shutdown(signal: string) {
    console.log(`[klub-worker] received ${signal}, shutting down`);
    // Stop subscriber first — no new jobs after this
    await accountSubscriber.close();
    await Promise.allSettled([alertsWorker.close(), copyTradeWorker.close()]);
    await redis.quit();
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
    `[klub-worker] live · ${accountSubscriber.size()} account streams, alerts + copy-trade queues ready`,
  );
}

void main().catch((err) => {
  console.error("[klub-worker] fatal", err);
  process.exit(1);
});
