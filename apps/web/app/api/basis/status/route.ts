import {
  basisOperatorStates,
  basisStrategyControls,
  basisStrategyRuns,
  basisYieldCredits,
  createDbClient,
} from "@klub/db";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const USDC_SCALE = 1_000_000;

export async function GET() {
  const databaseUrl = process.env["DATABASE_URL"];
  const sourceAccount = process.env["BASIS_BULK_STRATEGY_ACCOUNT"]?.trim();

  if (!databaseUrl || !sourceAccount) {
    return NextResponse.json(
      {
        ok: false,
        status: "not_configured",
        message: !databaseUrl
          ? "DATABASE_URL is not configured."
          : "BASIS_BULK_STRATEGY_ACCOUNT is not configured.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const db = createDbClient({
      connectionString: databaseUrl,
      maxConnections: 1,
      idleTimeoutSeconds: 5,
    });
    const [controls, operatorStates, runs, credits] = await Promise.all([
      db
        .select()
        .from(basisStrategyControls)
        .where(eq(basisStrategyControls.sourceAccount, sourceAccount))
        .limit(1),
      db
        .select()
        .from(basisOperatorStates)
        .where(eq(basisOperatorStates.sourceAccount, sourceAccount))
        .limit(1),
      db
        .select()
        .from(basisStrategyRuns)
        .where(eq(basisStrategyRuns.sourceAccount, sourceAccount))
        .orderBy(desc(basisStrategyRuns.createdAt))
        .limit(5),
      db
        .select()
        .from(basisYieldCredits)
        .where(eq(basisYieldCredits.sourceAccount, sourceAccount))
        .orderBy(desc(basisYieldCredits.createdAt))
        .limit(20),
    ]);

    const control = controls[0] ?? null;
    const operator = operatorStates[0] ?? null;
    const latestRun = runs[0] ?? null;
    const confirmedCreditRaw = credits
      .filter((credit) => credit.status === "confirmed")
      .reduce((sum, credit) => sum + credit.amountRaw, 0n);
    const pendingCreditRaw = credits
      .filter((credit) => credit.status !== "confirmed")
      .reduce((sum, credit) => sum + credit.amountRaw, 0n);
    const latestCreditError =
      credits.find((credit) => credit.error)?.error ?? null;
    const sourceProfitRaw = operator?.highWaterPnlRaw ?? 0n;
    const creditedRaw = operator?.creditedYieldRaw ?? 0n;

    return NextResponse.json(
      {
        ok: true,
        status: classifyStatus({
          control,
          operator,
          latestRun,
          sourceProfitRaw,
          confirmedCreditRaw,
          latestCreditError,
        }),
        strategy: control
          ? {
              paused: control.paused,
              pauseReason: control.pauseReason,
              consecutiveErrors: control.consecutiveErrors,
              lastEquityUsd: control.lastEquityUsd,
              lastReconciledAt: control.lastReconciledAt,
            }
          : null,
        latestRun: latestRun
          ? {
              state: latestRun.state,
              longSymbol: latestRun.longSymbol,
              shortSymbol: latestRun.shortSymbol,
              expectedAnnualPct: latestRun.expectedAnnualPct,
              error: latestRun.error,
              openedAt: latestRun.openedAt,
              closedAt: latestRun.closedAt,
              updatedAt: latestRun.updatedAt,
            }
          : null,
        operator: operator
          ? {
              sourceProfitUsdc: rawToUsdc(sourceProfitRaw),
              creditedUsdc: rawToUsdc(creditedRaw),
              availableProfitUsdc: rawToUsdc(sourceProfitRaw - creditedRaw),
              updatedAt: operator.updatedAt,
            }
          : null,
        credits: {
          confirmedUsdc: rawToUsdc(confirmedCreditRaw),
          pendingUsdc: rawToUsdc(pendingCreditRaw),
          latestError: latestCreditError,
          recent: credits.slice(0, 5).map((credit) => ({
            status: credit.status,
            amountUsdc: rawToUsdc(credit.amountRaw),
            error: credit.error,
            updatedAt: credit.updatedAt,
          })),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        message:
          error instanceof Error ? error.message : "Basis status failed.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function classifyStatus({
  control,
  operator,
  latestRun,
  sourceProfitRaw,
  confirmedCreditRaw,
  latestCreditError,
}: {
  readonly control: typeof basisStrategyControls.$inferSelect | null;
  readonly operator: typeof basisOperatorStates.$inferSelect | null;
  readonly latestRun: typeof basisStrategyRuns.$inferSelect | null;
  readonly sourceProfitRaw: bigint;
  readonly confirmedCreditRaw: bigint;
  readonly latestCreditError: string | null;
}) {
  if (control?.paused) return "strategy_paused";
  if (!operator) return "operator_not_seen";
  if (!latestRun) return "strategy_not_seen";
  if (latestCreditError) return "credit_error";
  if (sourceProfitRaw <= 0n) return "waiting_for_profit";
  if (confirmedCreditRaw <= 0n) return "waiting_for_credit";
  return "crediting";
}

function rawToUsdc(value: bigint): number {
  return Number(value) / USDC_SCALE;
}
