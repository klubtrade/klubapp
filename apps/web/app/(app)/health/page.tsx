'use client';

import { healthScore, type HealthInput, type HealthOutput } from '@klub/calc';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { useBulkAccount } from '@/hooks/use-bulk-account';
import { useRiskSurfacesRest } from '@/hooks/use-risk-surfaces-rest';
import { useTickers } from '@/hooks/use-tickers';
import { buildHealthInput } from '@/lib/health-input';
import { marketData } from '@/lib/market-data/client';
import { MARKETS, type MarketSymbol } from '@/lib/markets';

/**
 * /health — minimalist portfolio health.
 *
 * Big 0-100 score + one-line band. Subscore breakdown behind
 * "Show breakdown". Recommendations behind "What should I do".
 *
 * WEEK 2 DAY 1 REWORK:
 *   Previously ran entirely on `DEMO_INPUT` — a hardcoded 1-position
 *   BTC portfolio that had no relationship to the user's actual
 *   account. Now reads from `useBulkAccount` and computes health
 *   against real positions.
 *
 *   Three states:
 *     1. Not connected        → "Connect wallet to see your health"
 *     2. Connected, no positions → "Open a position to see your health"
 *     3. Connected with positions → real score + breakdown + advice
 *
 *   The stress-test slider is NOT in this Day-1 rework. Reason: it
 *   needs `@klub/calc` to accept a shocked-equity and produce a
 *   shocked-score, which isn't in the current API. That's Day 3
 *   work (alongside the bulk-margin formula refactor).
 *
 *   Health math now runs through the shared adapter backed by
 *   `/api/bulk/account` + `/api/risk-surfaces`, which feeds the
 *   Bulk margin calculator with real risk-surface lambdas.
 */

const BAND_TONE: Record<HealthOutput['band'], string> = {
  healthy: 'text-pnl-long',
  fine: 'text-pnl-long',
  caution: 'text-accent',
  risky: 'text-alert-orange',
  critical: 'text-pnl-short',
};

const BAND_LABEL: Record<HealthOutput['band'], string> = {
  healthy: 'Healthy',
  fine: 'Fine',
  caution: 'Watch it',
  risky: 'Risky',
  critical: 'Critical',
};

