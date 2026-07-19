import type { BulkClient } from "@klub/api-client";
import { z } from "zod";

const currentPosition = z
  .object({
    symbol: z.string(),
    size: z.number(),
    fairPrice: z.number().optional(),
    price: z.number().optional(),
    notional: z.number().optional(),
  })
  .passthrough();
const currentAccount = z
  .object({
    margin: z
      .object({
        totalBalance: z.number(),
        availableBalance: z.number(),
        marginUsed: z.number(),
        notional: z.number(),
        realizedPnl: z.number(),
        unrealizedPnl: z.number(),
        fees: z.number(),
        funding: z.number(),
      })
      .passthrough(),
    positions: z.array(currentPosition),
  })
  .passthrough();
const currentEnvelope = z.array(z.object({ fullAccount: currentAccount }));

export interface StrategyPosition {
  readonly symbol: string;
  readonly size: number;
  readonly markPrice: number;
  readonly notionalUsd: number;
}

export interface StrategyAccountSnapshot {
  readonly equityUsd: number;
  readonly availableUsd: number;
  readonly marginUsedUsd: number;
  readonly realizedPnlUsd: number;
  readonly unrealizedPnlUsd: number;
  readonly fundingPnlUsd: number;
  readonly feesUsd: number;
  readonly positions: readonly StrategyPosition[];
}

export async function loadStrategyAccount(
  client: BulkClient,
  account: string,
): Promise<StrategyAccountSnapshot> {
  const payload = await client.postUnsigned<
    { readonly type: "fullAccount"; readonly user: string },
    unknown
  >("/account", { type: "fullAccount", user: account });
  const parsed = currentEnvelope.safeParse(payload);
  if (!parsed.success || !parsed.data[0]) {
    throw new Error(
      "Bulk fullAccount response did not match the supported schema.",
    );
  }
  const accountState = parsed.data[0].fullAccount;
  return {
    equityUsd: accountState.margin.totalBalance,
    availableUsd: accountState.margin.availableBalance,
    marginUsedUsd: accountState.margin.marginUsed,
    realizedPnlUsd: accountState.margin.realizedPnl,
    unrealizedPnlUsd: accountState.margin.unrealizedPnl,
    fundingPnlUsd: accountState.margin.funding,
    feesUsd: accountState.margin.fees,
    positions: accountState.positions
      .filter((position) => Math.abs(position.size) > 0)
      .map((position) => ({
        symbol: position.symbol,
        size: position.size,
        markPrice: position.fairPrice ?? position.price ?? 0,
        notionalUsd: Math.abs(
          position.notional ??
            position.size * (position.fairPrice ?? position.price ?? 0),
        ),
      })),
  };
}

export async function waitForStrategyPair(
  client: BulkClient,
  account: string,
  attempts = 5,
): Promise<StrategyAccountSnapshot> {
  let snapshot = await loadStrategyAccount(client, account);
  for (
    let attempt = 0;
    attempt < attempts && snapshot.positions.length !== 2;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    snapshot = await loadStrategyAccount(client, account);
  }
  return snapshot;
}
