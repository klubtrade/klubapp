// apps/web/lib/mock-data/leaders.ts
/**
 * Mock leader data for /follow.
 *
 * Replaced by a real indexer in Phase 3.5 once Bulk confirms whether
 * they'll expose an aggregated leaderboard to integrators or we build
 * our own against the account WS stream.
 *
 * All PnL numbers are NET of fees and funding — this is the entire
 * point of the leaderboard. Anything else is dishonest.
 */

export type TraderStyle = 'scalper' | 'swing' | 'trend' | 'basis';

export interface MockLeader {
  readonly handle: string;
  readonly avatarHue: number; // deterministic color from handle
  readonly style: TraderStyle;
  readonly styleLabel: string;
  readonly rank: number;
  readonly pnl30dUsd: number;
  readonly pnl30dPct: number;
  readonly winRate: number;
  readonly avgHoldingHours: number;
  readonly maxDrawdownPct: number;
  readonly worstMonthPct: number;
  readonly tradeCount30d: number;
  readonly followers: number;
  readonly aum: number;
  readonly favoriteMarkets: readonly string[];
  /** Short bio written by the leader. */
  readonly bio: string;
  /** Recent trade tape for profile page. */
  readonly recentTrades: readonly MockTrade[];
}

export interface MockTrade {
  readonly ts: number;
  readonly symbol: string;
  readonly side: 'long' | 'short';
  readonly entry: number;
  readonly exit: number;
  readonly sizeUsd: number;
  readonly pnlUsd: number;
  readonly holdingMin: number;
}

const NOW = Date.UTC(2026, 3, 18, 14, 30, 0); // deterministic for testing

