import { describe, expect, it } from "vitest";

import { buildBasisOpportunities } from "../basis-vault/opportunities";
import type { NormalizedFunding } from "../market-data/funding";
import type { MarketSymbol } from "../markets";

const symbols = [
  "BTC-USD",
  "ETH-USD",
  "BNB-USD",
] as const satisfies readonly MarketSymbol[];

function funding(
  symbol: MarketSymbol,
  annualPct: number,
  unstable = false,
): NormalizedFunding {
  return {
    symbol,
    hourlyPct: annualPct / 8760,
    eightHourPct: (annualPct / 8760) * 8,
    annualPct,
    rate: annualPct / 8760,
    annualizedPct: annualPct,
    updatedAt: 1,
    unstable,
  };
}

describe("buildBasisOpportunities", () => {
  it("does not market extreme testnet funding as a Basis return", () => {
    const result = buildBasisOpportunities(
      symbols,
      {
        "BTC-USD": funding("BTC-USD", 10),
        "ETH-USD": funding("ETH-USD", 40),
        "BNB-USD": funding("BNB-USD", 1_098, true),
      },
      {
        "BTC-USD": { mark: 64_000 },
        "ETH-USD": { mark: 3_000 },
        "BNB-USD": { mark: 570 },
      },
    );

    expect(result[0]).toMatchObject({
      longSymbol: "BTC-USD",
      shortSymbol: "ETH-USD",
      netAnnualPct: 30,
    });
    expect(result.some((row) => row.shortSymbol === "BNB-USD")).toBe(false);
  });
});
