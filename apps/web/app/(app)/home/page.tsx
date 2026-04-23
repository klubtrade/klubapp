'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { useBulkAccount, type BulkAccountSnapshot } from '@/hooks/use-bulk-account';
import { useConnectionState } from '@/hooks/use-connection-state';
import { useTickers } from '@/hooks/use-tickers';
import { useUserPrefs } from '@/lib/user-prefs';
import { SEED_PRICES, type MarketSymbol } from '@/lib/markets';

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
 * Behind a tap:
 *   - "Show details" reveals: equity, PnL, positions, health, markets —
 *     all real data pulled from the user's Bulk account when connected,
 *     sensible fallbacks (dashes) when disconnected.
 *
 * First-time visitors (no onboarding yet) still route to /onboarding.
 */

// Home shows a curated subset of markets (the three most recognizable
// to retail: BTC, ETH, SOL) rather than the full 10. Seed prices come
// from the shared markets module so numbers stay in sync with /trade
// and /quick-trade.
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
      {/* Hero — single question + two compact CTAs */}
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

  const symbols = useMemo(() => [...TICKER_SYMBOLS], []);
  const prices = useTickers(symbols);
  const { isLive, isDemo } = useConnectionState();

  return (
    <div className="mt-6 space-y-8 border-t border-border-subtle pt-8">
      <AccountStats snapshot={accountState.data} connected={wallet.connected} />

      <div>
        {/* Markets header laid out in the SAME 2-col grid as the stats
            above (grid-cols-2 gap-x-6). This aligns "Markets" with
            Equity/Positions (col 1) and "Live" with PnL/Health (col 2),
            so the right-hand badges form a clean vertical line. */}
        <div className="mb-4 grid grid-cols-2 items-center gap-x-6">
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
 * Account summary card. Four tiles:
 *   - Equity: totalBalance from margin
 *   - PnL: realized + unrealized combined (accurate; "24h" would
 *     require a time-series we don't maintain yet)
 *   - Positions: count of open positions
 *   - Health: derived from marginUsed / totalBalance; 100 = unleveraged,
 *     0 = fully committed
 *
 * When disconnected or snapshot unavailable, tiles show "—" rather
 * than mock values. The previous version of this page used DEMO_*
 * constants that felt dishonest once users connect.
 */
function AccountStats({
  snapshot,
  connected,
}: {
  readonly snapshot: BulkAccountSnapshot | null;
  readonly connected: boolean;
}) {
  // All tiles default to "—" (em dash). Populated when we have data.
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

    // PnL = realized + unrealized if both available; else whichever
    // is present. This is TOTAL PnL across all positions, not 24h —
    // tracking a true 24h window requires server-side snapshots on
    // a cadence we don't maintain yet. Labeling it as "Total PnL"
    // rather than "24h PnL" is the honest call.
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

    // Health: proxy for how maxed out your leverage is. 100 = no
    // collateral in use, 0 = fully committed. Requires totalBalance
    // AND marginUsed to be non-null; otherwise show "—" rather than
    // a misleading 100.
    const total = snapshot.equityUsd;
    const marginUsed = readPnlComponent(snapshot.raw, ['marginUsed']);
    if (total !== null && total > 0 && marginUsed !== null) {
      const utilization = Math.max(0, Math.min(1, marginUsed / total));
      const score = Math.round((1 - utilization) * 100);
      healthLabel = String(score);
      healthTone = score >= 75 ? 'long' : score >= 50 ? 'neutral' : 'short';
    }
  }

  return (
    <div>
      {/* Header laid out in the SAME 2-col grid as the stats below so
          "Account" aligns with col 1 (Equity) and the status badge
          aligns with col 2 (PnL). Matches the Markets section above
          for a consistent vertical rhythm across the whole panel. */}
      <div className="mb-4 grid grid-cols-2 items-center gap-x-6">
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
        <Stat label="Total PnL" value={pnlLabel} tone={pnlTone} />
        <Stat label="Positions" value={positionsLabel} />
        <Stat label="Health" value={healthLabel} tone={healthTone} />
      </dl>
    </div>
  );
}

/**
 * Pull a numeric field out of the raw /account response, navigating
 * into `fullAccount.margin.*`. Used for fields not surfaced in the
 * top-level snapshot type — specifically `realizedPnl` and
 * `marginUsed` which aren't on BulkAccountSnapshot yet.
 *
 * (Could extend the hook's normalize to surface these, but the home
 * page is the only consumer — keeping the narrow reach here avoids
 * widening the snapshot API for one page.)
 */
function readPnlComponent(raw: unknown, path: readonly string[]): number | null {
  if (!raw || typeof raw !== 'object') return null;
  // Unwrap the same way useBulkAccount does: array → first element →
  // fullAccount → margin.
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
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'long' | 'short' | 'neutral';
}) {
  const color =
    tone === 'long' ? 'text-pnl-long' : tone === 'short' ? 'text-pnl-short' : 'text-fg-primary';
  return (
    <div>
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