export const MOCK_LEADERS: readonly MockLeader[] = [
  {
    handle: 'alphamamba',
    avatarHue: 38,
    style: 'trend',
    styleLabel: 'Trend follower',
    rank: 1,
    pnl30dUsd: 184_320,
    pnl30dPct: 61.4,
    winRate: 0.58,
    avgHoldingHours: 42,
    maxDrawdownPct: 8.2,
    worstMonthPct: -3.1,
    tradeCount30d: 47,
    followers: 2_413,
    aum: 842_000,
    favoriteMarkets: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    bio: 'Trend follower. Risks 1% per trade, lets winners run, cuts losers at the structural level. No scalping, no revenge trading.',
    recentTrades: [
      {
        ts: NOW - 3_600_000 * 12,
        symbol: 'BTC-USD',
        side: 'long',
        entry: 64_100,
        exit: 67_420,
        sizeUsd: 96_000,
        pnlUsd: 4_970,
        holdingMin: 620,
      },
      {
        ts: NOW - 3_600_000 * 38,
        symbol: 'ETH-USD',
        side: 'long',
        entry: 3_120,
        exit: 3_268,
        sizeUsd: 62_000,
        pnlUsd: 2_940,
        holdingMin: 1_860,
      },
      {
        ts: NOW - 3_600_000 * 62,
        symbol: 'SOL-USD',
        side: 'short',
        entry: 184.5,
        exit: 178.1,
        sizeUsd: 45_000,
        pnlUsd: 1_560,
        holdingMin: 380,
      },
    ],
  },
  {
    handle: 'funding_harvester',
    avatarHue: 160,
    style: 'basis',
    styleLabel: 'Basis trader',
    rank: 2,
    pnl30dUsd: 94_870,
    pnl30dPct: 12.8,
    winRate: 0.91,
    avgHoldingHours: 168,
    maxDrawdownPct: 2.1,
    worstMonthPct: -0.4,
    tradeCount30d: 18,
    followers: 1_612,
    aum: 740_000,
    favoriteMarkets: ['BTC-USD', 'HYPE-USD', 'BNB-USD'],
    bio: 'Pair trades and funding-rate arbitrage. Low drawdowns, steady returns, boring by design. Not for adrenaline seekers.',
    recentTrades: [
      {
        ts: NOW - 3_600_000 * 8,
        symbol: 'HYPE-USD',
        side: 'short',
        entry: 31.82,
        exit: 31.04,
        sizeUsd: 70_000,
        pnlUsd: 1_720,
        holdingMin: 480,
      },
      {
        ts: NOW - 3_600_000 * 72,
        symbol: 'BTC-USD',
        side: 'long',
        entry: 65_200,
        exit: 66_100,
        sizeUsd: 120_000,
        pnlUsd: 1_105,
        holdingMin: 4_200,
      },
    ],
  },
  {
    handle: 'sol_maxi_7',
    avatarHue: 290,
    style: 'swing',
    styleLabel: 'Directional swing',
    rank: 3,
    pnl30dUsd: 72_410,
    pnl30dPct: 44.2,
    winRate: 0.51,
    avgHoldingHours: 16,
    maxDrawdownPct: 14.8,
    worstMonthPct: -8.6,
    tradeCount30d: 92,
    followers: 1_248,
    aum: 164_000,
    favoriteMarkets: ['SOL-USD', 'JTO-USD', 'WIF-USD'],
    bio: 'High conviction, higher volatility. I size down for the klub — do not copy at 100%. Cap allocations at 30% or less.',
    recentTrades: [
      {
        ts: NOW - 3_600_000 * 4,
        symbol: 'SOL-USD',
        side: 'long',
        entry: 176.2,
        exit: 181.4,
        sizeUsd: 58_000,
        pnlUsd: 1_640,
        holdingMin: 220,
      },
      {
        ts: NOW - 3_600_000 * 18,
        symbol: 'JTO-USD',
        side: 'long',
        entry: 3.41,
        exit: 3.27,
        sizeUsd: 40_000,
        pnlUsd: -1_640,
        holdingMin: 130,
      },
    ],
  },
  {
    handle: 'gm_scalper',
    avatarHue: 210,
    style: 'scalper',
    styleLabel: 'Intraday scalper',
    rank: 4,
    pnl30dUsd: 48_120,
    pnl30dPct: 38.1,
    winRate: 0.62,
    avgHoldingHours: 0.6,
    maxDrawdownPct: 6.4,
    worstMonthPct: -2.2,
    tradeCount30d: 481,
    followers: 892,
    aum: 126_000,
    favoriteMarkets: ['BTC-USD', 'ETH-USD'],
    bio: 'Scalper. 400+ trades/month. Tight stops, thin R:R, high hit rate. Fees matter — follow only if your taker tier is T1 or better.',
    recentTrades: [
      {
        ts: NOW - 3_600_000 * 1,
        symbol: 'BTC-USD',
        side: 'short',
        entry: 67_492,
        exit: 67_398,
        sizeUsd: 32_000,
        pnlUsd: 402,
        holdingMin: 18,
      },
      {
        ts: NOW - 3_600_000 * 2,
        symbol: 'ETH-USD',
        side: 'long',
        entry: 3_281,
        exit: 3_294,
        sizeUsd: 28_000,
        pnlUsd: 111,
        holdingMin: 22,
      },
    ],
  },
  {
    handle: 'macro_mira',
    avatarHue: 340,
    style: 'trend',
    styleLabel: 'Macro trend',
    rank: 5,
    pnl30dUsd: 41_890,
    pnl30dPct: 19.4,
    winRate: 0.46,
    avgHoldingHours: 94,
    maxDrawdownPct: 11.3,
    worstMonthPct: -5.8,
    tradeCount30d: 23,
    followers: 564,
    aum: 218_000,
    favoriteMarkets: ['BTC-USD', 'ETH-USD', 'TIA-USD'],
    bio: 'Fewer but larger trades. Thesis-driven. Every position comes with a written note; every close comes with a post-mortem.',
    recentTrades: [
      {
        ts: NOW - 3_600_000 * 20,
        symbol: 'TIA-USD',
        side: 'short',
        entry: 4.81,
        exit: 4.57,
        sizeUsd: 80_000,
        pnlUsd: 4_010,
        holdingMin: 3_600,
      },
    ],
  },
  {
    handle: 'quiet_quant',
    avatarHue: 100,
    style: 'basis',
    styleLabel: 'Systematic basis',
    rank: 6,
    pnl30dUsd: 38_200,
    pnl30dPct: 9.2,
    winRate: 0.88,
    avgHoldingHours: 72,
    maxDrawdownPct: 1.8,
    worstMonthPct: -0.2,
    tradeCount30d: 14,
    followers: 492,
    aum: 412_000,
    favoriteMarkets: ['BTC-USD', 'ETH-USD', 'BNB-USD'],
    bio: 'Systematic funding-rate arbitrage. Nothing interesting happens here. That\u2019s the point.',
    recentTrades: [
      {
        ts: NOW - 3_600_000 * 30,
        symbol: 'BTC-USD',
        side: 'long',
        entry: 65_880,
        exit: 66_240,
        sizeUsd: 200_000,
        pnlUsd: 710,
        holdingMin: 2_400,
      },
    ],
  },
];

export function findLeader(handle: string): MockLeader | undefined {
  return MOCK_LEADERS.find((l) => l.handle === handle);
}
