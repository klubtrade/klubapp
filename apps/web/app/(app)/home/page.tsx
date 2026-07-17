'use client';

import { healthScore, type HealthOutput } from '@klub/calc';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { useBulkAccount, type BulkAccountSnapshot } from '@/hooks/use-bulk-account';
import { useConnectionState } from '@/hooks/use-connection-state';
import { useRiskSurfacesRest } from '@/hooks/use-risk-surfaces-rest';
import { useTickers } from '@/hooks/use-tickers';
import { useWalletGate } from '@/hooks/use-wallet-gate';
import { buildHealthInput } from '@/lib/health-input';
import { MARKETS, SEED_PRICES, type MarketSymbol } from '@/lib/markets';
import { buildPortfolioRiskView } from '@/lib/portfolio-risk';
import { useUserPrefs } from '@/lib/user-prefs';

/**
 * /portfolio — balance, positions, and liquidation risk in one place.
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

const TICKER_SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD'] as const;

export default function HomePage() {
  const { prefs, ready } = useUserPrefs();
  const router = useRouter();
  const { connected } = useWalletGate();

  useEffect(() => {
    if (ready && !prefs.onboardingComplete) {
      router.replace('/onboarding');
    }
  }, [ready, prefs.onboardingComplete, router]);

  if (!ready) {
    return (
      <main className="min-h-screen bg-bg-base px-4 pt-20 md:px-8 md:pt-24">
        <div className="mx-auto max-w-md text-fg-muted">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-md">
        {connected ? <ConnectedHome /> : <DisconnectedHome />}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Connected: Revolut-style dashboard
// ---------------------------------------------------------------------------

function ConnectedHome() {
  const wallet = useWallet();
  const pubkey = wallet.publicKey ? wallet.publicKey.toBase58() : null;
  const { state: accountState } = useBulkAccount(pubkey);
  const snapshot = accountState.data;

  const allSymbols = useMemo<readonly MarketSymbol[]>(
    () => MARKETS.map((m) => m.symbol),
    [],
  );
  const livePrices = useTickers(allSymbols);
  const { params: mmSurfaces } = useRiskSurfacesRest();

  const equity = snapshot?.equityUsd ?? null;
  const totalPnl = computeTotalPnl(snapshot);
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
      <section className="text-center">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          Portfolio balance
        </div>
        <div className="mt-2 font-mono text-[48px] font-semibold leading-none tracking-[-0.02em] text-fg-primary md:text-[60px]">
          {equity === null ? '$—' : `$${formatUsd(equity)}`}
        </div>
        <div className="mt-3 text-[12px] text-fg-muted">
          {totalPnl === null
            ? 'Loading…'
            : (
                <>
                  <span
                    className={
                      totalPnl >= 0 ? 'text-pnl-long' : 'text-pnl-short'
                    }
                  >
                    {totalPnl >= 0 ? '+' : '−'}${formatUsd(Math.abs(totalPnl))}
                  </span>
                  <span className="ml-1.5">total PnL</span>
                </>
              )}
        </div>
      </section>

      <RiskSummary
        result={portfolioHealth}
        positionCount={snapshot?.positions.length ?? null}
      />

      <section className="mt-8 grid grid-cols-3 gap-3">
        <NavCircle href="/cash" label="Cash" icon={<IconWallet />} />
        <NavCircle href="/trade" label="Trade" icon={<IconTrade />} />
        <NavCircle href="/follow" label="Copy" icon={<IconUsers />} />
      </section>

      <section className="mt-8 grid grid-cols-2 gap-3">
        <StatCard snapshot={snapshot} kind="positions" />
        <StatCard snapshot={snapshot} kind="margin" />
      </section>

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
          Trade with the klub.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-secondary">
          Members-only on-chain perps. Copy the winners, sleep through
          the liquidations.
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
            href="/follow"
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
// Action circles (Cash / Trade / Follow / Pro)
// ---------------------------------------------------------------------------

function NavCircle({
  href,
  label,
  icon,
}: {
  readonly href: string;
  readonly label: string;
  readonly icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent transition-all hover:bg-accent/25 hover:scale-[1.04] active:scale-95">
          {icon}
        </div>
        <span className="text-[11px] font-medium text-fg-secondary">{label}</span>
      </div>
    </Link>
  );
}

function IconWallet() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M16 12.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
        fill="currentColor"
      />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconTrade() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 17l5-5 4 4 9-9m0 0v6m0-6h-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 6.5a3 3 0 1 1 3 5.2M21.5 20a5 5 0 0 0-4-4.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Risk summary + account stats
// ---------------------------------------------------------------------------

function RiskSummary({
  result,
  positionCount,
}: {
  readonly result: HealthOutput | null;
  readonly positionCount: number | null;
}) {
  const view = buildPortfolioRiskView({ positionCount, result });

  if (view.state === 'loading') {
    return (
      <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface p-5 text-[13px] text-fg-muted">
        Loading portfolio risk…
      </section>
    );
  }

  if (view.state === 'flat') {
    return (
      <section className="mt-8 rounded-klub-lg border border-pnl-long/25 bg-pnl-long/5 p-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-pnl-long">
          No liquidation risk
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-secondary">
          You have no open positions. Your collateral is not exposed to liquidation.
        </p>
      </section>
    );
  }

  if (view.state === 'unavailable') {
    return (
      <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface p-5 text-[13px] text-fg-muted">
        Risk data is incomplete. Open the detailed view to refresh the account and market inputs.
        <Link href="/health" className="mt-3 block text-accent">
          Open risk details →
        </Link>
      </section>
    );
  }

  const tone =
    view.level === 'critical'
      ? 'text-pnl-short'
      : view.level === 'risky'
        ? 'text-alert-orange'
        : view.level === 'watch'
          ? 'text-accent'
          : 'text-pnl-long';

  return (
    <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Portfolio health
          </div>
          <div className={`mt-2 font-mono text-[34px] font-semibold leading-none ${tone}`}>
            {view.score}
            <span className="ml-1 text-[13px] font-normal text-fg-muted">/ 100</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
            Closest liquidation
          </div>
          <div className={`mt-1 font-mono text-[16px] font-semibold ${tone}`}>
            {view.bufferPct.toFixed(1)}% away
          </div>
        </div>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-fg-secondary">
        {view.recommendation}
      </p>
      <Link href="/health" className="mt-4 inline-block text-[12px] font-medium text-accent">
        View risk breakdown →
      </Link>
    </section>
  );
}

function StatCard({
  snapshot,
  kind,
}: {
  readonly snapshot: BulkAccountSnapshot | null;
  readonly kind: 'positions' | 'margin';
}) {
  let label = '';
  let value = '—';

  if (kind === 'positions') {
    label = 'Positions';
    if (snapshot) value = String(snapshot.positions.length);
  } else if (kind === 'margin') {
    label = 'Free margin';
    if (snapshot?.freeMarginUsd !== null && snapshot?.freeMarginUsd !== undefined) {
      value = `$${formatUsd(snapshot.freeMarginUsd)}`;
    }
  }

  return (
    <div className="rounded-klub-lg border border-border-subtle bg-bg-surface px-3 py-3 text-center">
      <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-[15px] font-semibold text-fg-primary">
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markets snapshot
// ---------------------------------------------------------------------------

function MarketsBlock({ livePrices }: { readonly livePrices: Record<string, { mark: number } | undefined> }) {
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
          const mark = livePrices[sym]?.mark ?? SEED_PRICES[sym as MarketSymbol] ?? 0;
          return (
            <li
              key={sym}
              className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-border-subtle' : ''}`}
            >
              <span className="text-[13px] font-medium text-fg-primary">
                {sym.replace('-USD', '')}
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

function computeTotalPnl(snapshot: BulkAccountSnapshot | null): number | null {
  if (!snapshot) return null;
  const realized = readPnlComponent(snapshot.raw, ['realizedPnl']);
  const unrealized = snapshot.unrealizedPnlUsd;
  if (realized === null && unrealized === null) return null;
  return (realized ?? 0) + (unrealized ?? 0);
}

function readPnlComponent(raw: unknown, path: readonly string[]): number | null {
  if (!raw || typeof raw !== 'object') return null;
  let cursor: unknown = raw;
  if (Array.isArray(cursor) && cursor.length >= 1) cursor = cursor[0];
  if (cursor && typeof cursor === 'object' && 'fullAccount' in cursor) {
    cursor = (cursor as Record<string, unknown>)['fullAccount'];
  }
  if (!cursor || typeof cursor !== 'object') return null;
  const margin = (cursor as Record<string, unknown>)['margin'];
  if (!margin || typeof margin !== 'object') return null;
  for (const key of path) {
    const v = (margin as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

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
