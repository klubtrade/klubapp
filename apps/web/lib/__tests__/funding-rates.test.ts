import { describe, expect, it } from "vitest";

import {
  normalizeFunding,
  type FundingPriceInput,
} from "../market-data/funding";

function price(overrides: Partial<FundingPriceInput> = {}): FundingPriceInput {
  return {
    symbol: "BTC-USD",
    fundingRate: 0.0000125,
    updatedAt: 1,
    ...overrides,
  };
}

describe("Bulk funding normalization", () => {
  it("converts Bulk's fractional hourly rate to display percentages", () => {
    const funding = normalizeFunding(price());
    expect(funding.hourlyPct).toBeCloseTo(0.00125);
    expect(funding.eightHourPct).toBeCloseTo(0.01);
    expect(funding.annualPct).toBeCloseTo(10.95);
    expect(funding.unstable).toBe(false);
  });

  it("prefers the venue-provided annualized value", () => {
    const funding = normalizeFunding(
      price({ fundingRate: 0.0012543955, fundingRateAnnualized: 10.98850464 }),
    );
    expect(funding.annualPct).toBeCloseTo(1098.850464);
    expect(funding.unstable).toBe(true);
  });
});
