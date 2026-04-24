// apps/worker/src/workers/leader-indexer.ts
/* eslint-disable no-console */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDbClient, leaders, type Db } from "@klub/db";
import type {
  BulkClient,
  BulkClientConfig,
  FundingPayment,
  Pubkey,
  UserFill,
} from "@klub/api-client";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
export const LEADER_INDEXER_INTERVAL_MS = 15 * 60 * 1000;

export interface LeaderIndexerSummary {
  readonly leaderPubkey: Pubkey;
  readonly fillsTotal: number;
  readonly fillsLast30d: number;
  readonly fundingPaymentsLast30d: number;
  readonly fundingPnlUsd: number;
  readonly netPnlUsd: number;
  readonly unrealizedPnlUsd: number;
  readonly winRate: number;
  readonly closedTradesCount: number;
  readonly maxDrawdownUsd: number;
  readonly maxDrawdownPct: number;
  readonly sharpeRatio: number;
}

export interface LeaderMetrics {
  readonly fundingPnlUsd: number;
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

  const summaries = await Promise.all(
    leaderPubkeys.map(async (leaderPubkey) => {
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
    }),
  );

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

  return {
    leaderPubkey,
    fillsTotal: fills.length,
    fillsLast30d: fillsLast30d.length,
    fundingPaymentsLast30d: fundingPaymentsLast30d.length,
    fundingPnlUsd: metrics.fundingPnlUsd,
    netPnlUsd: metrics.netPnlUsd,
    unrealizedPnlUsd: metrics.unrealizedPnlUsd,
    winRate: metrics.winRate,
    closedTradesCount: metrics.closedTradesCount,
    maxDrawdownUsd: metrics.maxDrawdownUsd,
    maxDrawdownPct: metrics.maxDrawdownPct,
    sharpeRatio: metrics.sharpeRatio,
  };
}

export function computeLeaderMetrics(
  fills: readonly UserFill[],
  fundingPayments: readonly FundingPayment[] = [],
  options: { readonly nowMs?: number } = {},
): LeaderMetrics {
  let netPnlUsd = 0;
  let fundingPnlUsd = 0;
  let closedTradesCount = 0;
  let winningTradesCount = 0;
  const positions = new Map<string, SymbolPosition>();
  const dailyRealizedPnl = new Map<string, number>();
  const sortedFills = [...fills].sort(
    (a, b) => toTimestampMs(a.timestamp) - toTimestampMs(b.timestamp),
  );

  for (const fill of sortedFills) {
    const position = positions.get(fill.symbol) ?? createSymbolPosition();
    const fillDirection = fill.isBuy ? 1 : -1;
    let remainingSize = fill.amount;
    const feeUsd = getFillFeeUsd(fill);
    const feeCostUsd = Math.abs(feeUsd);
    const dayKey = dayKeyFromTimestamp(fill.timestamp);
    position.lastPrice = fill.price;

    if (
      Math.abs(position.positionSize) > 0 &&
      Math.sign(position.positionSize) !== fillDirection
    ) {
      const closedSize = Math.min(
        Math.abs(position.positionSize),
        remainingSize,
      );
      const grossPnl =
        position.positionSize > 0
          ? (fill.price - position.avgEntryPrice) * closedSize
          : (position.avgEntryPrice - fill.price) * closedSize;
      const closedFeeCostUsd = feeCostUsd * (closedSize / fill.amount);
      const closedPnl = grossPnl - closedFeeCostUsd;

      netPnlUsd += grossPnl;
      addDailyPnl(dailyRealizedPnl, dayKey, grossPnl);
      closedTradesCount += 1;
      if (closedPnl > 0) winningTradesCount += 1;

      remainingSize -= closedSize;
      position.positionSize += fillDirection * closedSize;

      if (Math.abs(position.positionSize) < 1e-12) {
        position.positionSize = 0;
        position.avgEntryPrice = 0;
      }
    }

    if (remainingSize > 0) {
      const currentAbsSize = Math.abs(position.positionSize);
      if (currentAbsSize === 0) {
        position.positionSize = fillDirection * remainingSize;
        position.avgEntryPrice = fill.price;
      } else {
        const nextAbsSize = currentAbsSize + remainingSize;
        position.avgEntryPrice =
          (position.avgEntryPrice * currentAbsSize +
            fill.price * remainingSize) /
          nextAbsSize;
        position.positionSize += fillDirection * remainingSize;
      }
    }

    netPnlUsd -= feeCostUsd;
    addDailyPnl(dailyRealizedPnl, dayKey, -feeCostUsd);
    positions.set(fill.symbol, position);
  }

  for (const payment of fundingPayments) {
    fundingPnlUsd += payment.payment;
    netPnlUsd += payment.payment;
    addDailyPnl(
      dailyRealizedPnl,
      dayKeyFromTimestamp(payment.timestamp),
      payment.payment,
    );
  }

  let unrealizedPnlUsd = 0;
  for (const position of positions.values()) {
    if (position.positionSize > 0) {
      unrealizedPnlUsd +=
        (position.lastPrice - position.avgEntryPrice) * position.positionSize;
    } else if (position.positionSize < 0) {
      unrealizedPnlUsd +=
        (position.avgEntryPrice - position.lastPrice) *
        Math.abs(position.positionSize);
    }
  }

  return {
    fundingPnlUsd: roundTo(fundingPnlUsd, 2),
    netPnlUsd: roundTo(netPnlUsd, 2),
    unrealizedPnlUsd: roundTo(unrealizedPnlUsd, 2),
    winRate:
      closedTradesCount > 0
        ? roundTo((winningTradesCount / closedTradesCount) * 100, 2)
        : 0,
    closedTradesCount,
    ...computeRiskMetrics(dailyRealizedPnl, options.nowMs ?? Date.now()),
  };
}

