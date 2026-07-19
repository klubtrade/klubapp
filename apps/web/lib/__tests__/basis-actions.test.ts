import { describe, expect, it } from "vitest";

import {
  initialAmountForAction,
  isValidWithdrawAmount,
  maxWithdrawAmount,
} from "../basis-vault/actions";

describe("Basis vault actions", () => {
  it("uses the live withdrawable balance instead of the deposit default", () => {
    expect(
      initialAmountForAction({
        action: "withdraw",
        depositAmount: 1_000,
        withdrawableUsdc: 500,
      }),
    ).toBe(500);
  });

  it("supports six-decimal max withdrawals without exceeding the balance", () => {
    expect(maxWithdrawAmount(500.1234569)).toBe(500.123456);
    expect(isValidWithdrawAmount(500.123456, 500.1234569)).toBe(true);
    expect(isValidWithdrawAmount(500.123457, 500.1234569)).toBe(false);
  });

  it("rejects empty and invalid withdrawals", () => {
    expect(isValidWithdrawAmount(0, 500)).toBe(false);
    expect(isValidWithdrawAmount(Number.NaN, 500)).toBe(false);
    expect(maxWithdrawAmount(-1)).toBe(0);
  });
});
