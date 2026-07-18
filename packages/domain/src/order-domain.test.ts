import { describe, expect, it } from "vitest";

import { basisPoints, positiveDecimal } from "./financial-types.js";
import { parsePlaceOrderIntentV1 } from "./order-intent.js";
import {
  assertOrderTransition,
  canTransitionOrder,
  isTerminalOrderStatus,
} from "./order-state.js";

const now = Date.parse("2026-07-18T12:00:00.000Z");

describe("financial branded values", () => {
  it("accepts canonical decimal strings without floating point conversion", () => {
    expect(positiveDecimal("1000000000000000000.000001", "amount")).toBe(
      "1000000000000000000.000001",
    );
  });

  it.each([1, -1, "1e6", "-1", "01", "0", "0.0"])(
    "rejects unsafe positive decimal %j",
    (value) => {
      expect(() => positiveDecimal(value, "amount")).toThrow();
    },
  );

  it("enforces basis-point bounds", () => {
    expect(basisPoints(10, "fee", 100)).toBe(10);
    expect(() => basisPoints(101, "fee", 100)).toThrow();
    expect(() => basisPoints(0.1, "fee", 100)).toThrow();
  });
});

describe("PlaceOrderIntentV1", () => {
  it("parses a limit intent and preserves decimal strings", () => {
    const intent = parsePlaceOrderIntentV1(
      {
        version: 1,
        principalId: "did:privy:test",
        accountId: "account",
        marketId: "BTC-USD",
        side: "buy",
        orderType: "limit",
        quantity: "0.0100",
        limitPrice: "64000.25",
        reduceOnly: false,
        maxSlippageBps: 25,
        expiresAt: "2026-07-18T12:01:00.000Z",
        nonce: "nonce-1",
        network: "bulk-testnet",
      },
      now,
    );
    expect(intent.quantity).toBe("0.0100");
    expect(intent.limitPrice).toBe("64000.25");
  });

  it("rejects an expired intent", () => {
    expect(() =>
      parsePlaceOrderIntentV1(
        {
          version: 1,
          principalId: "did:privy:test",
          accountId: "account",
          marketId: "BTC-USD",
          side: "sell",
          orderType: "market",
          quantity: "1",
          reduceOnly: true,
          maxSlippageBps: 10,
          expiresAt: "2026-07-18T11:59:59.000Z",
          nonce: "nonce-2",
          network: "bulk-testnet",
        },
        now,
      ),
    ).toThrow("expired");
  });
});

describe("order state machine", () => {
  it("permits the acknowledged partial-fill path", () => {
    expect(canTransitionOrder("SUBMITTED", "ACKNOWLEDGED")).toBe(true);
    expect(canTransitionOrder("ACKNOWLEDGED", "PARTIALLY_FILLED")).toBe(true);
    expect(canTransitionOrder("PARTIALLY_FILLED", "FILLED")).toBe(true);
  });

  it("routes uncertain submission through reconciliation", () => {
    expect(
      canTransitionOrder("SUBMISSION_PENDING", "RECONCILIATION_REQUIRED"),
    ).toBe(true);
    expect(canTransitionOrder("RECONCILIATION_REQUIRED", "ACKNOWLEDGED")).toBe(
      true,
    );
  });

  it("rejects impossible and terminal transitions", () => {
    expect(() => assertOrderTransition("CREATED", "FILLED")).toThrow(
      "cannot transition",
    );
    expect(isTerminalOrderStatus("FILLED")).toBe(true);
    expect(canTransitionOrder("FILLED", "CANCELLED")).toBe(false);
  });
});
