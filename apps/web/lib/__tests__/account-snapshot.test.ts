import { describe, expect, it } from "vitest";

import { snapshotFromAccountUpdate } from "../bulk/account-snapshot";

describe("Bulk account live snapshots", () => {
  it("maps a WebSocket account update without marking it unavailable", () => {
    const snapshot = snapshotFromAccountUpdate(
      {
        user: "wallet",
        equityUsd: 1_025,
        positions: [
          {
            s: "BTC-USD",
            sz: 0.01,
            entryPx: 60_000,
            markPx: 61_000,
            liqPx: 40_000,
            unrealizedPnl: 10,
            fundingAccrued: 0,
            leverage: 5,
          },
        ],
        ts: 123,
      },
      null,
    );

    expect(snapshot.equityUsd).toBe(1_025);
    expect(snapshot.unrealizedPnlUsd).toBe(10);
    expect(snapshot.positions[0]).toMatchObject({
      symbol: "BTC-USD",
      sizeBase: 0.01,
      fairPrice: 61_000,
    });
    expect(snapshot.unavailable).toBe(false);
    expect(snapshot.stale).toBe(false);
  });

  it("preserves REST-only fields while applying live balances", () => {
    const previous = {
      equityUsd: 1_000,
      unrealizedPnlUsd: 0,
      freeMarginUsd: 900,
      positions: [],
      openOrders: [],
      kind: "MasterEOA" as const,
      parent: null,
      subAccounts: [{ pubkey: "pot", name: "Trading" }],
      unavailable: false,
      stale: false,
      warning: null,
      raw: {},
    };
    const snapshot = snapshotFromAccountUpdate(
      { user: "wallet", equityUsd: 1_010, positions: [], ts: 124 },
      previous,
    );

    expect(snapshot.freeMarginUsd).toBe(900);
    expect(snapshot.subAccounts).toEqual(previous.subAccounts);
  });
});
