// apps/worker/src/index.ts
/* eslint-disable no-console */

import { randomUUID } from "node:crypto";

import { createDbClient } from "@klub/db";
import { Redis } from "ioredis";

import { startAccountSubscriber } from "./workers/account-subscriber.js";
import { createAlertsWorker } from "./workers/alerts-worker.js";
import { startCopyFollowScanner } from "./workers/copy-follow-scanner.js";
import { createCopyTradeWorker } from "./workers/copy-trade-worker.js";
import { startBasisYieldOperator } from "./workers/basis-yield-operator.js";
import { workerIntervalMs } from "./workers/basis-strategy-config.js";
import { startBasisStrategyWorker } from "./workers/basis-strategy-worker.js";
import { startLeaderDiscovery } from "./workers/leader-discovery.js";

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

function basisRuntimeEnabled(): boolean {
  const explicit = process.env.BASIS_OPERATOR_ENABLED?.trim().toLowerCase();
  if (explicit === "false") return false;
  if (explicit === "true") return true;
  return [
    "BASIS_BULK_STRATEGY_ACCOUNT",
    "BASIS_VAULT_STRATEGY_AUTHORITY",
    "BASIS_VAULT_STRATEGY_AUTHORITY_SECRET",
    "BASIS_VAULT_PROGRAM_ID",
    "BASIS_VAULT_USDC_MINT",
    "BASIS_VAULT_ADDRESS",
    "BASIS_VAULT_USDC_ACCOUNT",
    "SOLANA_RPC_URL",
  ].every((name) => process.env[name]?.trim());
}

async function main() {
  const instanceId = `${process.env["RAILWAY_SERVICE_ID"] ?? "local"}:${randomUUID()}`;
  console.log(`[klub-worker] boot · ${instanceId}`);

  const db = createDbClient({
    connectionString: env("DATABASE_URL"),
    maxConnections: 5,
  });

  const copyFollowScanner = startCopyFollowScanner({ db, instanceId });
  const leaderDiscovery = await startLeaderDiscovery({ db });
  const basisEnabled = basisRuntimeEnabled();
  const basisOperator = basisEnabled
    ? startBasisYieldOperator({
        db,
        intervalMs: workerIntervalMs(
          "BASIS_OPERATOR_INTERVAL_MS",
          60_000,
          30_000,
        ),
      })
    : null;
  const basisStrategy = basisEnabled
    ? startBasisStrategyWorker({
        db,
        intervalMs: workerIntervalMs(
          "BASIS_STRATEGY_INTERVAL_MS",
          60_000,
          30_000,
        ),
      })
    : null;
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
    leaderDiscovery.close();
    basisOperator?.close();
    basisStrategy?.close();
    await accountSubscriber?.close();
    await Promise.allSettled([alertsWorker?.close(), copyTradeWorker?.close()]);
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
    `[klub-worker] live · leader discovery ready · copy-follow scanner ready · ${accountSubscriber?.size() ?? 0} account streams · queues ${redis ? "ready" : "disabled"}`,
  );
}

void main().catch((err) => {
  console.error("[klub-worker] fatal", err);
  process.exit(1);
});