interface SymbolPosition {
  positionSize: number;
  avgEntryPrice: number;
  lastPrice: number;
}

function createSymbolPosition(): SymbolPosition {
  return {
    positionSize: 0,
    avgEntryPrice: 0,
    lastPrice: 0,
  };
}

function getFillFeeUsd(fill: UserFill): number {
  if (fill.fee !== undefined) return fill.fee;
  return (fill.makerFee ?? 0) + (fill.takerFee ?? 0);
}

function addDailyPnl(
  dailyPnl: Map<string, number>,
  dayKey: string,
  pnlUsd: number,
): void {
  dailyPnl.set(dayKey, (dailyPnl.get(dayKey) ?? 0) + pnlUsd);
}

function computeRiskMetrics(
  dailyPnl: Map<string, number>,
  nowMs: number,
): {
  readonly maxDrawdownUsd: number;
  readonly maxDrawdownPct: number;
  readonly sharpeRatio: number;
} {
  const dailyValues = buildThirtyDayDailyPnlSeries(dailyPnl, nowMs);

  let equity = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;

  for (const pnl of dailyValues) {
    equity += pnl;
    if (equity > peak) peak = equity;

    const drawdownUsd = peak - equity;
    if (drawdownUsd > maxDrawdownUsd) {
      maxDrawdownUsd = drawdownUsd;
      maxDrawdownPct = peak > 0 ? drawdownUsd / peak : 0;
    }
  }

  return {
    maxDrawdownUsd: roundTo(maxDrawdownUsd, 2),
    maxDrawdownPct: roundTo(maxDrawdownPct * 100, 2),
    sharpeRatio: roundTo(computeSharpeRatio(dailyValues), 2),
  };
}

function buildThirtyDayDailyPnlSeries(
  dailyPnl: Map<string, number>,
  nowMs: number,
): readonly number[] {
  const end = new Date(nowMs);
  const endDayMs = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  const startDayMs = endDayMs - 29 * 24 * 60 * 60 * 1000;

  return Array.from({ length: 30 }, (_, index) => {
    const dayMs = startDayMs + index * 24 * 60 * 60 * 1000;
    const dayKey = new Date(dayMs).toISOString().slice(0, 10);
    return dailyPnl.get(dayKey) ?? 0;
  });
}

function computeSharpeRatio(dailyValues: readonly number[]): number {
  if (dailyValues.length === 0) return 0;

  const mean =
    dailyValues.reduce((sum, value) => sum + value, 0) / dailyValues.length;
  const variance =
    dailyValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    dailyValues.length;
  const stddev = Math.sqrt(variance);

  return stddev > 0 ? (mean / stddev) * Math.sqrt(365) : 0;
}

function dayKeyFromTimestamp(timestamp: number): string {
  return new Date(toTimestampMs(timestamp)).toISOString().slice(0, 10);
}

function toTimestampMs(timestamp: number): number {
  return timestamp > 1_000_000_000_000_000
    ? Math.floor(timestamp / 1_000_000)
    : timestamp;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function createBulkClientFromEnv(
  BulkClientCtor: new (config?: BulkClientConfig) => BulkClient,
): BulkClient {
  const baseUrl = process.env["BULK_API_URL"];
  return new BulkClientCtor(baseUrl ? { baseUrl } : {});
}

function createDbClientFromEnv(): Db | undefined {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return undefined;
  return createDbClient({ connectionString, maxConnections: 3 });
}

async function upsertLeaderSummary(
  db: Db,
  summary: LeaderIndexerSummary,
): Promise<void> {
  const now = new Date();
  // TODO: compute followedEquityUsd once follower account equity is available.
  // The current follows table has leaderHandle and maxAllocationPct, but it
  // does not store follower equity/balance, and the indexer keys leaders by
  // pubkey, not handle. Until that source is persisted, this remains 0.
  const followedEquityUsd = 0;

  await db
    .insert(leaders)
    .values({
      pubkey: summary.leaderPubkey,
      handle: null,
      netPnl30dUsd: summary.netPnlUsd,
      unrealizedPnlUsd: summary.unrealizedPnlUsd,
      winRate: summary.winRate,
      closedTradesCount: summary.closedTradesCount,
      maxDrawdownUsd: summary.maxDrawdownUsd,
      maxDrawdownPct: summary.maxDrawdownPct,
      sharpeRatio: summary.sharpeRatio,
      followedEquityUsd,
      fillsLast30d: summary.fillsLast30d,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: leaders.pubkey,
      set: {
        netPnl30dUsd: summary.netPnlUsd,
        unrealizedPnlUsd: summary.unrealizedPnlUsd,
        winRate: summary.winRate,
        closedTradesCount: summary.closedTradesCount,
        maxDrawdownUsd: summary.maxDrawdownUsd,
        maxDrawdownPct: summary.maxDrawdownPct,
        sharpeRatio: summary.sharpeRatio,
        followedEquityUsd,
        fillsLast30d: summary.fillsLast30d,
        updatedAt: now,
      },
    });
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
