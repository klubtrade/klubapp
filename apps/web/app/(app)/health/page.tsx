"use client";

import {
  healthScore,
  type HealthInput,
  type HealthOutput,
  type SubScore,
} from "@klub/calc";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { useBulkAccount } from "@/hooks/use-bulk-account";
import { useRiskSurfacesRest } from "@/hooks/use-risk-surfaces-rest";
import { useTickers } from "@/hooks/use-tickers";
import { buildHealthInput } from "@/lib/health-input";
import { marketData } from "@/lib/market-data/client";
import { MARKETS, type MarketSymbol } from "@/lib/markets";
import { useTradingWallet } from "@/lib/trading-wallet";

const BAND_TONE: Record<HealthOutput["band"], string> = {
  healthy: "text-pnl-long",
  fine: "text-pnl-long",
  caution: "text-accent",
  risky: "text-alert-orange",
  critical: "text-pnl-short",
};

const BAND_LABEL: Record<HealthOutput["band"], string> = {
  healthy: "Healthy",
  fine: "Fine",
  caution: "Watch it",
  risky: "Risky",
  critical: "Critical",
};

export default function HealthPage() {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showAdvice, setShowAdvice] = useState(false);
  const [, setRiskTick] = useState(0);
  const subscribedRef = useRef<Set<string>>(new Set());
  const unsubscribeRef = useRef(new Map<string, () => void>());

  const wallet = useTradingWallet();
  const pubkey = wallet.publicKeyBase58;
  const { state: accountState, refresh: refreshAccount } =
    useBulkAccount(pubkey);

  // Auto-refresh the account snapshot every 10 seconds so health
  // reflects newly opened/closed positions without a manual reload.
  // `useBulkAccount` doesn't poll aggressively on its own — callers
  // like /trade invoke `refresh()` after explicit actions, but
  // /health only receives the snapshot passively, so it stales out
  // when the user trades from another page (or tab).
  useEffect(() => {
    if (!pubkey) return undefined;
    const id = setInterval(() => {
      refreshAccount();
    }, 10_000);
    return () => {
      clearInterval(id);
    };
  }, [pubkey, refreshAccount]);

  // Subscribe to tickers for every supported market so we have
  // live mark prices for PnL calc on each position. `useTickers`
  // internally uses frontendContext which delivers all markets in
  // one subscription — cheap.
  const allSymbols = useMemo<readonly MarketSymbol[]>(
    () => MARKETS.map((m) => m.symbol),
    [],
  );
  const livePrices = useTickers(allSymbols);

  const snapshot = accountState.data;
  const positions = useMemo(() => snapshot?.positions ?? [], [snapshot]);
  const connected = wallet.connected;
  const accountUnavailable = snapshot?.unavailable === true;

  // Subscribe to risk surfaces for every symbol the user has a
  // position in. Streaming is live but event-driven: on quiet
  // testnet markets frames may not arrive for long periods, so we
  // combine with the REST snapshot below. Day 3+ will prefer stream
  // data when fresher than REST.
  const symbols = useMemo(
    () => Array.from(new Set(positions.map((p) => p.symbol))),
    [positions],
  );

  useEffect(() => {
    const activeSymbols = new Set(symbols);

    for (const [symbol, unsubscribe] of unsubscribeRef.current) {
      if (activeSymbols.has(symbol)) continue;
      unsubscribe();
      unsubscribeRef.current.delete(symbol);
      subscribedRef.current.delete(symbol);
    }

    for (const symbol of symbols) {
      if (subscribedRef.current.has(symbol)) continue;
      const unsubscribeRisk = marketData.subscribeRisk(symbol);
      const unsubscribeUpdates = marketData.onRisk(symbol, () => {
        setRiskTick((n) => n + 1);
      });
      subscribedRef.current.add(symbol);
      unsubscribeRef.current.set(symbol, () => {
        unsubscribeUpdates();
        unsubscribeRisk();
      });
    }
  }, [symbols]);

  useEffect(() => {
    const unsubscribes = unsubscribeRef.current;
    const subscribed = subscribedRef.current;
    return () => {
      for (const unsubscribe of unsubscribes.values()) {
        unsubscribe();
      }
      unsubscribes.clear();
      subscribed.clear();
    };
  }, []);

  const regimeLabel = (() => {
    const regimes = symbols
      .map((symbol) =>
        extractSurfaceRegime(marketData.getLiveRiskSurface(symbol)),
      )
      .filter((regime): regime is number => typeof regime === "number");

    if (regimes.length === 0) {
      return "unavailable";
    }

    const counts = new Map<number, number>();

    for (const regime of regimes) {
      counts.set(regime, (counts.get(regime) ?? 0) + 1);
    }

    let selectedRegime: number | null = null;
    let selectedCount = -1;

    for (const regime of regimes) {
      const count = counts.get(regime) ?? 0;
      if (count > selectedCount) {
        selectedRegime = regime;
        selectedCount = count;
      }
    }

    if (selectedRegime === null) {
      return "unavailable";
    }

    return regimeLabelForValue(selectedRegime);
  })();

  // REST snapshot of per-market mm/im fractions, refreshed every 30s.
  // This is what actually powers the health math today — the stream
  // is monitored-but-unused until we see it publish reliably.
  const { params: restParams } = useRiskSurfacesRest();

  // Build the HealthInput from real data via the shared adapter so
  // /home and /health compute identical scores. The adapter now
  // routes through Bulk's margin calculator using lambdas derived
  // from `/api/risk-surfaces`.
  const healthInput = useMemo<HealthInput | null>(
    () => buildHealthInput(snapshot, livePrices, restParams),
    [snapshot, livePrices, restParams],
  );

  const result = useMemo<HealthOutput | null>(() => {
    if (!healthInput) return null;
    try {
      return healthScore(healthInput);
    } catch {
      return null;
    }
  }, [healthInput]);

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-md">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
              Health
            </h1>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-muted">
              <span>Regime · {regimeLabel}</span>
              {connected && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {positions.length}{" "}
                    {positions.length === 1 ? "position" : "positions"}
                  </span>
                </>
              )}
            </div>
          </div>
          {connected && (
            <button
              type="button"
              onClick={() => {
                refreshAccount();
              }}
              className="shrink-0 text-[11px] uppercase tracking-[0.12em] text-fg-muted transition-colors hover:text-fg-primary"
              aria-label="Refresh account"
            >
              ↻ Refresh
            </button>
          )}
        </header>

        {!connected ? (
          <EmptyState
            title="Connect your wallet"
            body="Your health score appears once you connect a wallet and open a position."
            ctaHref="/portfolio"
            ctaLabel="Go to portfolio"
          />
        ) : accountState.status === "loading" && !snapshot ? (
          <div className="mt-12 rounded-klub-lg border border-border-subtle bg-bg-surface/40 px-5 py-12 text-center text-[13px] text-fg-muted">
            Loading your account…
          </div>
        ) : accountUnavailable ? (
          <EmptyState
            title="Bulk is temporarily unavailable"
            body={
              snapshot?.warning ??
              "Bulk account data is unavailable right now. Your wallet is still connected; try refreshing in a few minutes."
            }
            ctaHref="/portfolio"
            ctaLabel="Go to portfolio"
            secondaryHref="/trade"
            secondaryLabel="Open trade"
          />
        ) : accountState.status === "error" && !snapshot ? (
          <div className="mt-12 rounded-klub-lg border border-pnl-short/30 bg-pnl-short/5 p-5 text-[13px] text-pnl-short">
            Couldn&rsquo;t load your account.{" "}
            {accountState.error ?? "Try again in a moment."}
          </div>
        ) : positions.length === 0 ? (
          <EmptyState
            title="No positions yet"
            body="Your health score tracks liquidation risk, leverage, concentration, and funding burn across your open positions. Open a trade to get started — or run a hypothetical through the calculator first."
            ctaHref="/trade"
            ctaLabel="Open a trade"
            secondaryHref="/calculator"
            secondaryLabel="Try the calculator"
          />
        ) : result ? (
          <HealthReadout
            result={result}
            showBreakdown={showBreakdown}
            showAdvice={showAdvice}
            onToggleBreakdown={() => {
              setShowBreakdown((v) => !v);
            }}
            onToggleAdvice={() => {
              setShowAdvice((v) => !v);
            }}
          />
        ) : (
          <div className="mt-12 rounded-klub-lg border border-border-subtle bg-bg-surface/40 px-5 py-10 text-center text-[13px] text-fg-muted">
            Unable to compute. Your account data looks incomplete.
          </div>
        )}
      </div>
    </main>
  );
}

