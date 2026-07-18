import { describe, expect, it } from "vitest";

import {
  canonicalOrderIntentPayload,
  signOrderIntent,
  type NonceStore,
  type OrderSigningContext,
  type OrderSigningPolicy,
  type Signer,
} from "../index.js";

const now = Date.parse("2026-07-18T10:00:00.000Z");
const intent = {
  version: 1,
  principalId: "did:privy:user-1",
  accountId: "bulk-account-1",
  marketId: "BTC-USD",
  side: "buy",
  orderType: "limit",
  quantity: "0.010000000000000001",
  limitPrice: "63981.00",
  reduceOnly: false,
  maxSlippageBps: 25,
  expiresAt: "2026-07-18T10:01:00.000Z",
  nonce: "nonce-1",
  network: "bulk-testnet",
} as const;

const policy: OrderSigningPolicy = {
  principalId: intent.principalId,
  accountId: intent.accountId,
  network: "bulk-testnet",
  allowedMarkets: ["BTC-USD"],
  maxOrderNotionalUsd: "1000",
  maxTotalNotionalUsd: "5000",
  maxLeverage: "5",
  maxSlippageBps: 50,
  paused: false,
};

const context: OrderSigningContext = {
  authenticatedPrincipalId: intent.principalId,
  accountOwnerPrincipalId: intent.principalId,
  executionReferencePrice: "64000",
  requestedLeverage: "5",
  currentTotalNotionalUsd: "1000",
  wouldReducePosition: false,
  venueStateObservedAt: "2026-07-18T09:59:59.000Z",
  maxVenueStateAgeMs: 5_000,
};

function memoryNonceStore(): NonceStore {
  const consumed = new Set<string>();
  return {
    async consume(scope, nonce) {
      const key = `${scope}:${nonce}`;
      if (consumed.has(key)) return false;
      consumed.add(key);
      return true;
    },
  };
}

const signer: Signer = {
  publicKeyBase58: "test-signer",
  publicKey: new Uint8Array(32),
  async sign(payload) {
    return payload.slice(0, 64);
  },
};

describe("policy-limited order signing", () => {
  it("signs a valid typed intent and domain-separates its canonical payload", async () => {
    const result = await signOrderIntent({
      input: intent,
      policy,
      context,
      nonceStore: memoryNonceStore(),
      signer,
      now,
    });

    expect(new TextDecoder().decode(result.payload)).toMatch(
      /^KLUB_ORDER_INTENT_V1\n/,
    );
    expect(result.signerPublicKey).toBe("test-signer");
    expect(result.payload).toEqual(canonicalOrderIntentPayload(result.intent));
  });

  it("rejects replayed nonces before a second signature", async () => {
    const nonceStore = memoryNonceStore();
    const request = { input: intent, policy, context, nonceStore, signer, now };
    await signOrderIntent(request);
    await expect(signOrderIntent(request)).rejects.toMatchObject({
      reasonCode: "NONCE_REPLAY",
    });
  });

  it.each([
    [
      "SESSION_PRINCIPAL_MISMATCH",
      { context: { ...context, authenticatedPrincipalId: "attacker" } },
    ],
    [
      "ACCOUNT_NOT_OWNED",
      { context: { ...context, accountOwnerPrincipalId: "another-user" } },
    ],
    ["NETWORK_OUT_OF_SCOPE", { input: { ...intent, network: "bulk-mainnet" } }],
    ["MARKET_OUT_OF_SCOPE", { input: { ...intent, marketId: "ETH-USD" } }],
    ["SLIPPAGE_LIMIT_EXCEEDED", { input: { ...intent, maxSlippageBps: 51 } }],
    [
      "LEVERAGE_LIMIT_EXCEEDED",
      { context: { ...context, requestedLeverage: "5.0000000000000001" } },
    ],
    [
      "VENUE_STATE_STALE",
      {
        context: {
          ...context,
          venueStateObservedAt: "2026-07-18T09:59:00.000Z",
        },
      },
    ],
    ["POLICY_PAUSED", { policy: { ...policy, paused: true } }],
  ] as const)("denies %s", async (reasonCode, overrides) => {
    await expect(
      signOrderIntent({
        input: "input" in overrides ? overrides.input : intent,
        policy: "policy" in overrides ? overrides.policy : policy,
        context: "context" in overrides ? overrides.context : context,
        nonceStore: memoryNonceStore(),
        signer,
        now,
      }),
    ).rejects.toMatchObject({ reasonCode });
  });

  it("uses exact decimal math for order and projected notional caps", async () => {
    await expect(
      signOrderIntent({
        input: { ...intent, quantity: "0.02" },
        policy,
        context,
        nonceStore: memoryNonceStore(),
        signer,
        now,
      }),
    ).rejects.toMatchObject({ reasonCode: "ORDER_NOTIONAL_LIMIT_EXCEEDED" });

    await expect(
      signOrderIntent({
        input: intent,
        policy: { ...policy, maxTotalNotionalUsd: "1639.809999999999" },
        context,
        nonceStore: memoryNonceStore(),
        signer,
        now,
      }),
    ).rejects.toMatchObject({ reasonCode: "TOTAL_NOTIONAL_LIMIT_EXCEEDED" });
  });

  it("requires authoritative proof that reduce-only really reduces", async () => {
    await expect(
      signOrderIntent({
        input: { ...intent, reduceOnly: true },
        policy,
        context,
        nonceStore: memoryNonceStore(),
        signer,
        now,
      }),
    ).rejects.toMatchObject({ reasonCode: "INVALID_REDUCE_ONLY" });
  });
});
