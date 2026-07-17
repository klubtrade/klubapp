// packages/calc/src/health.ts
/**
 * Portfolio Health Score.
 *
 * A single 0–100 score, decomposed into four subscores that each tell
 * the user something actionable:
 *
 *   1. Liquidation proximity (weight 40%) — how close the riskiest
 *      position is to being liquidated.
 *   2. Leverage exposure (weight 25%)    — blended effective leverage.
 *   3. Concentration risk (weight 20%)   — Herfindahl-style concentration.
 *   4. Funding burn rate (weight 15%)    — share of equity consumed by
 *      funding payments per day at current rates.
 *
 * Design intent: the subscores should be boring, explainable, and
 * survive being screenshotted. No black boxes. Every component has a
 * transparent formula with thresholds a human can argue about.
 *
 * Stress-test: given a market-wide directional shock, returns the
 * hypothetical state of each position, flagging which get liquidated
 * and the resulting equity.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** A single open position — subset of Bulk's Position type, as numbers. */
export interface HealthPosition {
  readonly symbol: string;
  /** Signed size in base units. Positive = long, negative = short. */
  readonly size: number;
  readonly entryPrice: number;
  readonly markPrice: number;
  readonly liqPrice: number;
  /** Maintenance margin requirement for this position, in USDC. */
  readonly maintenanceMarginUsd: number;
  /** Current funding rate per 8h as a decimal. */
  readonly funding8hRate: number;
}

