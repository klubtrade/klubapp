import type { MarketSpec } from "@klub/api-client";

import type { FundingRateSnapshot } from "./funding-arb-detector.js";

const HOURS_PER_YEAR = 24 * 365;

export interface BasisStrategyPolicy {
  readonly allowedPairs: readonly string[];
  readonly minAnnualSpreadPct: number;
  readonly exitAnnualSpreadPct: number;
  readonly maxAnnualSpreadPct: number;
  readonly minVolume24hUsd: number;
  readonly minOpenInterestUsd: number;
  readonly maxGrossNotionalUsd: number;
  readonly maxLegNotionalUsd: number;
  readonly liquidityReservePct: number;
  readonly maxDrawdownPct: number;
  readonly maxSlippageBps: number;
  readonly maxNotionalImbalancePct: number;
}

export interface StrategyOpportunity {
  readonly long: FundingRateSnapshot;
  readonly short: FundingRateSnapshot;
  readonly annualSpreadPct: number;
}

export interface StrategyAccountRisk {
  readonly equityUsd: number;
  readonly availableUsd: number;
  readonly grossNotionalUsd: number;
  readonly drawdownPct: number;
  readonly reservePct: number;
}

export function defaultBasisStrategyPolicy(): BasisStrategyPolicy {
  return {
    allowedPairs: ["BTC-USD:ETH-USD", "BTC-USD:SOL-USD", "ETH-USD:SOL-USD"],
    minAnnualSpreadPct: 0.5,
    exitAnnualSpreadPct: 0.15,
    maxAnnualSpreadPct: 25,
    minVolume24hUsd: 1_000,
    minOpenInterestUsd: 1_000,
    maxGrossNotionalUsd: 200,
    maxLegNotionalUsd: 100,
    liquidityReservePct: 70,
    maxDrawdownPct: 5,
    maxSlippageBps: 20,
    maxNotionalImbalancePct: 10,
  };
}

export function selectStrategyOpportunity(
  rates: readonly FundingRateSnapshot[],
  policy: BasisStrategyPolicy,
): StrategyOpportunity | null {
  const eligible = rates.filter(
    (rate) =>
      Number.isFinite(rate.fundingRate) &&
      rate.volume24h >= policy.minVolume24hUsd &&
      rate.openInterest >= policy.minOpenInterestUsd &&
      rate.lastPrice > 0,
  );
  const candidates: StrategyOpportunity[] = [];

  for (let left = 0; left < eligible.length; left += 1) {
    for (let right = left + 1; right < eligible.length; right += 1) {
      const a = eligible[left];
      const b = eligible[right];
      if (!a || !b || !isAllowedPair(a.symbol, b.symbol, policy.allowedPairs))
        continue;
      const long = a.fundingRate <= b.fundingRate ? a : b;
      const short = long === a ? b : a;
      const annualSpreadPct =
        (short.fundingRate - long.fundingRate) * HOURS_PER_YEAR;
      if (
        annualSpreadPct < policy.minAnnualSpreadPct ||
        annualSpreadPct > policy.maxAnnualSpreadPct
      )
        continue;
      candidates.push({ long, short, annualSpreadPct });
    }
  }
  return (
    candidates.sort((a, b) => b.annualSpreadPct - a.annualSpreadPct)[0] ?? null
  );
}

export function assessStrategyRisk({
  equityUsd,
  availableUsd,
  grossNotionalUsd,
  peakEquityUsd,
}: {
  readonly equityUsd: number;
  readonly availableUsd: number;
  readonly grossNotionalUsd: number;
  readonly peakEquityUsd: number;
}): StrategyAccountRisk {
  const drawdownPct =
    peakEquityUsd > 0
      ? Math.max(0, ((peakEquityUsd - equityUsd) / peakEquityUsd) * 100)
      : 0;
  return {
    equityUsd,
    availableUsd,
    grossNotionalUsd,
    drawdownPct,
    reservePct: equityUsd > 0 ? (availableUsd / equityUsd) * 100 : 0,
  };
}

export function validateStrategyRisk(
  risk: StrategyAccountRisk,
  policy: BasisStrategyPolicy,
): string | null {
  if (risk.equityUsd <= 0) return "Strategy account has no equity.";
  if (risk.drawdownPct >= policy.maxDrawdownPct)
    return `Drawdown reached ${risk.drawdownPct.toFixed(2)}%.`;
  if (risk.reservePct < policy.liquidityReservePct)
    return `Liquidity reserve fell to ${risk.reservePct.toFixed(2)}%.`;
  if (risk.grossNotionalUsd > policy.maxGrossNotionalUsd * 1.05)
    return "Gross notional exceeded the configured limit.";
  return null;
}

export function buildLegOrder({
  symbol,
  isBuy,
  reduceOnly,
  notionalUsd,
  markPrice,
  market,
  maxSlippageBps,
}: {
  readonly symbol: string;
  readonly isBuy: boolean;
  readonly reduceOnly: boolean;
  readonly notionalUsd: number;
  readonly markPrice: number;
  readonly market: MarketSpec;
  readonly maxSlippageBps: number;
}) {
  const lot = Number(market.lotSize);
  const tick = Number(market.tickSize);
  if (!(lot > 0) || !(tick > 0) || !(markPrice > 0))
    throw new Error(`Invalid market specification for ${symbol}.`);
  if (notionalUsd < market.minNotional)
    throw new Error(
      `${symbol} requires at least $${market.minNotional} notional.`,
    );
  const rawSize = notionalUsd / markPrice;
  const size = floorToIncrement(rawSize, lot);
  if (size <= 0) throw new Error(`${symbol} order is below its minimum lot.`);
  const slippage = maxSlippageBps / 10_000;
  const rawLimit = markPrice * (isBuy ? 1 + slippage : 1 - slippage);
  const price = isBuy
    ? ceilToIncrement(rawLimit, tick)
    : floorToIncrement(rawLimit, tick);
  return {
    type: "order" as const,
    symbol,
    isBuy,
    price,
    size,
    reduceOnly,
    iso: false,
    orderType: { type: "limit" as const, tif: "IOC" as const },
  };
}

function isAllowedPair(a: string, b: string, allowedPairs: readonly string[]) {
  return (
    allowedPairs.includes(`${a}:${b}`) || allowedPairs.includes(`${b}:${a}`)
  );
}

function floorToIncrement(value: number, increment: number): number {
  return Number((Math.floor(value / increment) * increment).toPrecision(12));
}

function ceilToIncrement(value: number, increment: number): number {
  return Number((Math.ceil(value / increment) * increment).toPrecision(12));
}
