'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { useConnectionState } from '@/hooks/use-connection-state';
import { useFundingRates } from '@/hooks/use-funding-rates';
import { useTickers } from '@/hooks/use-tickers';
import { MARKETS, type MarketSymbol } from '@/lib/markets';

/**
 * /desk — minimalist funding monitor.
 *
 * Visible by default:
 *   - Simple list: symbol, funding %, annualized, mark
 *
 * Data source: Bulk testnet frontendContext stream. Only symbols with
 * active markets on testnet render real data. We DO NOT fall back to
 * seed values — if the feed has no data, we show "—" honestly.
 *
 * Market list pulled from `@/lib/markets` so this screen automatically
 * picks up new listings without an edit here. Previously hardcoded
 * three markets which was inconsistent with /trade and /quick-trade.
 */

export default function DeskPage() {
  // Copy into a mutable array — `useTickers` takes `readonly string[]`
  // but the shared const is typed narrower.
  const symbols = useMemo<readonly MarketSymbol[]>(() => MARKETS.map((m) => m.symbol), []);
  const funding = useFundingRates(symbols);
  const tickers = useTickers(symbols);
  const { isLive, isDemo, isReconnecting } = useConnectionState();

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-xl px-6 pb-12 pt-28 md:pt-32">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Funding · live
          </div>
          {isReconnecting ? (
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-alert-orange">
              <span className="h-1 w-1 animate-pulse rounded-full bg-alert-orange" />
              Reconnecting
            </span>
          ) : isLive ? (
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-pnl-long">
              <span className="h-1 w-1 animate-pulse-accent rounded-full bg-pnl-long" />
              Live
            </span>
          ) : isDemo ? (
            <span
              className="text-[10px] uppercase tracking-[0.08em] text-fg-muted"
              title="No WS URL configured"
            >
              Demo
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[32px]">
          Funding rates
        </h1>
        <p className="mt-2 text-[13px] text-fg-muted">
          Per-8h funding. Positive means longs pay shorts.
        </p>

        <div className="mt-10">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border-subtle px-1 pb-2 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
            <span>Market</span>
            <span className="text-right">Funding · 8h</span>
            <span className="text-right">Annual</span>
          </div>

          {/* Rows */}
          <ul className="divide-y divide-border-subtle">
            {MARKETS.map((m) => {
              const sym = m.symbol;
              const rate = funding[sym]?.rate;
              const mark = tickers[sym]?.mark;
              const hasFunding = rate !== undefined && Number.isFinite(rate);
              const hasMark = mark !== undefined;
              const pct = (rate ?? 0) * 100;
              const annualized = pct * 3 * 365;
              const tone = pct >= 0 ? 'text-pnl-long' : 'text-pnl-short';

              return (
                <li key={sym}>
                  <Link
                    href="/trade"
                    className="grid grid-cols-[1fr_auto_auto] gap-4 px-1 py-3.5 transition-colors hover:bg-bg-surface"
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] text-fg-primary">{m.label}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
                        {hasMark ? `$${formatPrice(mark)}` : '—'}
                      </div>
                    </div>
                    <div className={`text-right font-mono text-[13px] ${hasFunding ? tone : 'text-fg-muted'}`}>
                      {hasFunding ? `${pct >= 0 ? '+' : ''}${pct.toFixed(4)}%` : '—'}
                    </div>
                    <div className={`text-right font-mono text-[13px] ${hasFunding ? tone : 'text-fg-muted'}`}>
                      {hasFunding ? `${annualized >= 0 ? '+' : ''}${annualized.toFixed(1)}%` : '—'}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}

function formatPrice(p: number): string {
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}