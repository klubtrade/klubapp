"use client";

import { healthScore, type HealthOutput } from "@klub/calc";
import Link from "next/link";
import { useMemo } from "react";

import { EmptyState } from "@/components/empty-state";
import { useToast } from "@/components/toast";
import {
  ActionCircle,
  FaucetClaimRow,
  IconAdd,
  IconReceive,
  IconSend,
  IconTrade,
} from "@/app/(app)/cash/_components";
import {
  useBulkAccount,
  type BulkAccountSnapshot,
} from "@/hooks/use-bulk-account";
import { useConnectionState } from "@/hooks/use-connection-state";
import { useRiskSurfacesRest } from "@/hooks/use-risk-surfaces-rest";
import { useTickers } from "@/hooks/use-tickers";
import { useWalletGate } from "@/hooks/use-wallet-gate";
import { buildHealthInput } from "@/lib/health-input";
import { MARKETS, SEED_PRICES, type MarketSymbol } from "@/lib/markets";
import { buildPortfolioRiskView } from "@/lib/portfolio-risk";
import { useTradingWallet } from "@/lib/trading-wallet";

/**
 * /portfolio - balance, positions, and liquidation risk in one place.
 *
 * Two distinct surfaces depending on connection state:
 *
 *   - Connected: Revolut/Venmo-style account home. Hero total balance,
 *     short action row, then a portfolio-level risk summary above the
 *     positions and free-margin snapshot.
 *
 *   - Disconnected: minimal welcome with one primary CTA. "What do you
 *     want to do?" was the original framing; kept because it's a clear
 *     entry pitch for a brand-new visitor.
 *
 * The health score and closest liquidation buffer use the same shared
 * pipeline as the detailed /health drill-down.
 */

const TICKER_SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD"] as const;

