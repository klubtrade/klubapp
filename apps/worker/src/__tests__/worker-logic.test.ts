import { describe, expect, it } from "vitest";

import { formatAlertText } from "../notifications/telegram.js";
import { signAndSubmit } from "../signing/bulk-execution.js";
import { composeAlertMessage, tierCrossed } from "../workers/alerts-worker.js";
import { computeMirroredSize } from "../workers/copy-trade-worker.js";

const alert = {
  userId: "user-1",
  symbol: "BTC-USD",
  tier: 0.1 as const,
  bufferPct: 0.1,
  liqPrice: 60_000,
  markPrice: 66_000,
  positionSizeBase: 0.1,
  side: "long" as const,
  detectedAt: 1,
};

describe("worker risk helpers", () => {
  it("returns the most severe tier crossed during a decline", () => {
    expect(tierCrossed(0.3, 0.09)).toBe(0.1);
    expect(tierCrossed(0.09, 0.12)).toBeNull();
  });

  it("formats fractional buffers as percentages", () => {
    expect(composeAlertMessage(alert).body).toContain("Buffer 10.0%");
    expect(formatAlertText(alert)).toContain("*10.0%* buffer");
  });

  it("sizes copied positions from the follower allocation cap", () => {
    expect(
      computeMirroredSize({
        leaderEntryPrice: 50_000,
        followerEquityUsd: 5_000,
        maxAllocationPct: 20,
      }),
    ).toBeCloseTo(0.02);
  });

  it("fails closed while the canonical execution gateway is unavailable", async () => {
    await expect(
      signAndSubmit({
        agentWalletPublicKey: "agent",
        symbol: "BTC-USD",
        side: "long",
        sizeBase: 0.01,
        orderType: "market",
        price: 50_000,
        leaderEventId: "leader-event-1",
      }),
    ).rejects.toThrow("execution gateway is not configured");
  });
});
