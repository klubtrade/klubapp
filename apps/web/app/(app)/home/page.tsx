'use client';

import { healthScore } from '@klub/calc';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { useBulkAccount, type BulkAccountSnapshot } from '@/hooks/use-bulk-account';
import { useConnectionState } from '@/hooks/use-connection-state';
import { useRiskSurfacesRest } from '@/hooks/use-risk-surfaces-rest';
import { useTickers } from '@/hooks/use-tickers';
import { buildHealthInput, type LivePriceMap, type RiskSurfaceMap } from '@/lib/health-input';
import { MARKETS, SEED_PRICES, type MarketSymbol } from '@/lib/markets';
import { useUserPrefs } from '@/lib/user-prefs';

/**
 * /home — minimal dashboard.
 *
 * Rule: nothing competes for attention on first view.
 *
 * Visible by default:
 *   - Greeting ("What do you want to do?")
 *   - A single primary action ("Open a trade")
 *   - One secondary link ("Follow someone")
 *
 * Behind "Show details":
 *   - Equity, PnL, positions, health score, market tickers
 *
 * The health score shown here is computed by the same
 * `buildHealthInput` + `healthScore()` pipeline as /health, so the
 * two pages never disagree on the number.
 */

// The markets tile shows a curated subset (BTC/ETH/SOL) rather than
// all 10 — dashboards should be scannable, not exhaustive. /desk
// covers full-market coverage.
const TICKER_SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD'] as const;

export default function HomePage() {
  const { prefs, ready } = useUserPrefs();
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (ready && !prefs.onboardingComplete) {
      router.replace('/onboarding');
    }
  }, [ready, prefs.onboardingComplete, router]);

  if (!ready) {
    return (
      <main className="min-h-screen px-6 pt-28">
        <div className="mx-auto max-w-md text-fg-muted">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 pb-12 pt-28 md:pt-36">
        <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] md:text-[40px]">
          What do you want to do?
        </h1>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/quick-trade" className="btn-primary btn-compact btn-lg">
            Open a trade
          </Link>
          <Link href="/follow" className="btn-secondary btn-compact btn-lg">
            Follow a trader
          </Link>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowDetails((v) => !v);
          }}
          aria-expanded={showDetails}
          className="mt-10 self-start text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
        >
          {showDetails ? 'Hide details' : 'Show details'}
        </button>

        {showDetails && <DetailsPanel />}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------