export default function HomePage() {
  const { connected, mounted } = useWalletGate();

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-4xl">
        {connected ? <ConnectedHome /> : <DisconnectedHome />}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Connected: Revolut-style dashboard
// ---------------------------------------------------------------------------

function ConnectedHome() {
  const toast = useToast();
  const wallet = useTradingWallet();
  const pubkey = wallet.publicKeyBase58;
  const { state: accountState } = useBulkAccount(pubkey);
  const snapshot = accountState.data;

  const allSymbols = useMemo<readonly MarketSymbol[]>(
    () => MARKETS.map((m) => m.symbol),
    [],
  );
  const livePrices = useTickers(allSymbols);
  const { params: mmSurfaces } = useRiskSurfacesRest();

  const equity = snapshot?.equityUsd ?? null;
  const accountUnavailable = snapshot?.unavailable === true;
  const totalPnl = snapshot?.unrealizedPnlUsd ?? null;
  const portfolioHealth = useMemo<HealthOutput | null>(() => {
    const input = buildHealthInput(snapshot, livePrices, mmSurfaces);
    if (!input) return null;
    try {
      return healthScore(input);
    } catch {
      return null;
    }
  }, [snapshot, livePrices, mmSurfaces]);

  return (
    <>
      <header>
        <div className="mt-3 flex items-end justify-between gap-5">
          <div>
            <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] md:text-[40px]">
              Portfolio
            </h1>
            <p className="mt-2 text-[13px] text-fg-muted">
              Your exposure, at a glance.
            </p>
          </div>
          <Link
            href="/health"
            className="shrink-0 pb-1 text-[12px] text-fg-muted transition-colors hover:text-accent"
          >
            Risk details →
          </Link>
        </div>
      </header>

      <section className="mt-7 overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface">
        <div className="grid gap-5 p-5 sm:grid-cols-2 md:p-6">
          <PortfolioMetric
            label="Total equity"
            value={equity === null ? "-" : `$${formatUsd(equity)}`}
          />
          <PortfolioMetric
            label="Unrealized PnL"
            value={
              totalPnl === null
                ? "-"
                : `${totalPnl >= 0 ? "+" : "−"}$${formatUsd(Math.abs(totalPnl))}`
            }
            tone={
              totalPnl === null
                ? "neutral"
                : totalPnl >= 0
                  ? "positive"
                  : "negative"
            }
          />
        </div>
        <div className="grid grid-cols-4 gap-2 border-t border-border-subtle px-4 py-4 sm:px-6">
          <ActionCircle label="Trade" href="/trade" icon={<IconTrade />} />
          <ActionCircle label="Receive" href="/cash" icon={<IconReceive />} />
          <ActionCircle label="Add funds" href="/cash/add" icon={<IconAdd />} />
          <ActionCircle label="Transfer" href="/cash" icon={<IconSend />} />
        </div>
      </section>

      <FaucetClaimRow
        pubkey={pubkey}
        connected={wallet.connected}
        label="Master"
        isMaster
        onResult={(result) => {
          if (result.ok) toast.success("Test funds claimed");
          else toast.warning("Could not claim test funds", result.message);
        }}
      />

      {accountUnavailable && (
        <div className="mt-4 rounded-klub border border-alert-orange/30 bg-alert-orange/5 px-4 py-3 text-[12px] leading-relaxed text-alert-orange">
          {snapshot?.warning ??
            "Bulk exchange is temporarily unavailable. Please try again in a few minutes."}
        </div>
      )}

      <RiskSummary
        result={accountUnavailable ? null : portfolioHealth}
        positionCount={snapshot?.positions.length ?? null}
        equity={snapshot?.equityUsd ?? null}
        freeMargin={snapshot?.freeMarginUsd ?? null}
      />

      <PositionsPreview snapshot={accountUnavailable ? null : snapshot} />

      <section className="mt-10">
        <MarketsBlock livePrices={livePrices} />
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Disconnected: welcome
// ---------------------------------------------------------------------------

function DisconnectedHome() {
  const { promptConnect } = useWalletGate();
  const livePrices = useTickers(useMemo(() => [...TICKER_SYMBOLS], []));

  return (
    <>
      <section className="pt-12 md:pt-20">
        <h1 className="text-[36px] font-semibold leading-[1.05] tracking-[-0.025em] md:text-[44px]">
          The retail gateway to Bulk Haven.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-secondary">
          Connect a wallet, claim test USDC, and trade on Bulk through a simpler
          retail flow.
        </p>

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={promptConnect}
            className="btn-primary btn-block btn-lg"
          >
            Connect wallet
          </button>
          <Link
            href="/copy"
            className="block text-center text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
          >
            Browse leaders without connecting →
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <MarketsBlock livePrices={livePrices} />
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Portfolio-only summaries. Funding owns balances and money movement;
// this screen owns exposure, risk, and open positions.
// ---------------------------------------------------------------------------

function PortfolioMetric({
  label,
  value,
  tone = "neutral",
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: "neutral" | "positive" | "negative";
}) {
  const valueTone =
    tone === "positive"
      ? "text-pnl-long"
      : tone === "negative"
        ? "text-pnl-short"
        : "text-fg-primary";
  return (
    <div className="p-1 sm:border-r sm:border-border-subtle sm:last:border-r-0">
      <div className="text-[10px] uppercase tracking-[0.1em] text-fg-muted">
        {label}
      </div>
      <div
        className={`mt-2 font-mono text-[20px] font-semibold tracking-[-0.02em] ${valueTone}`}
      >
        {value}
      </div>
    </div>
  );
}

function PositionsPreview({
  snapshot,
}: {
  readonly snapshot: BulkAccountSnapshot | null;
}) {
  const positions = snapshot?.positions ?? [];
  return (
    <section className="mt-9">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-fg-primary">
          Open positions
        </h2>
        <Link href="/trade" className="text-[11px] text-accent">
          Trade →
        </Link>
      </div>
      <div className="mt-3 overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface">
        {snapshot === null ? (
          <div className="px-4 py-6 text-[12px] text-fg-muted">
            Loading positions…
          </div>
        ) : positions.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="No open exposure"
              description="Your positions and unrealized PnL will appear here after your first trade."
              primaryCta={{ label: "Open Simple Trade", href: "/trade" }}
              secondaryCta={{ label: "Add funds", href: "/cash" }}
            />
          </div>
        ) : (
          positions.slice(0, 4).map((position) => {
            const pnl = position.unrealizedPnlUsd;
            return (
              <div
                key={position.symbol}
                className="flex items-center justify-between border-b border-border-subtle px-4 py-3 last:border-0"
              >
                <div>
                  <div className="font-mono text-[13px] font-medium text-fg-primary">
                    {position.symbol}
                  </div>
                  <div className="mt-1 text-[10px] text-fg-muted">
                    {position.sizeBase >= 0 ? "Long" : "Short"} ·{" "}
                    {Math.abs(position.sizeBase).toFixed(4)}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-mono text-[12px] ${pnl === null ? "text-fg-muted" : pnl >= 0 ? "text-pnl-long" : "text-pnl-short"}`}
                  >
                    {pnl === null
                      ? "-"
                      : `${pnl >= 0 ? "+" : "−"}$${formatUsd(Math.abs(pnl))}`}
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-fg-muted">
                    @ ${formatUsd(position.entryPrice)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Risk summary + account stats
// ---------------------------------------------------------------------------

function RiskSummary({
  result,
  positionCount,
  equity,
  freeMargin,
}: {
  readonly result: HealthOutput | null;
  readonly positionCount: number | null;
  readonly equity: number | null;
  readonly freeMargin: number | null;
}) {
  const view = buildPortfolioRiskView({ positionCount, result });
  const marginUsage =
    equity !== null && equity > 0 && freeMargin !== null
      ? Math.max(0, Math.min(100, ((equity - freeMargin) / equity) * 100))
      : null;
  const riskLabel =
    view.state === "flat"
      ? "Low"
      : view.state === "active"
        ? view.level === "safe"
          ? "Low"
          : view.level === "watch"
            ? "Watch"
            : view.level === "risky"
              ? "High"
              : "Critical"
        : "-";
  const riskTone =
    riskLabel === "Low"
      ? "text-pnl-long"
      : riskLabel === "Watch"
        ? "text-accent"
        : riskLabel === "-"
          ? "text-fg-muted"
          : "text-pnl-short";

  return (
    <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-medium text-fg-primary">
          Health overview
        </h2>
        <Link href="/health" className="text-[11px] text-accent">
          Details →
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-3 divide-x divide-border-subtle">
        <HealthMetric
          label="Liquidation risk"
          value={riskLabel}
          tone={riskTone}
        />
        <HealthMetric
          label="Margin usage"
          value={marginUsage === null ? "-" : `${marginUsage.toFixed(2)}%`}
        />
        <HealthMetric
          label="Buying power"
          value={freeMargin === null ? "-" : `$${formatUsd(freeMargin)}`}
        />
      </div>
    </section>
  );
}

function HealthMetric({
  label,
  value,
  tone = "text-fg-primary",
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: string;
}) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <div className="text-[9px] text-fg-muted sm:text-[10px]">{label}</div>
      <div
        className={`mt-2 truncate font-mono text-[15px] font-semibold sm:text-[18px] ${tone}`}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markets snapshot
// ---------------------------------------------------------------------------

function MarketsBlock({
  livePrices,
}: {
  readonly livePrices: Record<string, { mark: number } | undefined>;
}) {
  const { isLive, isDemo } = useConnectionState();

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[15px] font-semibold tracking-tight">Markets</div>
        {isLive && (
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-pnl-long">
            <span className="h-1 w-1 animate-pulse-accent rounded-full bg-pnl-long" />
            Live
          </span>
        )}
        {isDemo && (
          <span
            className="text-[10px] uppercase tracking-[0.08em] text-fg-muted"
            title="No WS URL configured"
          >
            Demo
          </span>
        )}
      </div>
      <ul className="overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface">
        {TICKER_SYMBOLS.map((sym, i) => {
          const mark =
            livePrices[sym]?.mark ?? SEED_PRICES[sym as MarketSymbol] ?? 0;
          return (
            <li
              key={sym}
              className={`flex items-center justify-between px-4 py-3 ${i > 0 ? "border-t border-border-subtle" : ""}`}
            >
              <span className="text-[13px] font-medium text-fg-primary">
                {sym.replace("-USD", "")}
              </span>
              <span className="font-mono text-[13px] text-fg-secondary">
                ${formatPrice(mark)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(p: number): string {
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
