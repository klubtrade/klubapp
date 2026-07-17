import { describe, expect, it, vi } from "vitest";

import {
  BuilderCodeError,
  createApproveBuilderCodeAction,
  createRevokeBuilderCodeAction,
  routeOrderWithBuilderCode,
  type BuilderCodePolicy,
  type RoutableOrderInput,
} from "../builder-codes.js";
import { BulkClient } from "../client.js";
import {
  BulkExchangeGateway,
  normalizeSignedTransaction,
  parseSignedTransaction,
  type BulkKeychainAdapter,
  type PreparedBulkTransaction,
} from "../gateway.js";

const RECIPIENT = "11111111111111111111111111111111";
const ACCOUNT = "Vote111111111111111111111111111111111111111";
const POLICY: BuilderCodePolicy = {
  network: "staging",
  to: RECIPIENT,
  fee: 5,
};
const MARKET_ORDER: RoutableOrderInput = {
  type: "order",
  symbol: "BTC-USD",
  isBuy: true,
  price: 0,
  size: 0.1,
  reduceOnly: false,
  iso: false,
  orderType: { type: "market", isMarket: true, triggerPx: 0 },
};

describe("Builder Code domain", () => {
  it("builds the documented abc and rbc actions", () => {
    expect(createApproveBuilderCodeAction(POLICY)).toEqual({
      abc: { to: RECIPIENT, fee: 5 },
    });
    expect(createRevokeBuilderCodeAction(RECIPIENT)).toEqual({
      rbc: { to: RECIPIENT },
    });
  });

  it.each([0, 16, 1.5])("rejects an invalid fee of %s bps", (fee) => {
    expect(() =>
      createApproveBuilderCodeAction({ to: RECIPIENT, fee }),
    ).toThrow(BuilderCodeError);
  });

  it("omits builderCode entirely when no policy is configured", () => {
    const routed = routeOrderWithBuilderCode({
      network: "mainnet",
      order: MARKET_ORDER,
    });
    expect(routed).not.toHaveProperty("builderCode");
    expect(JSON.stringify(routed)).not.toContain("builderCode");
  });

  it("attaches an approved builder code on staging", () => {
    expect(
      routeOrderWithBuilderCode({
        network: "staging",
        order: MARKET_ORDER,
        policy: POLICY,
        approvals: [{ recipient: RECIPIENT, maxFee: 8 }],
      }),
    ).toEqual({
      ...MARKET_ORDER,
      builderCode: { to: RECIPIENT, fee: 5 },
    });
  });

  it("rejects missing approval, excessive fees, and mainnet routing", () => {
    expect(() =>
      routeOrderWithBuilderCode({
        network: "staging",
        order: MARKET_ORDER,
        policy: POLICY,
        approvals: [],
      }),
    ).toThrow(/not approved/);
    expect(() =>
      routeOrderWithBuilderCode({
        network: "staging",
        order: MARKET_ORDER,
        policy: POLICY,
        approvals: [{ recipient: RECIPIENT, maxFee: 4 }],
      }),
    ).toThrow(/exceeds/);
    expect(() =>
      routeOrderWithBuilderCode({
        network: "mainnet",
        order: MARKET_ORDER,
        policy: POLICY,
        approvals: [{ recipient: RECIPIENT, maxFee: 5 }],
      }),
    ).toThrow(/staging only/);
  });
});

describe("BulkExchangeGateway", () => {
  it("prepares with the keychain and submits a normalized signed envelope", async () => {
    const prepared: PreparedBulkTransaction = {
      messageBytes: new Uint8Array([1, 2, 3]),
      actions: JSON.stringify([{ m: { c: "BTC-USD" } }]),
      nonce: 42,
      account: ACCOUNT,
      signer: ACCOUNT,
    };
    const keychain: BulkKeychainAdapter = {
      prepareOrder: vi.fn(() => prepared),
      prepareApproveBuilderCode: vi.fn(() => prepared),
      prepareRevokeBuilderCode: vi.fn(() => prepared),
      finalize: vi.fn(() => ({
        actions: prepared.actions,
        nonce: prepared.nonce,
        account: prepared.account,
        signer: prepared.signer,
        signature: "signed",
      })),
    };
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        actions: [{ m: { c: "BTC-USD" } }],
        nonce: 42,
        account: ACCOUNT,
        signer: ACCOUNT,
        signature: "signed",
      });
      return new Response(JSON.stringify({ status: "accepted" }), {
        status: 200,
      });
    });
    const gateway = new BulkExchangeGateway({
      client: new BulkClient({
        baseUrl: "https://staging-api.bulk.trade/api/v1",
        fetch: fetchImpl as typeof fetch,
      }),
      keychain,
      network: "staging",
      builderCode: POLICY,
    });

    const result = await gateway.finalizeAndSubmit<{ status: string }>({
      prepared: gateway.prepareOrder({
        order: MARKET_ORDER,
        options: { account: ACCOUNT },
        approvals: [{ recipient: RECIPIENT, maxFee: 5 }],
      }),
      signature: "signed",
    });

    expect(keychain.prepareOrder).toHaveBeenCalledWith(
      { ...MARKET_ORDER, builderCode: { to: RECIPIENT, fee: 5 } },
      { account: ACCOUNT },
    );
    expect(result).toEqual({ status: "accepted" });
  });

  it("rejects malformed action output from a keychain adapter", () => {
    expect(() =>
      normalizeSignedTransaction({
        actions: "{}",
        nonce: 1,
        account: ACCOUNT,
        signer: ACCOUNT,
        signature: "signed",
      }),
    ).toThrow(/JSON array/);
  });

  it("parses only complete canonical transaction envelopes", () => {
    expect(
      parseSignedTransaction({
        actions: [{ abc: { to: RECIPIENT, fee: 5 } }],
        nonce: "42",
        account: ACCOUNT,
        signer: ACCOUNT,
        signature: "signed",
      }),
    ).toMatchObject({ nonce: "42", signature: "signed" });
    expect(() =>
      parseSignedTransaction({
        actions: [],
        nonce: 42,
        account: ACCOUNT,
        signer: ACCOUNT,
        signature: "signed",
      }),
    ).toThrow(/at least one action/);
  });
});