function DetailsPanel() {
  const wallet = useWallet();
  const pubkey = wallet.publicKey ? wallet.publicKey.toBase58() : null;
  const { state: accountState } = useBulkAccount(pubkey);

  // Subscribe to ALL market symbols (not just the 3 tickers shown)
  // so the health score has live prices for every possible position.
  // Internally this is one frontendContext subscription thanks to
  // the Week-1 fan-out fix — cheap to ask for all 10.
  const allSymbols = useMemo<readonly MarketSymbol[]>(
    () => MARKETS.map((m) => m.symbol),
    [],
  );
  const prices = useTickers(allSymbols);
  const { isLive, isDemo } = useConnectionState();

  // REST snapshot of per-market risk-surface grids. Same hook
  // /health uses; shared cache via the 30s refresh. Day 3 threads
  // the full grid (not just a scalar mmFraction) so buildHealthInput
  // can look up position-specific mm per notional + leverage.
  const { params: restRiskParams } = useRiskSurfacesRest();

  return (
    <div className="mt-6 space-y-8 border-t border-border-subtle pt-8">
      <AccountStats
        snapshot={accountState.data}
        connected={wallet.connected}
        livePrices={prices}
        mmSurfaces={restRiskParams}
      />

      <div>
        {/* Markets header — flex-between so "Live" sits flush with
            the right edge of the container, matching the Total PnL
            / Health alignment below. */}
        <div className="mb-4 flex items-center justify-between gap-x-6">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Markets
          </div>
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
        <div className="space-y-2">
          {TICKER_SYMBOLS.map((sym) => (
            <div
              key={sym}
              className="flex items-baseline justify-between font-mono text-[13px]"
            >
              <span className="text-fg-secondary">{sym.replace('-USD', '')}</span>
              <span className="text-fg-primary">
                ${formatPrice(prices[sym]?.mark ?? SEED_PRICES[sym as MarketSymbol] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Account summary card. Four tiles in a 2-col grid:
 *   col 1: Equity        col 2: Total PnL   (right-aligned)
 *   col 1: Positions     col 2: Health      (right-aligned)
 *
 * Health = `healthScore(buildHealthInput(...)).score`, so /home
 * and /health always agree. Falls back to "—" when no positions
 * (health is meaningless without positions — /health shows an
 * empty state in that case; /home just dashes the tile).
 */
function AccountStats({
  snapshot,
  connected,
  livePrices,
  mmSurfaces,
}: {
  readonly snapshot: BulkAccountSnapshot | null;
  readonly connected: boolean;
  readonly livePrices: LivePriceMap;
  readonly mmSurfaces: RiskSurfaceMap;
}) {
  let equityLabel = '—';
  let pnlLabel = '—';
  let pnlTone: 'long' | 'short' | 'neutral' = 'neutral';
  let positionsLabel = '—';
  let healthLabel = '—';
  let healthTone: 'long' | 'short' | 'neutral' = 'neutral';

  if (snapshot) {
    if (snapshot.equityUsd !== null) {
      equityLabel = `$${formatUsd(snapshot.equityUsd)}`;
    }

    // Total PnL = realized + unrealized. True 24h PnL would need
    // server-side equity snapshots on a cadence we don't maintain
    // yet; labeling this "Total PnL" is the honest call.
    const realized = readPnlComponent(snapshot.raw, ['realizedPnl']);
    const unrealized = snapshot.unrealizedPnlUsd;
    const combined =
      realized !== null || unrealized !== null
        ? (realized ?? 0) + (unrealized ?? 0)
        : null;
    if (combined !== null) {
      pnlLabel = `${combined >= 0 ? '+' : '−'}$${formatUsd(Math.abs(combined))}`;
      pnlTone = combined >= 0 ? 'long' : 'short';
    }

    positionsLabel = String(snapshot.positions.length);

    // Health: route through the shared adapter so /home and /health
    // show the same number. buildHealthInput returns null when
    // there's no usable portfolio (no equity OR no positions);
    // we leave the tile as "—" in that case.
    const input = buildHealthInput(snapshot, livePrices, mmSurfaces);
    if (input) {
      try {
        const result = healthScore(input);
        healthLabel = String(result.score);
        healthTone =
          result.score >= 75 ? 'long' : result.score >= 50 ? 'neutral' : 'short';
      } catch {
        // healthScore threw (malformed input); leave "—"
      }
    }
  }

  return (
    <div>
      {/* Header flex-between — "Connect wallet to see" (when shown)
          sits flush with the right edge, aligned with the Total PnL /
          Health values below. */}
      <div className="mb-4 flex items-center justify-between gap-x-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          Account
        </div>
        {!connected && (
          <span className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
            Connect wallet to see
          </span>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-y-4 gap-x-6">
        <Stat label="Equity" value={equityLabel} />
        <Stat label="Total PnL" value={pnlLabel} tone={pnlTone} align="right" />
        <Stat label="Positions" value={positionsLabel} />
        <Stat label="Health" value={healthLabel} tone={healthTone} align="right" />
      </dl>
    </div>
  );
}

/**
 * Pull a numeric field out of the raw /account response, navigating
 * into `fullAccount.margin.*`. Used for `realizedPnl` which isn't
 * surfaced on the top-level snapshot type.
 */
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

function Stat({
  label,
  value,
  tone,
  align,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'long' | 'short' | 'neutral';
  readonly align?: 'left' | 'right';
}) {
  const color =
    tone === 'long' ? 'text-pnl-long' : tone === 'short' ? 'text-pnl-short' : 'text-fg-primary';
  const alignClass = align === 'right' ? 'text-right' : '';
  return (
    <div className={alignClass}>
      <dt className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">{label}</dt>
      <dd className={`mt-1 font-mono text-[18px] ${color}`}>{value}</dd>
    </div>
  );
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
