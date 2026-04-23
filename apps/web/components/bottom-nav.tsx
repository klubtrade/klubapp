'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { useConnectionState } from '@/hooks/use-connection-state';
import { useTickers } from '@/hooks/use-tickers';
import { useWalletGate } from '@/hooks/use-wallet-gate';
import { useUserPrefs } from '@/lib/user-prefs';

/**
 * /home — minimal dashboard.
 *
 * Rule: nothing competes for attention on first view.
 *
 * Visible by default:
 *   - "What do you want to do?" title
 *   - If not connected: single "Connect wallet" primary CTA
 *   - If connected: two compact CTAs ("Open a trade", "Follow a trader")
 *
 * Behind a tap:
 *   - "Show details" reveals: equity, PnL, positions, health, markets
 *
 * First-time visitors (no onboarding yet) still route to /onboarding.
 */

const DEMO_EQUITY = 5_000;
const DEMO_PNL_24H = 124.32;
const DEMO_POSITIONS = 1;
const DEMO_HEALTH_SCORE = 87;

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
    <HomeHero
      showDetails={showDetails}
      onToggleDetails={() => {
        setShowDetails((v) => !v);
      }}
    />
  );
}

function HomeHero({
  showDetails,
  onToggleDetails,
}: {
  readonly showDetails: boolean;
  readonly onToggleDetails: () => void;
}) {
  const { connected, mounted, promptConnect } = useWalletGate();

  return (
    <main className="min-h-screen">
      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 pb-12 pt-28 md:pt-36">
        <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] md:text-[40px]">
          What do you want to do?
        </h1>

        {!mounted ? (
          <div className="mt-10 h-[44px]" aria-hidden />
        ) : !connected ? (
          <div className="mt-10 space-y-3">
            <button
              type="button"
              onClick={promptConnect}
              className="btn-primary btn-compact btn-lg"
            >
              Connect wallet
            </button>
            <p className="text-[12px] text-fg-muted">
              Connect a Solana wallet to open trades, follow leaders, and deposit.
            </p>
          </div>
        ) : (
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/quick-trade" className="btn-primary btn-compact btn-lg">
              Open a trade
            </Link>
            <Link href="/follow" className="btn-secondary btn-compact btn-lg">
              Follow a trader
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={onToggleDetails}
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
  const symbols = useMemo(() => [...TICKER_SYMBOLS], []);
  const prices = useTickers(symbols);
  const { isLive, isDemo } = useConnectionState();

  return (
    <div className="mt-6 space-y-8 border-t border-border-subtle pt-8">
      <div>
        <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          Account
        </div>
        <dl className="grid grid-cols-2 gap-y-4 gap-x-6">
          <Stat label="Equity" value={`$${DEMO_EQUITY.toLocaleString()}`} />
          <Stat
            label="PnL · 24h"
            value={`${DEMO_PNL_24H >= 0 ? '+' : ''}$${Math.abs(DEMO_PNL_24H).toFixed(2)}`}
            tone={DEMO_PNL_24H >= 0 ? 'long' : 'short'}
          />
          <Stat label="Positions" value={String(DEMO_POSITIONS)} />
          <Stat
            label="Health"
            value={String(DEMO_HEALTH_SCORE)}
            tone={DEMO_HEALTH_SCORE >= 75 ? 'long' : DEMO_HEALTH_SCORE >= 50 ? 'neutral' : 'short'}
          />
        </dl>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
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
          {TICKER_SYMBOLS.map((sym) => {
            const mark = prices[sym]?.mark;
            return (
              <div
                key={sym}
                className="flex items-baseline justify-between font-mono text-[13px]"
              >
                <span className="text-fg-secondary">{sym.replace('-USD', '')}</span>
                <span className="text-fg-primary">
                  {mark !== undefined ? `$${formatPrice(mark)}` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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