export interface HealthInput {
  readonly equityUsd: number;
  readonly collateralUsd: number;
  readonly positions: readonly HealthPosition[];
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export type HealthBand = "healthy" | "fine" | "caution" | "risky" | "critical";

export interface SubScore {
  /** 0–100, higher is better. */
  readonly score: number;
  /** Plain-English interpretation. */
  readonly label: string;
  /** Raw value feeding the score (for transparency). */
  readonly rawValue: number;
  /** Unit of the raw value. */
  readonly rawUnit: "fraction" | "multiple" | "usd";
}

export interface HealthOutput {
  /** Overall weighted score, 0–100. */
  readonly score: number;
  readonly band: HealthBand;
  readonly subscores: {
    readonly liquidationProximity: SubScore;
    readonly leverageExposure: SubScore;
    readonly concentrationRisk: SubScore;
    readonly fundingBurn: SubScore;
  };
  /** Plain-English recommendations, ordered by priority. */
  readonly recommendations: readonly string[];
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const WEIGHT_LIQ_PROXIMITY = 0.4;
const WEIGHT_LEVERAGE = 0.25;
const WEIGHT_CONCENTRATION = 0.2;
const WEIGHT_FUNDING = 0.15;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Compute the health score for a portfolio.
 *
 * If there are no open positions, score is 100 (you can't liquidate a
 * flat book).
 */
export function healthScore(input: HealthInput): HealthOutput {
  if (input.positions.length === 0) {
    return flatBookResponse();
  }
  if (input.equityUsd <= 0) {
    return underwaterResponse();
  }

  const liqProx = scoreLiqProximity(input);
  const lev = scoreLeverage(input);
  const conc = scoreConcentration(input);
  const fund = scoreFunding(input);

  const weighted =
    liqProx.score * WEIGHT_LIQ_PROXIMITY +
    lev.score * WEIGHT_LEVERAGE +
    conc.score * WEIGHT_CONCENTRATION +
    fund.score * WEIGHT_FUNDING;
  // A weighted average must never let otherwise-safe dimensions hide an
  // immediate liquidation threat. Red/orange alert tiers therefore cap the
  // overall score in the matching critical/risky band.
  const score = Math.min(
    Math.round(clamp(weighted, 0, 100)),
    liquidationRiskScoreCap(liqProx.rawValue),
  );

  const recommendations = buildRecommendations({
    liqProx,
    lev,
    conc,
    fund,
    positions: input.positions,
  });

  return {
    score,
    band: bandFor(score),
    subscores: {
      liquidationProximity: liqProx,
      leverageExposure: lev,
      concentrationRisk: conc,
      fundingBurn: fund,
    },
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Subscore: liquidation proximity
// ---------------------------------------------------------------------------

/**
 * Score is driven by the CLOSEST-to-liquidation position in the book.
 * Buffer is expressed as (distance to liq) / mark.
 *
 * Mapping (buffer → score):
 *   ≥ 40%   → 100 (comfortable)
 *   25%     → 80  (our "yellow" alert tier cutoff)
 *   10%     → 50  (orange alert)
 *   3%      → 20  (red alert)
 *   0%      → 0   (on the edge)
 *
 * Piecewise linear between anchors. The alert tiers in the product UI
 * map directly to these thresholds — they're the same number.
 */
function scoreLiqProximity(input: HealthInput): SubScore {
  let minBuffer = Infinity;
  for (const p of input.positions) {
    if (p.size === 0) continue;
    const isLong = p.size > 0;
    const buffer = isLong
      ? (p.markPrice - p.liqPrice) / p.markPrice
      : (p.liqPrice - p.markPrice) / p.markPrice;
    if (buffer < minBuffer) minBuffer = buffer;
  }
  if (!Number.isFinite(minBuffer)) {
    return {
      score: 100,
      label: "No active positions",
      rawValue: 1,
      rawUnit: "fraction",
    };
  }

  const bufferPct = minBuffer;
  const score = piecewise(bufferPct, [
    [0, 0],
    [0.03, 20],
    [0.1, 50],
    [0.25, 80],
    [0.4, 100],
  ]);

  return {
    score,
    label: labelForBuffer(bufferPct),
    rawValue: bufferPct,
    rawUnit: "fraction",
  };
}

function labelForBuffer(b: number): string {
  if (b >= 0.4) return "Comfortable buffer";
  if (b >= 0.25) return "Healthy buffer";
  if (b >= 0.1) return "Watching closely";
  if (b >= 0.03) return "Tight — add margin";
  return "On the edge";
}

function liquidationRiskScoreCap(buffer: number): number {
  if (buffer <= 0) return 0;
  if (buffer <= 0.03) return 19;
  if (buffer <= 0.1) return 39;
  return 100;
}

// ---------------------------------------------------------------------------
// Subscore: leverage exposure
// ---------------------------------------------------------------------------

/**
 * Effective leverage = sum(|notional|) / equity.
 *
 * Mapping:
 *   ≤ 2×   → 100 (conservative)
 *   3×     → 90
 *   5×     → 70
 *   10×    → 40
 *   20×    → 10
 *   ≥ 30×  → 0
 */
function scoreLeverage(input: HealthInput): SubScore {
  let grossNotional = 0;
  for (const p of input.positions) {
    grossNotional += Math.abs(p.size) * p.markPrice;
  }
  const effLev = grossNotional / input.equityUsd;

  const score = piecewise(
    effLev,
    [
      [0, 100],
      [2, 100],
      [3, 90],
      [5, 70],
      [10, 40],
      [20, 10],
      [30, 0],
    ],
    /* monotonicallyIncreasing */ false,
  );

  let label: string;
  if (effLev <= 2) label = "Conservative";
  else if (effLev <= 5) label = "Moderate";
  else if (effLev <= 10) label = "Aggressive";
  else label = "Extreme";

  return { score, label, rawValue: effLev, rawUnit: "multiple" };
}

// ---------------------------------------------------------------------------
// Subscore: concentration
// ---------------------------------------------------------------------------

/**
 * Herfindahl–Hirschman Index on |notional| shares.
 *   HHI = Σ(share_i²)
 *
 * HHI = 1     → entirely one asset
 * HHI = 1/n   → perfectly diversified across n positions
 *
 * Mapping:
 *   ≤ 0.3   → 100 (well diversified, ≥ ~4 positions)
 *   0.5     → 80  (balanced, 2–3 positions)
 *   0.7     → 60
 *   0.9     → 30
 *   1.0     → 15  (single-position book — still okay if the one trade is sized well)
 */
function scoreConcentration(input: HealthInput): SubScore {
  let totalNotional = 0;
  const perSymbol = new Map<string, number>();
  for (const p of input.positions) {
    const n = Math.abs(p.size) * p.markPrice;
    totalNotional += n;
    perSymbol.set(p.symbol, (perSymbol.get(p.symbol) ?? 0) + n);
  }
  if (totalNotional === 0) {
    return {
      score: 100,
      label: "No exposure",
      rawValue: 0,
      rawUnit: "fraction",
    };
  }

  let hhi = 0;
  for (const n of perSymbol.values()) {
    const share = n / totalNotional;
    hhi += share * share;
  }

  const score = piecewise(
    hhi,
    [
      [0, 100],
      [0.3, 100],
      [0.5, 80],
      [0.7, 60],
      [0.9, 30],
      [1.0, 15],
    ],
    /* monotonicallyIncreasing */ false,
  );

  let label: string;
  if (hhi <= 0.3) label = "Well diversified";
  else if (hhi <= 0.6) label = "Balanced";
  else if (hhi < 1) label = "Concentrated";
  else label = "Single position";

  return { score, label, rawValue: hhi, rawUnit: "fraction" };
}

// ---------------------------------------------------------------------------
// Subscore: funding burn
// ---------------------------------------------------------------------------

/**
 * Total funding cost per day as a fraction of equity. Only counts
 * positions that are *paying* funding (ignores ones earning).
 *
 * Mapping:
 *   ≤ 0.05%/day → 100 (negligible)
 *   0.2%        → 80
 *   0.5%        → 60
 *   1%          → 30
 *   ≥ 2%        → 0   (you're being taxed to death)
 */
function scoreFunding(input: HealthInput): SubScore {
  let fundingPerDay = 0;
  for (const p of input.positions) {
    const notional = Math.abs(p.size) * p.markPrice;
    const fundingSign = p.size > 0 ? 1 : -1;
    const per8h = notional * p.funding8hRate * fundingSign;
    if (per8h > 0) {
      // Only pays, not receives
      fundingPerDay += per8h * 3;
    }
  }
  const rate = fundingPerDay / input.equityUsd;

  const score = piecewise(
    rate,
    [
      [0, 100],
      [0.0005, 100],
      [0.002, 80],
      [0.005, 60],
      [0.01, 30],
      [0.02, 0],
    ],
    /* monotonicallyIncreasing */ false,
  );

  let label: string;
  if (rate <= 0.0005) label = "Negligible";
  else if (rate <= 0.005) label = "Manageable";
  else if (rate <= 0.01) label = "High";
  else label = "Bleeding";

  return { score, label, rawValue: rate, rawUnit: "fraction" };
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function buildRecommendations(args: {
  readonly liqProx: SubScore;
  readonly lev: SubScore;
  readonly conc: SubScore;
  readonly fund: SubScore;
  readonly positions: readonly HealthPosition[];
}): readonly string[] {
  const recs: string[] = [];

  if (args.liqProx.score < 50) {
    const closest = closestToLiq(args.positions);
    if (closest) {
      recs.push(
        `${closest.symbol} is your most at-risk position. Add margin or reduce size to widen the liquidation buffer.`,
      );
    }
  }
  if (args.lev.score < 50) {
    recs.push(
      `Effective leverage is ${args.lev.rawValue.toFixed(1)}×. Consider reducing gross exposure — one adverse move can wipe out the book.`,
    );
  }
  if (args.conc.score < 50) {
    recs.push(
      "Your book is concentrated in one asset. Consider diversifying so a single liquidation doesn\u2019t end the day.",
    );
  }
  if (args.fund.score < 50) {
    recs.push(
      `Funding is costing ${(args.fund.rawValue * 100).toFixed(2)}% of equity per day. If you don\u2019t have a near-term target, close the trade or flip to the other side of the funding.`,
    );
  }
  return recs;
}

function closestToLiq(
  positions: readonly HealthPosition[],
): HealthPosition | undefined {
  let best: HealthPosition | undefined;
  let bestBuffer = Infinity;
  for (const p of positions) {
    if (p.size === 0) continue;
    const isLong = p.size > 0;
    const buffer = isLong
      ? (p.markPrice - p.liqPrice) / p.markPrice
      : (p.liqPrice - p.markPrice) / p.markPrice;
    if (buffer < bestBuffer) {
      bestBuffer = buffer;
      best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Stress test
// ---------------------------------------------------------------------------

export interface StressTestInput {
  /** Directional shock as a fraction (e.g. -0.1 = market drops 10%). */
  readonly shockFrac: number;
  /**
   * Whether the shock is correlated across all assets (default true).
   * If false, shock applies only to positions where `shouldApply(pos)`
   * returns true — used for single-asset stress tests.
   */
  readonly correlated?: boolean;
  readonly shouldApply?: (pos: HealthPosition) => boolean;
}

export interface StressTestOutput {
  readonly shockedEquityUsd: number;
  readonly liquidatedPositions: readonly string[];
  readonly survivingPositions: readonly string[];
  /** Total PnL from the shock (negative = loss). */
  readonly shockPnl: number;
  /** Overall health score AFTER the shock. */
  readonly shockedScore: number;
}

export function stressTest(
  portfolio: HealthInput,
  stress: StressTestInput,
): StressTestOutput {
  const correlated = stress.correlated ?? true;
  const liquidated: string[] = [];
  const surviving: string[] = [];
  const shockedPositions: HealthPosition[] = [];
  let shockPnl = 0;

  for (const p of portfolio.positions) {
    const apply =
      correlated && !stress.shouldApply
        ? true
        : (stress.shouldApply?.(p) ?? false);
    const mark = apply ? p.markPrice * (1 + stress.shockFrac) : p.markPrice;

    // Detect liquidation — for longs, liquidated if mark ≤ liqPrice.
    const isLong = p.size > 0;
    const liquidatedHere = isLong ? mark <= p.liqPrice : mark >= p.liqPrice;

    // PnL from this shock
    const move = mark - p.markPrice;
    const positionPnl = isLong ? p.size * move : p.size * move; // signed
    shockPnl += positionPnl;

    if (liquidatedHere) {
      liquidated.push(p.symbol);
    } else {
      surviving.push(p.symbol);
      shockedPositions.push({ ...p, markPrice: mark });
    }
  }

  const shockedEquity = portfolio.equityUsd + shockPnl;
  const post = healthScore({
    ...portfolio,
    equityUsd: Math.max(0.01, shockedEquity),
    positions: shockedPositions,
  });

  return {
    shockedEquityUsd: shockedEquity,
    liquidatedPositions: liquidated,
    survivingPositions: surviving,
    shockPnl,
    shockedScore: post.score,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flatBookResponse(): HealthOutput {
  const max: SubScore = {
    score: 100,
    label: "No exposure",
    rawValue: 0,
    rawUnit: "fraction",
  };
  return {
    score: 100,
    band: "healthy",
    subscores: {
      liquidationProximity: max,
      leverageExposure: max,
      concentrationRisk: max,
      fundingBurn: max,
    },
    recommendations: [],
  };
}

function underwaterResponse(): HealthOutput {
  const zero: SubScore = {
    score: 0,
    label: "Underwater",
    rawValue: 0,
    rawUnit: "usd",
  };
  return {
    score: 0,
    band: "critical",
    subscores: {
      liquidationProximity: zero,
      leverageExposure: zero,
      concentrationRisk: zero,
      fundingBurn: zero,
    },
    recommendations: [
      "Account equity is zero or negative. Close positions and re-fund.",
    ],
  };
}

export function bandFor(score: number): HealthBand {
  if (score >= 80) return "healthy";
  if (score >= 60) return "fine";
  if (score >= 40) return "caution";
  if (score >= 20) return "risky";
  return "critical";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Piecewise-linear interpolation between anchor points. Anchors must be
 * given in increasing order of `x`. If `monotonicallyIncreasing` is
 * true, values outside the range clamp to the edge scores; if false,
 * the mapping is "higher x means worse" and we clamp accordingly.
 */
function piecewise(
  x: number,
  anchors: readonly (readonly [number, number])[],
  monotonicallyIncreasing = true,
): number {
  if (anchors.length === 0) return 0;
  const first = anchors[0]!;
  const last = anchors[anchors.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1]!;
    const curr = anchors[i]!;
    if (x >= prev[0] && x <= curr[0]) {
      const t = (x - prev[0]) / (curr[0] - prev[0]);
      return prev[1] + t * (curr[1] - prev[1]);
    }
  }
  return monotonicallyIncreasing ? last[1] : first[1];
}