export default function HealthPage() {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showAdvice, setShowAdvice] = useState(false);
  const [riskTick, setRiskTick] = useState(0);
  const subscribedRef = useRef<Set<string>>(new Set());
  const unsubscribeRef = useRef(new Map<string, () => void>());

  const wallet = useWallet();
  const pubkey = wallet.publicKey ? wallet.publicKey.toBase58() : null;
  const { state: accountState, refresh: refreshAccount } = useBulkAccount(pubkey);

  // Auto-refresh the account snapshot every 10 seconds so health
  // reflects newly opened/closed positions without a manual reload.
  // `useBulkAccount` doesn't poll aggressively on its own — callers
  // like /quick-trade invoke `refresh()` after explicit actions, but
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
  const positions = snapshot?.positions ?? [];
  const connected = wallet.connected;

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
  }, [symbols.join(',')]);

  useEffect(() => {
    return () => {
      for (const unsubscribe of unsubscribeRef.current.values()) {
        unsubscribe();
      }
      unsubscribeRef.current.clear();
      subscribedRef.current.clear();
    };
  }, []);

  const regimeLabel = useMemo(() => {
    const regimes = symbols
      .map((symbol) => extractSurfaceRegime(marketData.getLiveRiskSurface(symbol)))
      .filter((regime): regime is number => typeof regime === 'number');

    if (regimes.length === 0) {
      return 'unavailable';
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
      return 'unavailable';
    }

    return regimeLabelForValue(selectedRegime);
  }, [symbols.join(','), riskTick]);

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
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 pb-12 pt-28 md:pt-36">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
              Portfolio health
            </div>
            <div className="rounded-full border border-border-subtle px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
              Current regime: {regimeLabel}
            </div>
          </div>
          {connected && (
            <div className="flex items-center gap-3 text-[11px] text-fg-muted">
              <span>
                {positions.length} {positions.length === 1 ? 'position' : 'positions'}
              </span>
              <button
                type="button"
                onClick={() => {
                  refreshAccount();
                }}
                className="text-fg-muted underline-offset-2 transition-colors hover:text-fg-primary hover:underline"
                aria-label="Refresh account"
              >
                Refresh
              </button>
            </div>
          )}
        </div>

        {!connected ? (
          <EmptyState
            title="Connect your wallet"
            body="Your health score appears once you connect a wallet and open a position."
            ctaHref="/home"
            ctaLabel="Go to home"
          />
        ) : accountState.status === 'loading' && !snapshot ? (
          <div className="mt-12 text-[14px] text-fg-muted">Loading your account…</div>
        ) : accountState.status === 'error' ? (
          <div className="mt-12 rounded-klub border border-pnl-short/30 bg-pnl-short/5 p-4 text-[13px] text-pnl-short">
            Couldn&rsquo;t load your account. {accountState.error ?? 'Try again in a moment.'}
          </div>
        ) : positions.length === 0 ? (
          <EmptyState
            title="No positions yet"
            body="Your health score tracks liquidation risk, leverage, concentration, and funding burn across your open positions. Open a trade to get started — or run a hypothetical through the calculator first."
            ctaHref="/quick-trade"
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
          <div className="mt-12 text-[14px] text-fg-muted">
            Unable to compute. Your account data looks incomplete.
          </div>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Rendering subcomponents — kept local so this page stays self-contained.
// If any of these gets reused on another page, extract to /components.
// ---------------------------------------------------------------------------

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
      <div className="mt-8 flex items-baseline gap-4">
        <div className={`font-mono text-[88px] leading-none tracking-[-0.02em] ${tone}`}>
          {result.score}
        </div>
        <div className="text-[14px] text-fg-muted">/ 100</div>
      </div>

      <div className={`mt-3 text-[18px] font-semibold ${tone}`}>{label}</div>

      <div className="mt-10 space-y-3">
        <button
          type="button"
          onClick={onToggleBreakdown}
          aria-expanded={showBreakdown}
          className="block text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
        >
          {showBreakdown ? 'Hide breakdown' : 'Show breakdown'}
        </button>
        {result.recommendations.length > 0 && (
          <button
            type="button"
            onClick={onToggleAdvice}
            aria-expanded={showAdvice}
            className="block text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
          >
            {showAdvice ? 'Hide advice' : 'What should I do?'}
          </button>
        )}
      </div>

      {showBreakdown && (
        <div className="mt-4 space-y-3 border-t border-border-subtle pt-5">
          <SubscoreRow label="Liquidation proximity" sub={result.subscores.liquidationProximity} />
          <SubscoreRow label="Leverage" sub={result.subscores.leverageExposure} />
          <SubscoreRow label="Concentration" sub={result.subscores.concentrationRisk} />
          <SubscoreRow label="Funding burn" sub={result.subscores.fundingBurn} />
        </div>
      )}

      {showAdvice && result.recommendations.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-border-subtle pt-5 text-[13px] leading-relaxed text-fg-secondary">
          {result.recommendations.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}
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
    <div className="mt-10">
      <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[32px]">
        {title}
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-fg-secondary">{body}</p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href={ctaHref} className="btn-primary btn-compact">
          {ctaLabel}
        </Link>
        {secondaryHref && secondaryLabel && (
          <Link href={secondaryHref} className="btn-secondary btn-compact">
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

function SubscoreRow({
  label,
  sub,
}: {
  readonly label: string;
  readonly sub: { readonly score: number; readonly label: string };
}) {
  const tone =
    sub.score >= 75 ? 'text-pnl-long' : sub.score >= 50 ? 'text-fg-primary' : 'text-pnl-short';
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-fg-muted">{label}</span>
        <span className={`font-mono ${tone}`}>{sub.score}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-fg-muted">{sub.label}</div>
    </div>
  );
}

function regimeLabelForValue(regime: number): 'bearish' | 'neutral' | 'bullish' {
  if (regime < 0) return 'bearish';
  if (regime > 0) return 'bullish';
  return 'neutral';
}

function extractSurfaceRegime(surface: unknown): number | null {
  if (!surface || typeof surface !== 'object') {
    return null;
  }

  const topLevel = (surface as { regime?: unknown }).regime;
  if (typeof topLevel === 'number' && Number.isFinite(topLevel)) {
    return topLevel;
  }

  const nested = (surface as { risk?: { regime?: unknown } }).risk?.regime;
  if (typeof nested === 'number' && Number.isFinite(nested)) {
    return nested;
  }

  return null;
}
