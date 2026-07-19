export interface VerifiedLeader {
  readonly pubkey: string;
  readonly label: string;
  readonly netPnl30dUsd: number;
  readonly unrealizedPnlUsd: number;
  readonly winRate: number;
  readonly closedTradesCount: number;
  readonly maxDrawdownPct: number;
  readonly sharpeRatio: number;
  readonly fillsLast30d: number;
  readonly updatedAt: string;
}

export function leaderLabel(handle: string | null, pubkey: string): string {
  return handle ? `@${handle}` : `${pubkey.slice(0, 5)}…${pubkey.slice(-4)}`;
}
