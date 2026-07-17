import { describe, expect, it } from "vitest";

import { formatAlertText } from "../notifications/telegram.js";
import {
  createCanonicalCopyTradeExecutor,
  disabledCopyTradeExecutor,
} from "../signing/bulk-execution.js";
import {
  createNodeKeychainAdapter,
  getNativeAgentPublicKey,
  signPreparedWithAgentSecret,
} from "../signing/keychain-adapter.js";
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
      disabledCopyTradeExecutor.submit({
        agentWalletId: "wallet-1",
        agentWalletPublicKey: "agent",
        accountPublicKey: "account",
        symbol: "BTC-USD",
        side: "long",
        sizeBase: 0.01,
        orderType: "market",
        price: 50_000,
        leaderEventId: "leader-event-1",
      }),
    ).rejects.toThrow("secure agent key provider");
  });

  it("routes copy orders through canonical prepare, sign, and submit steps", async () => {
    const prepared = {
      messageBytes: new Uint8Array([1, 2, 3]),
      actions: "[]",
      nonce: 1,
      account: "account",
      signer: "agent",
    };
    const calls: string[] = [];
    const executor = createCanonicalCopyTradeExecutor({
      gateway: {
        prepareOrder: () => {
          calls.push("prepare");
          return prepared;
        },
        finalizeAndSubmit: async ({ signature }) => {
          calls.push(`submit:${signature}`);
          return { status: "accepted" };
        },
      },
      signPrepared: async ({ messageBytes }) => {
        expect(messageBytes).toEqual(prepared.messageBytes);
        calls.push("sign");
        return "signature";
      },
    });

    await executor.submit({
      agentWalletId: "wallet-1",
      agentWalletPublicKey: "agent",
      accountPublicKey: "account",
      symbol: "BTC-USD",
      side: "long",
      sizeBase: 0.01,
      orderType: "market",
      price: 50_000,
      leaderEventId: "event-1",
    });

    expect(calls).toEqual(["prepare", "sign", "submit:signature"]);
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

  it("serializes supported stop-loss and take-profit action variants", () => {
    const keychain = createNodeKeychainAdapter();
    const stop = keychain.prepareOrder(
      {
        type: "stop",
        symbol: "BTC-USD",
        isBuy: false,
        size: 0.1,
        triggerPrice: 98_000,
        iso: false,
      },
      { account, nonce: 46 },
    );
    const takeProfit = keychain.prepareOrder(
      {
        type: "takeProfit",
        symbol: "BTC-USD",
        isBuy: true,
        size: 0.1,
        triggerPrice: 102_000,
        iso: false,
      },
      { account, nonce: 47 },
    );

    const stopActions = JSON.parse(String(stop.actions));
    const takeProfitActions = JSON.parse(String(takeProfit.actions));
    expect(stopActions[0]).toHaveProperty("st");
    expect(stopActions[0]).not.toHaveProperty("t");
    expect(stopActions[0].st.d).toBe(false);
    expect(takeProfitActions[0]).toHaveProperty("tp");
    expect(takeProfitActions[0]).not.toHaveProperty("t");
    expect(takeProfitActions[0].tp.d).toBe(true);
  });

  it("signs prepared bytes only for the expected agent key", () => {
    const secretKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const expectedPublicKey = getNativeAgentPublicKey(secretKey);
    const signature = signPreparedWithAgentSecret({
      secretKey,
      expectedPublicKey,
      messageBytes: new Uint8Array([1, 2, 3]),
    });

    expect(signature.length).toBeGreaterThan(80);
    expect(() =>
      signPreparedWithAgentSecret({
        secretKey,
        expectedPublicKey: recipient,
        messageBytes: new Uint8Array([1, 2, 3]),
      }),
    ).toThrow(/does not match/);
  });
});
