/* eslint-disable no-console */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDbClient, type Db } from "@klub/db";
import type {
  BulkClient,
  BulkClientConfig,
  FundingPayment,
  Pubkey,
  UserFill,
} from "@klub/api-client";

import { computeLeaderMetrics, toTimestampMs } from "./leader-metrics.js";
import { mapWithConcurrency } from "./worker-utils.js";
import { upsertLeaderSummary } from "./leader-persistence.js";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const LEADER_INDEXER_INTERVAL_MS = 15 * 60 * 1000;

export interface LeaderIndexerSummary {
  readonly leaderPubkey: Pubkey;
  readonly fillsTotal: number;
  readonly fillsLast24h: number;
  readonly fillsLast7d: number;
  readonly fillsLast30d: number;
  readonly fundingPaymentsLast30d: number;
  readonly fundingPnlUsd: number;
  readonly netPnl24hUsd: number;
  readonly netPnl7dUsd: number;
  readonly netPnl30dUsd: number;
  readonly netPnlUsd: number;
  readonly unrealizedPnlUsd: number;
  readonly winRate: number;
  readonly closedTradesCount: number;
  readonly maxDrawdownUsd: number;
  readonly maxDrawdownPct: number;
  readonly sharpeRatio: number;
}

export interface LeaderIndexerOnceOptions {
  readonly client?: BulkClient;
  readonly db?: Db;
  readonly leaderPubkeys?: readonly Pubkey[];
  readonly nowMs?: number;
}

export interface LeaderIndexerOptions extends LeaderIndexerOnceOptions {
  readonly intervalMs?: number;
  readonly logger?: Pick<Console, "error" | "log" | "warn">;
}
export interface RunningLeaderIndexer {
  readonly intervalMs: number;
  close(): void;
}

export function parseLeaderPubkeys(raw: string | undefined): readonly Pubkey[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pubkey) => pubkey.trim())
    .filter((pubkey) => pubkey.length > 0);
}

export async function runLeaderIndexerOnce(
  options: LeaderIndexerOnceOptions = {},
): Promise<readonly LeaderIndexerSummary[]> {
  const leaderPubkeys =
    options.leaderPubkeys ?? parseLeaderPubkeys(process.env["LEADER_PUBKEYS"]);
  if (leaderPubkeys.length === 0) {
    throw new Error(
      "Missing LEADER_PUBKEYS. Set a comma-separated list of leader pubkeys.",
    );
  }

  const { BulkClient, queryUserFills, queryUserFundingPayments } =
    await import("@klub/api-client");
  const client = options.client ?? createBulkClientFromEnv(BulkClient);
  const db = options.db ?? createDbClientFromEnv();
  const nowMs = options.nowMs ?? Date.now();
  const cutoffMs = nowMs - THIRTY_DAYS_MS;

  const results = await mapWithConcurrency(
    leaderPubkeys,
    5,
    async (leaderPubkey) => {
      const [fills, fundingPayments] = await Promise.all([
        queryUserFills(client, leaderPubkey),
        queryUserFundingPayments(client, leaderPubkey),
      ]);
      return summarizeLeaderFills({
        leaderPubkey,
        fills,
        fundingPayments,
        cutoffMs,
        nowMs,
      });
    },
  );
  const summaries = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (summaries.length === 0) {
    throw new Error(
      "Bulk account history was unavailable for every observed trader.",
    );
  }

  if (db) {
    await Promise.all(
      summaries.map((summary) => upsertLeaderSummary(db, summary)),
    );
  }

  return summaries;
}

