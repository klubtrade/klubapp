import { describe, expect, it } from "vitest";

import { recordCandidates } from "../workers/leader-discovery.js";

import { formatAlertText } from "../notifications/telegram.js";
import {
  createCanonicalCopyTradeExecutor,
  disabledCopyTradeExecutor,
} from "../signing/bulk-execution.js";
import {
  createNodeKeychainAdapter,
  getNativeAgentPublicKey,
  prepareSignedFaucetRequest,
  signPreparedWithAgentSecret,
} from "../signing/keychain-adapter.js";
import { composeAlertMessage, tierCrossed } from "../workers/alerts-worker.js";
import {
  allocateProRata,
  decodeStrategySecret,
} from "../workers/basis-yield-operator.js";
import { summarizeCopyFollowRows } from "../workers/copy-follow-scanner.js";
import { computeMirroredSize } from "../workers/copy-trade-worker.js";
import { summarizeLeaderFills } from "../workers/leader-indexer.js";

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
  it("discovers real Bulk participants from public trade prints", () => {
    const candidates = new Map<string, number>();
    const maker = "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7";
    const taker = "6X6B7TCZMzoCfavPvV3iZS5PZT1kK7dZFsbW6Gwxd4uv";

    recordCandidates(candidates, [{ maker, taker, time: 1_784_418_948_506 }]);

    expect([...candidates.keys()]).toEqual([maker, taker]);
    expect(candidates.get(maker)).toBe(1_784_418_948_506);
  });

  it("allocates funded Basis yield by active principal", () => {
    expect(
      allocateProRata(
        [
          { position: "p1", owner: "o1", principalRaw: 500_000_000n },
          { position: "p2", owner: "o2", principalRaw: 1_500_000_000n },
        ],
        20_000_000n,
      ),
    ).toEqual([
      {
        position: "p1",
        owner: "o1",
        principalRaw: 500_000_000n,
        amountRaw: 5_000_000n,
      },
      {
        position: "p2",
        owner: "o2",
        principalRaw: 1_500_000_000n,
        amountRaw: 15_000_000n,
      },
    ]);
  });

  it("accepts safe Railway encodings for the Basis strategy key", () => {
    const key = Uint8Array.from({ length: 64 }, (_, index) => index);
    const base64 = Buffer.from(key).toString("base64");
    const json = JSON.stringify([...key]);

    expect(decodeStrategySecret(base64)).toEqual(key);
    expect(decodeStrategySecret(`"${base64}"`)).toEqual(key);
    expect(decodeStrategySecret(json)).toEqual(key);
    expect(decodeStrategySecret(Buffer.from(json).toString("base64"))).toEqual(
      key,
    );
    expect(() => decodeStrategySecret("not-a-key")).toThrow("expected 64");
  });

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

  it("summarizes active DB copy follows for worker health", () => {
    const summary = summarizeCopyFollowRows(
      [
        { followerPubkey: "follower-1", leaderPubkey: "leader-1" },
        { followerPubkey: "follower-1", leaderPubkey: "leader-2" },
        { followerPubkey: "follower-2", leaderPubkey: "leader-1" },
      ],
      new Date("2026-07-17T00:00:00.000Z"),
    );

    expect(summary).toEqual({
      activeFollows: 3,
      uniqueFollowers: 2,
      uniqueLeaders: 2,
      indexedAt: "2026-07-17T00:00:00.000Z",
    });
  });

  it("calculates independent 24-hour, 7-day, and 30-day leader PnL", () => {
    const nowMs = Date.parse("2026-07-19T12:00:00.000Z");
    const hour = 60 * 60 * 1000;
    const fill = (
      symbol: string,
      amount: number,
      price: number,
      isBuy: boolean,
      timestamp: number,
    ) => ({
      symbol,
      amount,
      price,
      isBuy,
      fee: 1,
      timestamp,
      maker: "maker",
      taker: "taker",
      reason: "normal",
      slot: 1,
    });
    const summary = summarizeLeaderFills({
      leaderPubkey: "leader",
      nowMs,
      cutoffMs: nowMs - 30 * 24 * hour,
      fills: [
        fill("BTC-USD", 1, 100, true, nowMs - 48 * hour),
        fill("BTC-USD", 1, 120, false, nowMs - 12 * hour),
        fill("ETH-USD", 1, 50, true, nowMs - 10 * 24 * hour),
        fill("ETH-USD", 1, 60, false, nowMs - 8 * 24 * hour),
      ],
      fundingPayments: [
        {
          owner: "leader",
          symbol: "BTC-USD",
          size: 1,
          payment: 2,
          fundingRate: 0.0001,
          markPrice: 120,
          slot: 2,
          timestamp: nowMs - 6 * hour,
        },
        {
          owner: "leader",
          symbol: "ETH-USD",
          size: 1,
          payment: 3,
          fundingRate: 0.0001,
          markPrice: 60,
          slot: 2,
          timestamp: nowMs - 8 * 24 * hour,
        },
      ],
    });

    expect(summary.fillsLast24h).toBe(1);
    expect(summary.fillsLast7d).toBe(2);
    expect(summary.fillsLast30d).toBe(4);
    expect(summary.netPnl24hUsd).toBe(21);
    expect(summary.netPnl7dUsd).toBe(20);
    expect(summary.netPnl30dUsd).toBe(31);
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

  it("prepares a signed canonical faucet request for the strategy account", () => {
    const secretKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const expectedPublicKey = getNativeAgentPublicKey(secretKey);
    const signed = prepareSignedFaucetRequest({
      secretKey,
      expectedPublicKey,
      nonce: 48,
    });

    expect(JSON.parse(String(signed.actions))).toEqual([
      { faucet: { u: expectedPublicKey } },
    ]);
    expect(signed.account).toBe(expectedPublicKey);
    expect(signed.signer).toBe(expectedPublicKey);
    expect(signed.signature.length).toBeGreaterThan(80);
  });
});
