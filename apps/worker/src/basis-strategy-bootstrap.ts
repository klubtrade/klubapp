/* eslint-disable no-console */

import {
  BulkClient,
  BulkHttpError,
  normalizeSignedTransaction,
  queryFullAccount,
} from "@klub/api-client";

import { prepareSignedFaucetRequest } from "./signing/keychain-adapter.js";
import { decodeStrategySecret } from "./workers/basis-yield-operator.js";

const DEFAULT_API = "https://exchange-api.bulk.trade/api/v1";

async function main(): Promise<void> {
  const account = required("BASIS_BULK_STRATEGY_ACCOUNT");
  const secret = decodeStrategySecret(
    required("BASIS_VAULT_STRATEGY_AUTHORITY_SECRET"),
  );
  const client = new BulkClient({
    baseUrl: process.env.BULK_HTTP_URL ?? DEFAULT_API,
    timeoutMs: 20_000,
  });

  if (!process.argv.includes("--inspect-only")) {
    await claimFaucet(client, account, secret);
  }
  const accountState = await queryFullAccount(client, account);
  console.log(
    JSON.stringify(
      {
        ok: true,
        account,
        faucetRequested: !process.argv.includes("--inspect-only"),
        accountState,
      },
      null,
      2,
    ),
  );
}

async function claimFaucet(
  client: BulkClient,
  account: string,
  secret: Uint8Array,
): Promise<void> {
  const signed = prepareSignedFaucetRequest({
    secretKey: secret,
    expectedPublicKey: account,
  });
  const transaction = normalizeSignedTransaction(signed);
  try {
    await client.postUnsigned("/order", transaction);
    console.log(`[basis-bootstrap] faucet accepted for ${account}`);
  } catch (error) {
    if (isRecentFaucetClaim(error)) {
      console.log("[basis-bootstrap] faucet was already claimed; continuing");
      return;
    }
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

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

void main().catch((error) => {
  console.error("[basis-bootstrap] failed", error);
  process.exit(1);
});
