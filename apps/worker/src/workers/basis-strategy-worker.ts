/* eslint-disable no-console */

import { BulkClient, getExchangeInfo, type MarketSpec } from "@klub/api-client";
import {
  basisStrategyControls,
  basisStrategyRuns,
  reconciliationItems,
  type Db,
} from "@klub/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import {
  loadStrategyAccount,
  type StrategyAccountSnapshot,
  waitForStrategyPair,
} from "./basis-strategy-account.js";
import { marketMap, requireMarket } from "./basis-market-map.js";
import { strategyConfig } from "./basis-strategy-config.js";
import { submitAtomicStrategyOrders } from "./basis-strategy-execution.js";
import { requestBulkStrategyFaucet } from "./basis-strategy-faucet.js";
import {
  assessStrategyRisk,
  buildLegOrder,
  defaultBasisStrategyPolicy,
  selectStrategyOpportunity,
  validateStrategyRisk,
  type BasisStrategyPolicy,
} from "./basis-strategy-policy.js";
import { fetchCurrentFundingRates } from "./funding-arb-detector.js";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1_000;

export interface BasisStrategyResult {
  readonly status: "opened" | "holding" | "closed" | "idle" | "paused";
  readonly detail: string;
}

export function startBasisStrategyWorker({
  db,
  intervalMs = DEFAULT_INTERVAL_MS,
  logger = console,
}: {
  readonly db: Db;
  readonly intervalMs?: number;
  readonly logger?: Pick<Console, "error" | "log">;
}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runBasisStrategyOnce({ db });
      logger.log(`[basis-strategy] ${JSON.stringify(result)}`);
    } catch (error) {
      logger.error("[basis-strategy] cycle failed", error);
      await recordStrategyError(db, error).catch((recordError) =>
        logger.error("[basis-strategy] error state failed", recordError),
      );
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return { close: () => clearInterval(timer) };
}

