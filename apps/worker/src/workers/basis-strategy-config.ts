import { decodeStrategySecret } from "./basis-yield-operator.js";

export function strategyConfig() {
  const network = process.env.BASIS_OPERATOR_NETWORK?.trim() || "devnet";
  if (network !== "devnet") {
    throw new Error("Software strategy execution is devnet-only.");
  }
  return {
    account: required("BASIS_BULK_STRATEGY_ACCOUNT"),
    secret: decodeStrategySecret(
      required("BASIS_VAULT_STRATEGY_AUTHORITY_SECRET"),
    ),
    executionEnabled: process.env.BASIS_STRATEGY_EXECUTION_ENABLED !== "false",
    bulkApiUrl:
      process.env.BULK_HTTP_URL ??
      process.env.BULK_API_URL ??
      "https://exchange-api.bulk.trade/api/v1",
    wsUrl: process.env.BULK_WS_URL ?? "wss://exchange-ws1.bulk.trade",
  };
}

export function workerIntervalMs(
  envName: string,
  defaultMs: number,
  minimumMs: number,
): number {
  const raw = process.env[envName]?.trim();
  if (!raw) return defaultMs;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimumMs) return defaultMs;
  return Math.floor(value);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}
