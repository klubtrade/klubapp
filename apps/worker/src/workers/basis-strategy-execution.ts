import {
  type BulkClient,
  normalizeSignedTransaction,
  type RoutableOrderInput,
} from "@klub/api-client";

import { prepareSignedOrderGroup } from "../signing/keychain-adapter.js";

export interface StrategySubmission {
  readonly orderIds: readonly string[];
  readonly response: unknown;
}

export async function submitAtomicStrategyOrders({
  client,
  account,
  secret,
  orders,
}: {
  readonly client: BulkClient;
  readonly account: string;
  readonly secret: Uint8Array;
  readonly orders: readonly RoutableOrderInput[];
}): Promise<StrategySubmission> {
  if (orders.length === 0) throw new Error("No strategy orders to submit.");
  const prepared = prepareSignedOrderGroup({
    secretKey: secret,
    expectedPublicKey: account,
    orders: [...orders],
  });
  const transaction = normalizeSignedTransaction(prepared.signed);
  const response = await client.postUnsigned("/order", transaction);
  assertAccepted(response);
  return {
    orderIds: prepared.orderIds,
    response,
  };
}

function assertAccepted(response: unknown): void {
  const serialized = JSON.stringify(response).toLowerCase();
  const rejected = [
    "rejected",
    "cancelledioc",
    "cancelledrisklimit",
    "cancelledselfcrossing",
    "partiallyfilled",
    '"status":"error"',
  ].some((marker) => serialized.includes(marker));
  if (rejected) {
    throw new Error(
      `Bulk rejected the strategy order: ${JSON.stringify(response)}`,
    );
  }
}
