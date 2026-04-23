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
 * Columns match what early.bulk.trade shows: 1h, 8h, and annualized
 * funding. Previously we only showed 8h + annual, and both were wrong
 * by a large factor because we treated Bulk's `funding` field as a
 * fractional per-8h value when it's actually an hourly percent value.
 * See `use-funding-rates.ts` for the unit-semantics note.
 *
 * Data source: Bulk testnet frontendContext stream. Only symbols with
 * active markets on testnet render real data. We DO NOT fall back to
 * seed values — if the feed has no data, we show "—" honestly.
 */

export default function DeskPage() {
  const symbols = useMemo<readonly MarketSymbol[]>(() => MARKETS.map((m) => m.symbol), []);
  const funding = useFundingRates(symbols);
  const tickers = useTickers(symbols);
  const { isLive, isDemo, isReconnecting } = useConnectionState();

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-2xl px-6 pb-12 pt-28 md:pt-32">
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
          Per-hour funding as published by Bulk. Positive means longs pay shorts. 8h and
          annualized columns are extrapolated from the live hourly rate.
        </p>

        <div className="mt-10">
          {/* Header row — four columns: market, 1h, 8h, annual.
              `grid-cols-[1fr_auto_auto_auto]` with uniform gap lets
              the market label take remaining space while funding
              columns right-align in fixed-width columns. */}
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-border-subtle px-1 pb-2 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
            <span>Market</span>
            <span className="text-right">1h</span>
            <span className="text-right">8h</span>
            <span className="text-right">Annual</span>
          </div>

          <ul className="divide-y divide-border-subtle">
            {MARKETS.map((m) => {
              const sym = m.symbol;
              const fundingRow = funding[sym];
              const mark = tickers[sym]?.mark;
              const hasFunding =
                fundingRow !== undefined && Number.isFinite(fundingRow.hourlyPct);
              const hasMark = mark !== undefined;
              const hourly = fundingRow?.hourlyPct ?? 0;
              const eightH = fundingRow?.eightHourPct ?? 0;
              const annual = fundingRow?.annualPct ?? 0;
              const tone = hourly >= 0 ? 'text-pnl-long' : 'text-pnl-short';

              return (
                <li key={sym}>
                  <Link
                    href="/trade"
                    className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-1 py-3.5 transition-colors hover:bg-bg-surface"
                  >
                    <div className="min-w-0">
                      <div className="text-[14px] text-fg-primary">{m.label}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
                        {hasMark ? `$${formatPrice(mark)}` : '—'}
                      </div>
                    </div>
                    <div
                      className={`text-right font-mono text-[12px] ${
                        hasFunding ? tone : 'text-fg-muted'
                      }`}
                    >
                      {hasFunding ? formatPct(hourly, 5) : '—'}
                    </div>
                    <div
                      className={`text-right font-mono text-[12px] ${
                        hasFunding ? tone : 'text-fg-muted'
                      }`}
                    >
                      {hasFunding ? formatPct(eightH, 4) : '—'}
                    </div>
                    <div
                      className={`text-right font-mono text-[12px] ${
                        hasFunding ? tone : 'text-fg-muted'
                      }`}
                    >
                      {hasFunding ? formatPct(annual, 2) : '—'}
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

/**
 * Format a percent value with fixed decimals and an explicit sign.
 * Bulk's website shows 4-5 decimals for small hourly/8h values so
 * you can see subtle moves; 2 decimals is fine for annualized.
 */
function formatPct(value: number, decimals: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

function formatPrice(p: number): string {
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}