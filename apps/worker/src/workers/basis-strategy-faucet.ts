import {
  BulkClient,
  BulkHttpError,
  normalizeSignedTransaction,
} from "@klub/api-client";

import { prepareSignedFaucetRequest } from "../signing/keychain-adapter.js";

export async function requestBulkStrategyFaucet({
  client,
  account,
  secret,
}: {
  readonly client: BulkClient;
  readonly account: string;
  readonly secret: Uint8Array;
}): Promise<"accepted" | "cooldown"> {
  const signed = prepareSignedFaucetRequest({
    secretKey: secret,
    expectedPublicKey: account,
  });
  const transaction = normalizeSignedTransaction(signed);
  try {
    await client.postUnsigned("/order", transaction);
    return "accepted";
  } catch (error) {
    if (isRecentFaucetClaim(error)) return "cooldown";
    throw error;
  }
}

function isRecentFaucetClaim(error: unknown): boolean {
  if (!(error instanceof BulkHttpError)) return false;
  const details = JSON.stringify(error.body).toLowerCase();
  return (
    details.includes("already") ||
    details.includes("72") ||
    details.includes("cooldown") ||
    details.includes("recent")
  );
}
