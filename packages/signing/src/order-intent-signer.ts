import { parsePlaceOrderIntentV1, type PlaceOrderIntentV1 } from "@klub/domain";

import type { Signer } from "./types.js";

const DOMAIN_SEPARATOR = "KLUB_ORDER_INTENT_V1\n";

export interface OrderSigningPolicy {
  readonly principalId: string;
  readonly accountId: string;
  readonly network: "bulk-testnet" | "bulk-mainnet";
  readonly allowedMarkets: readonly string[];
  readonly maxOrderNotionalUsd: string;
  readonly maxTotalNotionalUsd: string;
  readonly maxLeverage: string;
  readonly maxSlippageBps: number;
  readonly paused: boolean;
}

export interface OrderSigningContext {
  /** Identity derived from the verified server-side session. */
  readonly authenticatedPrincipalId: string;
  /** Principal resolved from authoritative account ownership data. */
  readonly accountOwnerPrincipalId: string;
  /** Fresh venue price used for market orders and risk checks. */
  readonly executionReferencePrice: string;
  readonly requestedLeverage: string;
  readonly currentTotalNotionalUsd: string;
  /** Must be true for a reduce-only intent; derived from current venue state. */
  readonly wouldReducePosition: boolean;
  readonly venueStateObservedAt: string;
  readonly maxVenueStateAgeMs: number;
}

export interface NonceStore {
  /** Atomically records a nonce and returns false if it was already consumed. */
  consume(scope: string, nonce: string, expiresAt: string): Promise<boolean>;
}

export interface SignedOrderIntent {
  readonly intent: PlaceOrderIntentV1;
  readonly payload: Uint8Array;
  readonly signature: Uint8Array;
  readonly signerPublicKey: string;
}

export class SigningPolicyError extends Error {
  readonly code = "SIGNING_POLICY_DENIED";

  constructor(readonly reasonCode: string) {
    super(`order signing denied: ${reasonCode}`);
    this.name = "SigningPolicyError";
  }
}

/**
 * Signs only a parsed, policy-approved KLUB order intent. This boundary never
 * accepts an arbitrary serialized transaction or arbitrary venue payload.
 */
export async function signOrderIntent(params: {
  readonly input: unknown;
  readonly policy: OrderSigningPolicy;
  readonly context: OrderSigningContext;
  readonly nonceStore: NonceStore;
  readonly signer: Signer;
  readonly now?: number;
}): Promise<SignedOrderIntent> {
  const now = params.now ?? Date.now();
  const intent = parsePlaceOrderIntentV1(params.input, now);
  assertSigningPolicy(intent, params.policy, params.context, now);

  const nonceScope = `${intent.network}:${intent.accountId}`;
  const consumed = await params.nonceStore.consume(
    nonceScope,
    intent.nonce,
    intent.expiresAt,
  );
  if (!consumed) throw new SigningPolicyError("NONCE_REPLAY");

  const payload = canonicalOrderIntentPayload(intent);
  return {
    intent,
    payload,
    signature: await params.signer.sign(payload),
    signerPublicKey: params.signer.publicKeyBase58,
  };
}

export function assertSigningPolicy(
  intent: PlaceOrderIntentV1,
  policy: OrderSigningPolicy,
  context: OrderSigningContext,
  now = Date.now(),
): void {
  deny(policy.paused, "POLICY_PAUSED");
  deny(
    intent.principalId !== context.authenticatedPrincipalId,
    "SESSION_PRINCIPAL_MISMATCH",
  );
  deny(
    context.accountOwnerPrincipalId !== context.authenticatedPrincipalId,
    "ACCOUNT_NOT_OWNED",
  );
  deny(
    policy.principalId !== context.authenticatedPrincipalId,
    "POLICY_PRINCIPAL_MISMATCH",
  );
  deny(intent.accountId !== policy.accountId, "ACCOUNT_OUT_OF_SCOPE");
  deny(intent.network !== policy.network, "NETWORK_OUT_OF_SCOPE");
  deny(!policy.allowedMarkets.includes(intent.marketId), "MARKET_OUT_OF_SCOPE");
  deny(
    intent.maxSlippageBps > policy.maxSlippageBps,
    "SLIPPAGE_LIMIT_EXCEEDED",
  );

  const observedAt = Date.parse(context.venueStateObservedAt);
  deny(
    !Number.isFinite(observedAt) ||
      observedAt > now + 5_000 ||
      now - observedAt > context.maxVenueStateAgeMs,
    "VENUE_STATE_STALE",
  );

  deny(
    compareDecimal(context.requestedLeverage, policy.maxLeverage) > 0,
    "LEVERAGE_LIMIT_EXCEEDED",
  );
  deny(
    intent.reduceOnly && !context.wouldReducePosition,
    "INVALID_REDUCE_ONLY",
  );

  const referencePrice = intent.limitPrice ?? context.executionReferencePrice;
  const orderNotional = multiplyDecimal(intent.quantity, referencePrice);
  deny(
    compareParts(orderNotional, parseDecimal(policy.maxOrderNotionalUsd)) > 0,
    "ORDER_NOTIONAL_LIMIT_EXCEEDED",
  );
  const projectedNotional = addDecimal(
    parseDecimal(context.currentTotalNotionalUsd),
    orderNotional,
  );
  deny(
    compareParts(projectedNotional, parseDecimal(policy.maxTotalNotionalUsd)) >
      0,
    "TOTAL_NOTIONAL_LIMIT_EXCEEDED",
  );
}

export function canonicalOrderIntentPayload(
  intent: PlaceOrderIntentV1,
): Uint8Array {
  const body = JSON.stringify({
    version: intent.version,
    principalId: intent.principalId,
    accountId: intent.accountId,
    marketId: intent.marketId,
    side: intent.side,
    orderType: intent.orderType,
    quantity: intent.quantity,
    limitPrice: intent.limitPrice ?? null,
    reduceOnly: intent.reduceOnly,
    maxSlippageBps: intent.maxSlippageBps,
    expiresAt: intent.expiresAt,
    nonce: intent.nonce,
    network: intent.network,
  });
  return new TextEncoder().encode(`${DOMAIN_SEPARATOR}${body}`);
}

interface DecimalParts {
  readonly coefficient: bigint;
  readonly scale: number;
}

function parseDecimal(value: string): DecimalParts {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) {
    throw new SigningPolicyError("INVALID_DECIMAL_POLICY_INPUT");
  }
  const [whole = "0", fraction = ""] = value.split(".");
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function multiplyDecimal(left: string, right: string): DecimalParts {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  return {
    coefficient: a.coefficient * b.coefficient,
    scale: a.scale + b.scale,
  };
}

function addDecimal(left: DecimalParts, right: DecimalParts): DecimalParts {
  const scale = Math.max(left.scale, right.scale);
  return {
    coefficient:
      left.coefficient * 10n ** BigInt(scale - left.scale) +
      right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  };
}

function compareDecimal(left: string, right: string): number {
  return compareParts(parseDecimal(left), parseDecimal(right));
}

function compareParts(left: DecimalParts, right: DecimalParts): number {
  const scale = Math.max(left.scale, right.scale);
  const a = left.coefficient * 10n ** BigInt(scale - left.scale);
  const b = right.coefficient * 10n ** BigInt(scale - right.scale);
  return a === b ? 0 : a > b ? 1 : -1;
}

function deny(condition: boolean, reasonCode: string): void {
  if (condition) throw new SigningPolicyError(reasonCode);
}
