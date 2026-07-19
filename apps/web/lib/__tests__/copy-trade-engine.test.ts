import { describe, expect, it } from "vitest";

import { detectSignals, type Follow } from "../copy-trade/engine";

describe("copy-trade engine", () => {
  it("can surface existing leader positions for a new follow", () => {
    const follow: Follow = {
      leaderPubkey: "leader",
      allocationPct: 10,
      createdAt: 1,
      baselineSymbols: [],
      mirroredSymbols: [],
      mirrorExistingOnFollow: true,
    };

    const signals = detectSignals(
      follow,
      [{ symbol: "BTC-USD", sizeBase: 0.1, entryPrice: 50_000 }],
      1_000,
      2,
    );

    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      action: "open",
      side: "long",
      symbol: "BTC-USD",
      mirrorNotionalUsd: 100,
    });
  });

  it("does not reopen positions already captured in the baseline", () => {
    const follow: Follow = {
      leaderPubkey: "leader",
      allocationPct: 10,
      createdAt: 1,
      baselineSymbols: ["BTC-USD"],
      mirroredSymbols: [],
      lastKnownPositions: { "BTC-USD": 0.1 },
    };

    expect(
      detectSignals(
        follow,
        [{ symbol: "BTC-USD", sizeBase: 0.1, entryPrice: 50_000 }],
        1_000,
        2,
      ),
    ).toEqual([]);
  });
});
