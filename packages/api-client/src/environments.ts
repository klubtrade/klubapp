import type { BulkNetwork } from "./builder-codes.js";

export interface BulkEnvironment {
  readonly network: BulkNetwork;
  readonly httpUrl: string;
  readonly wsUrl: string;
  readonly builderCodes: boolean;
}

export const BULK_ENVIRONMENTS: Readonly<Record<BulkNetwork, BulkEnvironment>> =
  {
    mainnet: {
      network: "mainnet",
      httpUrl: "https://exchange-api.bulk.trade/api/v1",
      wsUrl: "wss://exchange-ws1.bulk.trade",
      builderCodes: false,
    },
    staging: {
      network: "staging",
      httpUrl: "https://staging-api.bulk.trade/api/v1",
      wsUrl: "wss://staging-ws.bulk.trade",
      builderCodes: true,
    },
  };

export function getBulkEnvironment(network: BulkNetwork): BulkEnvironment {
  return BULK_ENVIRONMENTS[network];
}
