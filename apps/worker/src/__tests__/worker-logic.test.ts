import { describe, expect, it } from "vitest";

import { formatAlertText } from "../notifications/telegram.js";
import { signAndSubmit } from "../signing/bulk-execution.js";
import { createNodeKeychainAdapter } from "../signing/keychain-adapter.js";
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

describe("Bulk native keychain adapter", () => {
  const account = "Vote111111111111111111111111111111111111111";
  const recipient = "11111111111111111111111111111111";

  it("prepares canonical Builder Code approval and revocation actions", () => {
    const keychain = createNodeKeychainAdapter();
    const approval = keychain.prepareApproveBuilderCode(recipient, 5, {
      account,
      nonce: 42,
    });
    const revocation = keychain.prepareRevokeBuilderCode(recipient, {
      account,
      nonce: 43,
    });

    expect(JSON.parse(String(approval.actions))).toEqual([
      { abc: { fee: 5, to: recipient } },
    ]);
    expect(JSON.parse(String(revocation.actions))).toEqual([
      { rbc: { to: recipient } },
    ]);
    expect(approval.messageBytes.length).toBeGreaterThan(64);
    expect(revocation.messageBytes.length).toBeGreaterThan(64);
  });

  it("includes builderCode only when explicitly supplied to an order", () => {
    const keychain = createNodeKeychainAdapter();
    const base = {
      type: "order" as const,
      symbol: "BTC-USD",
      isBuy: true,
      price: 0 as const,
      size: 0.1,
      reduceOnly: false,
      iso: false,
      orderType: {
        type: "market" as const,
        isMarket: true as const,
        triggerPx: 0 as const,
      },
    };
    const plain = keychain.prepareOrder(base, { account, nonce: 44 });
    const routed = keychain.prepareOrder(
      { ...base, builderCode: { to: recipient, fee: 5 } },
      { account, nonce: 45 },
    );

    expect(JSON.parse(String(plain.actions))[0].m).not.toHaveProperty(
      "builderCode",
    );
    expect(JSON.parse(String(routed.actions))[0].m.builderCode).toEqual({
      to: recipient,
      fee: 5,
    });
  });
});
