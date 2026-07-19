import { leaders, type Db } from "@klub/db";

import type { LeaderIndexerSummary } from "./leader-indexer.js";

export async function upsertLeaderSummary(
  db: Db,
  summary: LeaderIndexerSummary,
): Promise<void> {
  const now = new Date();
  const metrics = {
    netPnl24hUsd: summary.netPnl24hUsd,
    netPnl7dUsd: summary.netPnl7dUsd,
    netPnl30dUsd: summary.netPnl30dUsd,
    unrealizedPnlUsd: summary.unrealizedPnlUsd,
    winRate: summary.winRate,
    closedTradesCount: summary.closedTradesCount,
    maxDrawdownUsd: summary.maxDrawdownUsd,
    maxDrawdownPct: summary.maxDrawdownPct,
    sharpeRatio: summary.sharpeRatio,
    followedEquityUsd: 0,
    fillsLast24h: summary.fillsLast24h,
    fillsLast7d: summary.fillsLast7d,
    fillsLast30d: summary.fillsLast30d,
    updatedAt: now,
  };

  await db
    .insert(leaders)
    .values({ pubkey: summary.leaderPubkey, handle: null, ...metrics })
    .onConflictDoUpdate({ target: leaders.pubkey, set: metrics });
}
