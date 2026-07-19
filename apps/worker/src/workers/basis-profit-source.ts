import {
  queryUserFills,
  queryUserFundingPayments,
  type BulkClient,
  type FundingPayment,
  type UserFill,
} from "@klub/api-client";

import { loadStrategyAccount } from "./basis-strategy-account.js";
import { computeLeaderMetrics } from "./leader-metrics.js";

export interface BasisProfitSource {
  readonly netPnlUsd: number;
  readonly historyNetPnlUsd: number;
  readonly liveRealizedNetPnlUsd: number;
  readonly sourceTimestamp: bigint;
}

export async function loadBasisProfitSource(
  client: BulkClient,
  sourceAccount: string,
): Promise<BasisProfitSource> {
  const [fills, funding, account] = await Promise.all([
    queryUserFills(client, sourceAccount),
    queryUserFundingPayments(client, sourceAccount),
    loadStrategyAccount(client, sourceAccount),
  ]);
  const metrics = computeLeaderMetrics(fills, funding);
  const liveRealizedNetPnlUsd = realizedFundingPnlUsd({
    realizedPnlUsd: account.realizedPnlUsd,
    fundingPnlUsd: account.fundingPnlUsd,
    feesUsd: account.feesUsd,
  });

  return {
    netPnlUsd: selectCreditablePnlUsd({
      historyNetPnlUsd: metrics.netPnlUsd,
      liveRealizedNetPnlUsd,
    }),
    historyNetPnlUsd: metrics.netPnlUsd,
    liveRealizedNetPnlUsd,
    sourceTimestamp: latestSourceTimestamp(
      fills,
      funding,
      liveRealizedNetPnlUsd,
    ),
  };
}

export function selectCreditablePnlUsd({
  historyNetPnlUsd,
  liveRealizedNetPnlUsd,
}: {
  readonly historyNetPnlUsd: number;
  readonly liveRealizedNetPnlUsd: number;
}): number {
  return Math.max(historyNetPnlUsd, liveRealizedNetPnlUsd);
}

export function realizedFundingPnlUsd({
  realizedPnlUsd,
  fundingPnlUsd,
  feesUsd,
}: {
  readonly realizedPnlUsd: number;
  readonly fundingPnlUsd: number;
  readonly feesUsd: number;
}): number {
  return roundToCents(realizedPnlUsd + fundingPnlUsd - Math.abs(feesUsd));
}

export function latestSourceTimestamp(
  fills: readonly Pick<UserFill, "timestamp">[],
  funding: readonly Pick<FundingPayment, "timestamp">[],
  liveRealizedNetPnlUsd: number,
): bigint {
  const latestHistoryTimestamp = Math.max(
    0,
    ...fills.map((row) => row.timestamp),
    ...funding.map((row) => row.timestamp),
  );
  return BigInt(
    latestHistoryTimestamp > 0 || liveRealizedNetPnlUsd <= 0
      ? latestHistoryTimestamp
      : Date.now(),
  );
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}
