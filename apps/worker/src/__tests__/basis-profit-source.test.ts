import { describe, expect, it, vi } from "vitest";

import {
  latestSourceTimestamp,
  realizedFundingPnlUsd,
  selectCreditablePnlUsd,
} from "../workers/basis-profit-source.js";

describe("Basis profit source", () => {
  it("uses the freshest positive realized source without crediting unrealized PnL", () => {
    expect(
      selectCreditablePnlUsd({
        historyNetPnlUsd: 0,
        liveRealizedNetPnlUsd: 12.34,
      }),
    ).toBe(12.34);
    expect(
      selectCreditablePnlUsd({
        historyNetPnlUsd: 15,
        liveRealizedNetPnlUsd: 12.34,
      }),
    ).toBe(15);
  });

  it("derives live creditable PnL from realized, funding, and fees only", () => {
    expect(
      realizedFundingPnlUsd({
        realizedPnlUsd: 10,
        fundingPnlUsd: 2.345,
        feesUsd: -0.111,
      }),
    ).toBe(12.23);
  });

  it("uses the wall-clock timestamp only when live PnL exists before history arrives", () => {
    vi.setSystemTime(new Date("2026-07-19T12:00:00.000Z"));

    expect(latestSourceTimestamp([], [], 0)).toBe(0n);
    expect(latestSourceTimestamp([], [], 1)).toBe(
      BigInt(Date.parse("2026-07-19T12:00:00.000Z")),
    );
    expect(
      latestSourceTimestamp([{ timestamp: 10 }], [{ timestamp: 20 }], 1),
    ).toBe(20n);

    vi.useRealTimers();
  });
});
