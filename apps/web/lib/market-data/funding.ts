export const MAX_STABLE_ANNUAL_FUNDING_PCT = 200;

export interface FundingPriceInput {
  readonly symbol: string;
  readonly fundingRate: number;
  readonly fundingRateAnnualized?: number;
  readonly updatedAt: number;
}

export interface NormalizedFunding {
  readonly symbol: string;
  readonly hourlyPct: number;
  readonly eightHourPct: number;
  readonly annualPct: number;
  readonly rate: number;
  readonly annualizedPct: number;
  readonly updatedAt: number;
  readonly unstable: boolean;
}

export function normalizeFunding(p: FundingPriceInput): NormalizedFunding {
  const hourlyPct = p.fundingRate * 100;
  const eightHourPct = hourlyPct * 8;
  const annualPct =
    p.fundingRateAnnualized !== undefined
      ? p.fundingRateAnnualized * 100
      : hourlyPct * 24 * 365;

  return {
    symbol: p.symbol,
    hourlyPct,
    eightHourPct,
    annualPct,
    rate: hourlyPct,
    annualizedPct: annualPct,
    updatedAt: p.updatedAt,
    unstable: Math.abs(annualPct) > MAX_STABLE_ANNUAL_FUNDING_PCT,
  };
}
