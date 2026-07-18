import {
  basisPoints,
  marketId,
  price,
  quantity,
  type BasisPoints,
  type MarketId,
  type Price,
  type Quantity,
} from "./financial-types.js";

export type BulkNetwork = "bulk-testnet" | "bulk-mainnet";

export interface PlaceOrderIntentV1 {
  readonly version: 1;
  readonly principalId: string;
  readonly accountId: string;
  readonly marketId: MarketId;
  readonly side: "buy" | "sell";
  readonly orderType: "market" | "limit";
  readonly quantity: Quantity;
  readonly limitPrice?: Price;
  readonly reduceOnly: boolean;
  readonly maxSlippageBps: BasisPoints;
  readonly expiresAt: string;
  readonly nonce: string;
  readonly network: BulkNetwork;
}

/** Runtime parser for the internal command boundary. Unknown input is untrusted. */
export function parsePlaceOrderIntentV1(
  value: unknown,
  now = Date.now(),
): PlaceOrderIntentV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("order intent must be an object");
  }
  const input = value as Record<string, unknown>;
  if (input.version !== 1) throw new Error("unsupported order intent version");
  const principalId = requiredString(input.principalId, "principalId", 128);
  const accountId = requiredString(input.accountId, "accountId", 128);
  const side = enumValue(input.side, "side", ["buy", "sell"] as const);
  const orderType = enumValue(input.orderType, "orderType", [
    "market",
    "limit",
  ] as const);
  const parsedQuantity = quantity(input.quantity);
  const parsedLimit =
    input.limitPrice === undefined ? undefined : price(input.limitPrice);
  if (orderType === "limit" && !parsedLimit) {
    throw new Error("limitPrice is required for a limit order");
  }
  if (orderType === "market" && parsedLimit) {
    throw new Error("limitPrice is not allowed for a market order");
  }
  if (typeof input.reduceOnly !== "boolean") {
    throw new Error("reduceOnly must be boolean");
  }
  const maxSlippageBps = basisPoints(
    input.maxSlippageBps,
    "maxSlippageBps",
    1_000,
  );
  const expiresAt = requiredString(input.expiresAt, "expiresAt", 64);
  const expiration = Date.parse(expiresAt);
  if (!Number.isFinite(expiration) || expiration <= now) {
    throw new Error("order intent is expired or has an invalid expiry");
  }
  const nonce = requiredString(input.nonce, "nonce", 128);
  const network = enumValue(input.network, "network", [
    "bulk-testnet",
    "bulk-mainnet",
  ] as const);

  return {
    version: 1,
    principalId,
    accountId,
    marketId: marketId(input.marketId),
    side,
    orderType,
    quantity: parsedQuantity,
    ...(parsedLimit ? { limitPrice: parsedLimit } : {}),
    reduceOnly: input.reduceOnly,
    maxSlippageBps,
    expiresAt,
    nonce,
    network,
  };
}

function requiredString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new Error(
      `${field} must be a non-empty string up to ${max} characters`,
    );
  }
  return value;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  field: string,
  allowed: T,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${field} is invalid`);
  }
  return value as T[number];
}
