export interface VerifiedLeader {
  readonly pubkey: string;
  readonly label: string;
  readonly netPnl24hUsd: number;
  readonly netPnl7dUsd: number;
  readonly netPnl30dUsd: number;
  readonly unrealizedPnlUsd: number;
  readonly winRate: number;
  readonly closedTradesCount: number;
  readonly maxDrawdownPct: number;
  readonly sharpeRatio: number;
  readonly fillsLast24h: number;
  readonly fillsLast7d: number;
  readonly fillsLast30d: number;
  readonly updatedAt: string;
}

export type LeaderRankingWindow = "24h" | "7d" | "30d";

export function leaderWindowPnl(
  leader: VerifiedLeader,
  window: LeaderRankingWindow,
): number {
  if (window === "24h") return leader.netPnl24hUsd;
  if (window === "7d") return leader.netPnl7dUsd;
  return leader.netPnl30dUsd;
}

export function leaderWindowFills(
  leader: VerifiedLeader,
  window: LeaderRankingWindow,
): number {
  if (window === "24h") return leader.fillsLast24h;
  if (window === "7d") return leader.fillsLast7d;
  return leader.fillsLast30d;
}

export function leaderLabel(handle: string | null, pubkey: string): string {
  return handle ? `@${handle}` : `${pubkey.slice(0, 5)}…${pubkey.slice(-4)}`;
}
