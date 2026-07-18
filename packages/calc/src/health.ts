export interface HealthPosition {
  readonly symbol: string;
  readonly size: number;
  readonly entryPrice: number;
  readonly markPrice: number;
  readonly liqPrice: number;
  readonly maintenanceMarginUsd: number;
  readonly funding8hRate: number;
}

export interface HealthInput {
  readonly equityUsd: number;
  readonly collateralUsd: number;
  readonly positions: readonly HealthPosition[];
}

export type HealthBand = "healthy" | "fine" | "caution" | "risky" | "critical";

export interface SubScore {
  readonly score: number;
  readonly label: string;
  readonly rawValue: number;
  readonly rawUnit: "fraction" | "multiple" | "usd";
}

export interface HealthOutput {
  readonly score: number;
  readonly band: HealthBand;
  readonly subscores: {
    readonly liquidationProximity: SubScore;
    readonly leverageExposure: SubScore;
    readonly concentrationRisk: SubScore;
    readonly fundingBurn: SubScore;
  };
  readonly recommendations: readonly string[];
}

const WEIGHT_LIQ_PROXIMITY = 0.4;
const WEIGHT_LEVERAGE = 0.25;
const WEIGHT_CONCENTRATION = 0.2;
const WEIGHT_FUNDING = 0.15;

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

function scoreFunding(input: HealthInput): SubScore {
  let fundingPerDay = 0;
  for (const p of input.positions) {
    const notional = Math.abs(p.size) * p.markPrice;
    const fundingSign = p.size > 0 ? 1 : -1;
    const per8h = notional * p.funding8hRate * fundingSign;
    if (per8h > 0) {
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

export interface StressTestInput {
  readonly shockFrac: number;
  readonly correlated?: boolean;
  readonly shouldApply?: (pos: HealthPosition) => boolean;
}

export interface StressTestOutput {
  readonly shockedEquityUsd: number;
  readonly liquidatedPositions: readonly string[];
  readonly survivingPositions: readonly string[];
  readonly shockPnl: number;
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

    const isLong = p.size > 0;
    const liquidatedHere = isLong ? mark <= p.liqPrice : mark >= p.liqPrice;

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