// Rendering subcomponents — kept local so this page stays self-contained.
// If any of these gets reused on another page, extract to /components.

function HealthReadout({
  result,
  showBreakdown,
  showAdvice,
  onToggleBreakdown,
  onToggleAdvice,
}: {
  readonly result: HealthOutput;
  readonly showBreakdown: boolean;
  readonly showAdvice: boolean;
  readonly onToggleBreakdown: () => void;
  readonly onToggleAdvice: () => void;
}) {
  const tone = BAND_TONE[result.band];
  const label = BAND_LABEL[result.band];

  return (
    <>
      <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface px-6 py-10 text-center">
        <div
          className={`font-mono text-[96px] font-semibold leading-none tracking-[-0.03em] md:text-[120px] ${tone}`}
        >
          {result.score}
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.12em] text-fg-muted">
          out of 100
        </div>
        <div className={`mt-5 text-[20px] font-semibold ${tone}`}>{label}</div>
      </section>

      <section className="mt-6 space-y-2">
        <button
          type="button"
          onClick={onToggleBreakdown}
          aria-expanded={showBreakdown}
          className="flex w-full items-center justify-between rounded-klub border border-border-subtle bg-bg-surface px-4 py-3 text-[13px] text-fg-secondary transition-colors hover:bg-bg-elevated"
        >
          <span>Breakdown</span>
          <span className="text-fg-muted">{showBreakdown ? "▲" : "▼"}</span>
        </button>
        {showBreakdown && (
          <div className="space-y-3 rounded-klub border border-border-subtle bg-bg-surface/40 p-4">
            <SubscoreRow
              label="Liquidation proximity"
              sub={result.subscores.liquidationProximity}
            />
            <SubscoreRow
              label="Leverage"
              sub={result.subscores.leverageExposure}
            />
            <SubscoreRow
              label="Concentration"
              sub={result.subscores.concentrationRisk}
            />
            <SubscoreRow
              label="Funding burn"
              sub={result.subscores.fundingBurn}
            />
          </div>
        )}

        {result.recommendations.length > 0 && (
          <>
            <button
              type="button"
              onClick={onToggleAdvice}
              aria-expanded={showAdvice}
              className="flex w-full items-center justify-between rounded-klub border border-border-subtle bg-bg-surface px-4 py-3 text-[13px] text-fg-secondary transition-colors hover:bg-bg-elevated"
            >
              <span>What should I do?</span>
              <span className="text-fg-muted">{showAdvice ? "▲" : "▼"}</span>
            </button>
            {showAdvice && (
              <ul className="space-y-2 rounded-klub border border-border-subtle bg-bg-surface/40 p-4 text-[13px] leading-relaxed text-fg-secondary">
                {result.recommendations.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </>
  );
}

function EmptyState({
  title,
  body,
  ctaHref,
  ctaLabel,
  secondaryHref,
  secondaryLabel,
}: {
  readonly title: string;
  readonly body: string;
  readonly ctaHref: string;
  readonly ctaLabel: string;
  readonly secondaryHref?: string;
  readonly secondaryLabel?: string;
}) {
  return (
    <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface p-7 text-center md:p-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-elevated text-fg-muted">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8l3 3M5 19l3-3m8-8l3-3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <h2 className="mt-4 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-fg-primary md:text-[26px]">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-[36ch] text-[13px] leading-relaxed text-fg-secondary">
        {body}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href={ctaHref} className="btn-primary btn-compact">
          {ctaLabel}
        </Link>
        {secondaryHref && secondaryLabel && (
          <Link href={secondaryHref} className="btn-secondary btn-compact">
            {secondaryLabel}
          </Link>
        )}
      </div>
    </section>
  );
}

function SubscoreRow({
  label,
  sub,
}: {
  readonly label: string;
  readonly sub: SubScore;
}) {
  const tone =
    sub.score >= 75
      ? "text-pnl-long"
      : sub.score >= 50
        ? "text-fg-primary"
        : "text-pnl-short";
  const summary = formatSubscoreSummary(sub);
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-fg-muted">{label}</span>
        <span className={`font-mono ${tone}`}>{summary}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-fg-muted">{sub.label}</div>
    </div>
  );
}

function formatSubscoreSummary(sub: SubScore): string {
  const scoreLabel = `score ${sub.score}/100`;

  if (sub.rawUnit === "multiple") {
    return `${sub.rawValue.toFixed(1)}x · ${scoreLabel}`;
  }

  if (sub.rawUnit === "fraction") {
    return `${formatPercentage(sub.rawValue)} · ${scoreLabel}`;
  }

  return scoreLabel;
}

function formatPercentage(value: number): string {
  const absValue = Math.abs(value);
  const digits = absValue >= 0.1 ? 0 : absValue >= 0.01 ? 1 : 2;
  return `${(value * 100).toFixed(digits)}%`;
}

function regimeLabelForValue(
  regime: number,
): "bearish" | "neutral" | "bullish" {
  if (regime < 0) return "bearish";
  if (regime > 0) return "bullish";
  return "neutral";
}

function extractSurfaceRegime(surface: unknown): number | null {
  if (!surface || typeof surface !== "object") {
    return null;
  }

  const topLevel = (surface as { regime?: unknown }).regime;
  if (typeof topLevel === "number" && Number.isFinite(topLevel)) {
    return topLevel;
  }

  const nested = (surface as { risk?: { regime?: unknown } }).risk?.regime;
  if (typeof nested === "number" && Number.isFinite(nested)) {
    return nested;
  }

  return null;
}
