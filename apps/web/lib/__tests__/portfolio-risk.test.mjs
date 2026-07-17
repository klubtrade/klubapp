import { describe, expect, it } from "vitest";

import { buildPortfolioRiskView } from "../portfolio-risk.ts";

function health(overrides = {}) {
  return {
    score: 72,
    band: "caution",
    subscores: {
      liquidationProximity: {
        score: 70,
        label: "Watch it",
        rawValue: 0.18,
        rawUnit: "fraction",
      },
      leverageExposure: {
        score: 70,
        label: "",
        rawValue: 2,
        rawUnit: "multiple",
      },
      concentrationRisk: {
        score: 70,
        label: "",
        rawValue: 0.5,
        rawUnit: "fraction",
      },
      fundingBurn: { score: 70, label: "", rawValue: 1, rawUnit: "usd" },
    },
    recommendations: ["Reduce the closest position."],
    ...overrides,
  };
}

describe("portfolio risk view", () => {
  it("distinguishes loading, flat, and unavailable states", () => {
    expect(
      buildPortfolioRiskView({ positionCount: null, result: null }),
    ).toEqual({ state: "loading" });
    expect(buildPortfolioRiskView({ positionCount: 0, result: null })).toEqual({
      state: "flat",
    });
    expect(buildPortfolioRiskView({ positionCount: 2, result: null })).toEqual({
      state: "unavailable",
    });
  });

  it("surfaces the closest liquidation buffer and first action", () => {
    expect(
      buildPortfolioRiskView({ positionCount: 1, result: health() }),
    ).toEqual({
      state: "active",
      score: 72,
      bufferPct: 18,
      level: "watch",
      recommendation: "Reduce the closest position.",
    });
  });

  it("fails closed for an invalid liquidation buffer", () => {
    const result = health({
      band: "critical",
      subscores: {
        ...health().subscores,
        liquidationProximity: {
          ...health().subscores.liquidationProximity,
          rawValue: Number.NaN,
        },
      },
    });
    expect(buildPortfolioRiskView({ positionCount: 1, result })).toMatchObject({
      state: "active",
      level: "critical",
      bufferPct: 0,
    });
  });
});
