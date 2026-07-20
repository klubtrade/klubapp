import { describe, expect, it } from "vitest";

import {
  annualizedVaultAprPct,
  estimateFundingCarryUsdc,
} from "../basis-vault/yield-math";

describe("basis yield math", () => {
  it("estimates funding carry from deployed notional, not deposited vault balance", () => {
    expect(
      estimateFundingCarryUsdc({
        deployedNotionalUsd: 200,
        annualSpreadPct: 170,
        hours: 10,
      }),
    ).toBeCloseTo(0.3881, 4);

    expect(
      estimateFundingCarryUsdc({
        deployedNotionalUsd: 4_500,
        annualSpreadPct: 170,
        hours: 10,
      }),
    ).toBeCloseTo(8.7329, 4);
  });

  it("annualizes realized user yield only when deposit time is known", () => {
    expect(
      annualizedVaultAprPct({
        depositedUsdc: 4_500,
        earnedUsdc: 0.23,
        hours: 10,
      }),
    ).toBeCloseTo(4.4773, 4);
  });

  it("returns zero for invalid inputs", () => {
    expect(
      estimateFundingCarryUsdc({
        deployedNotionalUsd: 0,
        annualSpreadPct: 170,
        hours: 10,
      }),
    ).toBe(0);
    expect(
      annualizedVaultAprPct({
        depositedUsdc: 0,
        earnedUsdc: 0.23,
        hours: 10,
      }),
    ).toBe(0);
  });
});
