import type { MarketSymbol } from "../markets";
import type { NormalizedFunding } from "../market-data/funding";

export interface BasisOpportunity {
  readonly longSymbol: MarketSymbol;
  readonly shortSymbol: MarketSymbol;
  readonly longAnnualPct: number;
  readonly shortAnnualPct: number;
  readonly netAnnualPct: number;
}

export function buildBasisOpportunities(
  symbols: readonly MarketSymbol[],
  funding: Readonly<Record<string, NormalizedFunding | undefined>>,
  tickers: Readonly<Record<string, { readonly mark: number } | undefined>>,
): readonly BasisOpportunity[] {
  const rows = symbols
    .map((symbol) => ({
      symbol,
      annualPct: funding[symbol]?.annualPct,
      unstable: funding[symbol]?.unstable,
      mark: tickers[symbol]?.mark,
    }))
    .filter(
      (
        row,
      ): row is {
        symbol: MarketSymbol;
        annualPct: number;
        unstable: false | undefined;
        mark: number;
      } =>
        typeof row.annualPct === "number" &&
        Number.isFinite(row.annualPct) &&
        row.unstable !== true &&
        typeof row.mark === "number" &&
        Number.isFinite(row.mark) &&
        row.mark > 0,
    );

  const out: BasisOpportunity[] = [];
  for (const long of rows) {
    for (const short of rows) {
      if (long.symbol === short.symbol) continue;
      const netAnnualPct = short.annualPct - long.annualPct;
      if (netAnnualPct <= 0) continue;
      out.push({
        longSymbol: long.symbol,
        shortSymbol: short.symbol,
        longAnnualPct: long.annualPct,
        shortAnnualPct: short.annualPct,
        netAnnualPct,
      });
    }
  }
  return out.sort((a, b) => b.netAnnualPct - a.netAnnualPct);
}