export async function runBasisStrategyOnce({
  db,
  policy = defaultBasisStrategyPolicy(),
}: {
  readonly db: Db;
  readonly policy?: BasisStrategyPolicy;
}): Promise<BasisStrategyResult> {
  const config = strategyConfig();
  const control = await loadControl(db, config.account);
  if (control.paused || !config.executionEnabled) {
    if (control.paused && isRecoverableTestnetPause(control.pauseReason)) {
      await updateControl(db, config.account, {
        paused: false,
        pauseReason: null,
        consecutiveErrors: 0,
      });
    } else {
      return {
        status: "paused",
        detail: control.pauseReason ?? "Execution paused.",
      };
    }
  }

  const client = new BulkClient({
    baseUrl: config.bulkApiUrl,
    timeoutMs: 20_000,
  });
  let account = await loadStrategyAccount(client, config.account);
  if (account.equityUsd <= 0) {
    const faucet = await requestBulkStrategyFaucet({
      client,
      account: config.account,
      secret: config.secret,
    });
    account = await loadStrategyAccount(client, config.account);
    if (account.equityUsd <= 0) {
      return {
        status: "idle",
        detail:
          faucet === "accepted"
            ? "Bulk strategy faucet accepted; waiting for account equity."
            : "Bulk strategy faucet is on cooldown and account has no equity.",
      };
    }
  }
  const [rates, exchangeInfo] = await Promise.all([
    fetchCurrentFundingRates({ wsUrl: config.wsUrl, timeoutMs: 15_000 }),
    getExchangeInfo(client),
  ]);
  const peakEquityUsd = Math.max(control.peakEquityUsd, account.equityUsd);
  const risk = assessStrategyRisk({
    equityUsd: account.equityUsd,
    availableUsd: account.availableUsd,
    grossNotionalUsd: account.positions.reduce(
      (sum, position) => sum + position.notionalUsd,
      0,
    ),
    peakEquityUsd,
  });
  const riskViolation = validateStrategyRisk(risk, policy);
  await updateControl(db, config.account, {
    peakEquityUsd,
    lastEquityUsd: account.equityUsd,
    lastReconciledAt: new Date(),
    consecutiveErrors: 0,
  });

  if (riskViolation) {
    if (account.positions.length > 0) {
      await closePositions({
        db,
        client,
        config,
        account,
        exchangeInfo,
        risk,
        policy,
      });
    }
    await pauseStrategy(db, config.account, riskViolation);
    return { status: "paused", detail: riskViolation };
  }

  if (account.positions.length === 0) {
    const opportunity = selectStrategyOpportunity(rates, policy);
    if (!opportunity) {
      return {
        status: "idle",
        detail: "No eligible major-market funding spread.",
      };
    }
    const availableRiskCapital = Math.max(
      0,
      account.equityUsd * (1 - policy.liquidityReservePct / 100),
    );
    const legNotional = Math.min(
      policy.maxLegNotionalUsd,
      policy.maxGrossNotionalUsd / 2,
      availableRiskCapital / 2,
    );
    if (legNotional <= 0) {
      return {
        status: "idle",
        detail: "Liquidity reserve leaves no deployable capital.",
      };
    }
    const markets = marketMap(exchangeInfo);
    const longMarket = requireMarket(markets, opportunity.long.symbol);
    const shortMarket = requireMarket(markets, opportunity.short.symbol);
    const longOrder = buildLegOrder({
      symbol: opportunity.long.symbol,
      isBuy: true,
      reduceOnly: false,
      notionalUsd: legNotional,
      markPrice: opportunity.long.lastPrice,
      market: longMarket,
      maxSlippageBps: policy.maxSlippageBps,
    });
    const shortOrder = buildLegOrder({
      symbol: opportunity.short.symbol,
      isBuy: false,
      reduceOnly: false,
      notionalUsd: legNotional,
      markPrice: opportunity.short.lastPrice,
      market: shortMarket,
      maxSlippageBps: policy.maxSlippageBps,
    });
    const [run] = await db
      .insert(basisStrategyRuns)
      .values({
        sourceAccount: config.account,
        state: "discovered",
        longSymbol: longOrder.symbol,
        shortSymbol: shortOrder.symbol,
        longSize: longOrder.size,
        shortSize: shortOrder.size,
        targetNotionalUsd: legNotional * 2,
        expectedAnnualPct: opportunity.annualSpreadPct,
        riskSnapshot: risk,
      })
      .returning({ id: basisStrategyRuns.id });
    if (!run) throw new Error("Failed to create Basis strategy run.");
    await setRunState(db, run.id, "validated");
    await setRunState(db, run.id, "submitting");
    try {
      const submission = await submitAtomicStrategyOrders({
        client,
        account: config.account,
        secret: config.secret,
        orders: [longOrder, shortOrder],
      });
      const verifiedAccount = await waitForStrategyPair(client, config.account);
      const verificationError = reconcileOpenPair(verifiedAccount, policy);
      if (verificationError) {
        await setRunFailure(db, run.id, verificationError);
        await recordReconciliation(
          db,
          config.account,
          verificationError,
          verifiedAccount,
        );
        if (verifiedAccount.positions.length > 0) {
          await closePositions({
            db,
            client,
            config,
            account: verifiedAccount,
            exchangeInfo,
            risk: assessStrategyRisk({
              equityUsd: verifiedAccount.equityUsd,
              availableUsd: verifiedAccount.availableUsd,
              grossNotionalUsd: verifiedAccount.positions.reduce(
                (sum, position) => sum + position.notionalUsd,
                0,
              ),
              peakEquityUsd,
            }),
            policy,
          });
        }
        await pauseStrategy(db, config.account, verificationError);
        return { status: "paused", detail: verificationError };
      }
      await db
        .update(basisStrategyRuns)
        .set({
          state: "open",
          orderIds: submission.orderIds,
          venueResponse: submission.response,
          openedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(basisStrategyRuns.id, run.id));
      return {
        status: "opened",
        detail: `Long ${longOrder.symbol}, short ${shortOrder.symbol}, ${opportunity.annualSpreadPct.toFixed(2)}% current annual spread.`,
      };
    } catch (error) {
      await setRunFailure(db, run.id, error);
      throw error;
    }
  }

  const reconciliationError = reconcileOpenPair(account, policy);
  if (reconciliationError) {
    await recordReconciliation(
      db,
      config.account,
      reconciliationError,
      account,
    );
    await closePositions({
      db,
      client,
      config,
      account,
      exchangeInfo,
      risk,
      policy,
    });
    await pauseStrategy(db, config.account, reconciliationError);
    return { status: "paused", detail: reconciliationError };
  }

  const long = account.positions.find((position) => position.size > 0);
  const short = account.positions.find((position) => position.size < 0);
  const longRate = rates.find((rate) => rate.symbol === long?.symbol);
  const shortRate = rates.find((rate) => rate.symbol === short?.symbol);
  const annualSpreadPct =
    longRate && shortRate
      ? (shortRate.fundingRate - longRate.fundingRate) * 24 * 365
      : Number.NEGATIVE_INFINITY;
  if (annualSpreadPct < policy.exitAnnualSpreadPct) {
    await closePositions({
      db,
      client,
      config,
      account,
      exchangeInfo,
      risk,
      policy,
    });
    return {
      status: "closed",
      detail: "Funding spread fell below the exit threshold.",
    };
  }
  return {
    status: "holding",
    detail: `${annualSpreadPct.toFixed(2)}% current annual spread; risk limits healthy.`,
  };
}

async function closePositions({
  db,
  client,
  config,
  account,
  exchangeInfo,
  risk,
  policy,
}: {
  readonly db: Db;
  readonly client: BulkClient;
  readonly config: ReturnType<typeof strategyConfig>;
  readonly account: StrategyAccountSnapshot;
  readonly exchangeInfo: readonly MarketSpec[];
  readonly risk: unknown;
  readonly policy: BasisStrategyPolicy;
}) {
  const markets = marketMap(exchangeInfo);
  const orders = account.positions.map((position) =>
    buildLegOrder({
      symbol: position.symbol,
      isBuy: position.size < 0,
      reduceOnly: true,
      notionalUsd: Math.abs(position.size) * position.markPrice,
      markPrice: position.markPrice,
      market: requireMarket(markets, position.symbol),
      maxSlippageBps: policy.maxSlippageBps,
    }),
  );
  const [activeRun] = await db
    .select({ id: basisStrategyRuns.id })
    .from(basisStrategyRuns)
    .where(
      and(
        eq(basisStrategyRuns.sourceAccount, config.account),
        inArray(basisStrategyRuns.state, ["open", "reconciliation_required"]),
      ),
    )
    .orderBy(desc(basisStrategyRuns.createdAt))
    .limit(1);
  if (activeRun) await setRunState(db, activeRun.id, "closing");
  const result = await submitAtomicStrategyOrders({
    client,
    account: config.account,
    secret: config.secret,
    orders,
  });
  if (activeRun) {
    await db
      .update(basisStrategyRuns)
      .set({
        state: "closed",
        venueResponse: result.response,
        riskSnapshot: risk,
        closedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(basisStrategyRuns.id, activeRun.id));
  }
}

function reconcileOpenPair(
  account: StrategyAccountSnapshot,
  policy: BasisStrategyPolicy,
): string | null {
  if (account.positions.length !== 2)
    return "Expected exactly two open strategy legs.";
  const long = account.positions.find((position) => position.size > 0);
  const short = account.positions.find((position) => position.size < 0);
  if (!long || !short) return "Strategy legs are not opposite sides.";
  const imbalance =
    (Math.abs(long.notionalUsd - short.notionalUsd) /
      Math.max(long.notionalUsd, short.notionalUsd)) *
    100;
  if (imbalance > policy.maxNotionalImbalancePct)
    return `Strategy notional imbalance reached ${imbalance.toFixed(2)}%.`;
  const allowed = policy.allowedPairs.some(
    (pair) =>
      pair === `${long.symbol}:${short.symbol}` ||
      pair === `${short.symbol}:${long.symbol}`,
  );
  return allowed
    ? null
    : "An unapproved market is open in the strategy account.";
}

async function loadControl(db: Db, account: string) {
  await db
    .insert(basisStrategyControls)
    .values({ sourceAccount: account })
    .onConflictDoNothing();
  const [control] = await db
    .select()
    .from(basisStrategyControls)
    .where(eq(basisStrategyControls.sourceAccount, account))
    .limit(1);
  if (!control) throw new Error("Basis strategy control state unavailable.");
  return control;
}

async function updateControl(
  db: Db,
  account: string,
  values: Partial<typeof basisStrategyControls.$inferInsert>,
) {
  await db
    .update(basisStrategyControls)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(basisStrategyControls.sourceAccount, account));
}

async function pauseStrategy(db: Db, account: string, reason: string) {
  await updateControl(db, account, { paused: true, pauseReason: reason });
}

async function recordStrategyError(db: Db, error: unknown) {
  const account = process.env.BASIS_BULK_STRATEGY_ACCOUNT?.trim();
  if (!account) return;
  const control = await loadControl(db, account);
  const errors = control.consecutiveErrors + 1;
  await updateControl(db, account, {
    consecutiveErrors: errors,
    ...(errors >= 3
      ? {
          paused: true,
          pauseReason: "Paused after three consecutive strategy errors.",
        }
      : {}),
  });
  if (errors >= 3) console.error("[basis-strategy] auto-paused", error);
}

async function setRunState(
  db: Db,
  id: string,
  state: typeof basisStrategyRuns.$inferInsert.state,
) {
  await db
    .update(basisStrategyRuns)
    .set({ state, updatedAt: new Date() })
    .where(eq(basisStrategyRuns.id, id));
}

async function setRunFailure(db: Db, id: string, error: unknown) {
  await db
    .update(basisStrategyRuns)
    .set({
      state: "reconciliation_required",
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date(),
    })
    .where(eq(basisStrategyRuns.id, id));
}

async function recordReconciliation(
  db: Db,
  account: string,
  difference: string,
  snapshot: StrategyAccountSnapshot,
) {
  await db.insert(reconciliationItems).values({
    entityType: "basis_strategy",
    entityId: account,
    difference: { message: difference, positions: snapshot.positions },
    correlationId: randomUUID(),
  });
}

function isRecoverableTestnetPause(reason: string | null): boolean {
  const normalized = reason?.toLowerCase() ?? "";
  return (
    normalized.includes("no equity") ||
    normalized.includes("consecutive strategy errors")
  );
}