export function startLeaderIndexer(
  options: LeaderIndexerOptions = {},
): RunningLeaderIndexer {
  const intervalMs = options.intervalMs ?? LEADER_INDEXER_INTERVAL_MS;
  const logger = options.logger ?? console;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      logger.warn("[leader-indexer] previous run still active; skipping tick");
      return;
    }

    running = true;
    try {
      const summaries = await runLeaderIndexerOnce(options);
      logger.log(
        JSON.stringify(
          {
            worker: "leader-indexer",
            indexedAt: new Date().toISOString(),
            summaries,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      logger.error("[leader-indexer] run failed", err);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    intervalMs,
    close: () => {
      clearInterval(timer);
    },
  };
}

export function summarizeLeaderFills({
  leaderPubkey,
  fills,
  fundingPayments,
  cutoffMs,
  nowMs,
}: {
  readonly leaderPubkey: Pubkey;
  readonly fills: readonly UserFill[];
  readonly fundingPayments: readonly FundingPayment[];
  readonly cutoffMs: number;
  readonly nowMs: number;
}): LeaderIndexerSummary {
  const fillsLast30d = fills.filter(
    (fill) => toTimestampMs(fill.timestamp) >= cutoffMs,
  );
  const fundingPaymentsLast30d = fundingPayments.filter(
    (payment) => toTimestampMs(payment.timestamp) >= cutoffMs,
  );
  const metrics = computeLeaderMetrics(fillsLast30d, fundingPaymentsLast30d, {
    nowMs,
  });
  const metrics24h = computeWindowMetrics(
    fillsLast30d,
    fundingPaymentsLast30d,
    nowMs - ONE_DAY_MS,
    nowMs,
  );
  const metrics7d = computeWindowMetrics(
    fillsLast30d,
    fundingPaymentsLast30d,
    nowMs - SEVEN_DAYS_MS,
    nowMs,
  );

  return {
    leaderPubkey,
    fillsTotal: fills.length,
    fillsLast24h: metrics24h.fills,
    fillsLast7d: metrics7d.fills,
    fillsLast30d: fillsLast30d.length,
    fundingPaymentsLast30d: fundingPaymentsLast30d.length,
    fundingPnlUsd: metrics.fundingPnlUsd,
    netPnl24hUsd: metrics24h.metrics.netPnlUsd,
    netPnl7dUsd: metrics7d.metrics.netPnlUsd,
    netPnl30dUsd: metrics.netPnlUsd,
    netPnlUsd: metrics.netPnlUsd,
    unrealizedPnlUsd: metrics.unrealizedPnlUsd,
    winRate: metrics.winRate,
    closedTradesCount: metrics.closedTradesCount,
    maxDrawdownUsd: metrics.maxDrawdownUsd,
    maxDrawdownPct: metrics.maxDrawdownPct,
    sharpeRatio: metrics.sharpeRatio,
  };
}

function computeWindowMetrics(
  fills: readonly UserFill[],
  funding: readonly FundingPayment[],
  cutoffMs: number,
  nowMs: number,
) {
  const windowFills = fills.filter(
    (fill) => toTimestampMs(fill.timestamp) >= cutoffMs,
  );
  return {
    fills: windowFills.length,
    metrics: computeLeaderMetrics(fills, funding, {
      nowMs,
      pnlStartMs: cutoffMs,
    }),
  };
}

function createBulkClientFromEnv(
  BulkClientCtor: new (config?: BulkClientConfig) => BulkClient,
): BulkClient {
  const baseUrl = process.env["BULK_HTTP_URL"] ?? process.env["BULK_API_URL"];
  return new BulkClientCtor(baseUrl ? { baseUrl } : {});
}

function createDbClientFromEnv(): Db | undefined {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return undefined;
  return createDbClient({ connectionString, maxConnections: 3 });
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === fileURLToPath(import.meta.url);
}

async function runCli(): Promise<void> {
  if (process.argv.includes("--once")) {
    const summaries = await runLeaderIndexerOnce();
    console.log(JSON.stringify(summaries, null, 2));
    return;
  }

  startLeaderIndexer();
}

if (isDirectRun()) {
  void runCli().catch((err) => {
    console.error("[leader-indexer] fatal", err);
    process.exit(1);
  });
}
