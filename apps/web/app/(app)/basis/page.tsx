'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useFundingRates } from '@/hooks/use-funding-rates';
import { useTickers } from '@/hooks/use-tickers';
import { MARKETS, type MarketSymbol } from '@/lib/markets';

/**
 * /basis — live basis-trade scanner.
 *
 * This is intentionally not a vault deposit surface yet. Until the Solana
 * contracts are wired into the repo and audited, KLUB should show the real
 * trade construction and risk math, but not accept deposits.
 */

export default function BasisPage() {
  const [amount, setAmount] = useState(1_000);
  const symbols = useMemo<readonly MarketSymbol[]>(() => MARKETS.map((m) => m.symbol), []);
  const funding = useFundingRates(symbols);
  const tickers = useTickers(symbols);
  const opportunities = useMemo(
    () => buildBasisOpportunities(symbols, funding, tickers),
    [funding, symbols, tickers],
  );
  const best = opportunities[0] ?? null;
  const projected = best ? (amount * best.netAnnualPct) / 100 : 0;

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-2xl">
        <header>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
            Basis trade
          </div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-fg-primary md:text-[42px]">
            Capture funding without picking direction.
          </h1>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-fg-muted">
            KLUB scans Bulk funding rates and builds a neutral pair: short the market
            paying the most funding, long the market charging the least. This is a
            trade planner until the Solana vault contracts are connected.
          </p>
        </header>

        <div className="mt-6 rounded-klub border border-accent/25 bg-accent/5 px-4 py-3 text-[11px] leading-relaxed text-fg-secondary">
          <span className="font-medium text-accent">Execution locked.</span>{' '}
          Live rates are real. One-click vault deposits are disabled until contract
          addresses, IDL, and signing paths are added to the app.
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
            <div className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
              Best current carry
            </div>
            {best ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <LegCard label="Long" symbol={best.longSymbol} annualPct={best.longAnnualPct} />
                  <LegCard label="Short" symbol={best.shortSymbol} annualPct={best.shortAnnualPct} />
                </div>
                <div className="mt-6 flex items-end justify-between gap-4">
                  <div>
                    <div className="font-mono text-[46px] font-semibold leading-none tracking-[-0.04em] text-pnl-long">
                      +{best.netAnnualPct.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                      net annualized carry
                    </div>
                  </div>
                  <div className="text-right text-[12px] text-fg-muted">
                    Equal notional
                    <br />
                    1× planner
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-klub border border-border-subtle bg-bg-base p-5 text-[13px] text-fg-muted">
                Waiting for Bulk funding data…
              </div>
            )}
          </div>

          <div className="rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
            <label className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
              Planner amount · USDC
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={50}
              value={amount}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next) && next >= 0) setAmount(next);
              }}
              className="mt-3 w-full rounded-klub border border-border bg-bg-base px-4 py-3.5 font-mono text-xl text-fg-primary focus:border-accent focus:outline-none"
            />

            <div className="mt-5 rounded-klub border border-border-subtle bg-bg-base p-4">
              <div className="text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                Projected carry
              </div>
              <div className="mt-2 font-mono text-[28px] font-semibold text-pnl-long">
                {best ? `+$${projected.toFixed(0)}` : '—'}
              </div>
              <div className="mt-1 text-[11px] text-fg-muted">
                before slippage, fees, liquidation risk, and funding flips
              </div>
            </div>

            <button
              type="button"
              disabled
              className="btn-primary btn-block btn-lg mt-5 cursor-not-allowed opacity-50"
            >
              Contracts not connected
            </button>
            <Link
              href="/desk"
              className="mt-3 block text-center text-[12px] text-fg-muted transition-colors hover:text-fg-primary"
            >
              Open Funding Desk
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface">
          <div className="border-b border-border-subtle px-5 py-4">
            <div className="text-[13px] font-medium text-fg-primary">
              Live opportunities
            </div>
            <div className="mt-0.5 text-[11px] text-fg-muted">
              Ranked by short funding minus long funding.
            </div>
          </div>
          <ul className="divide-y divide-border-subtle">
            {opportunities.slice(0, 6).map((opp) => (
              <li
                key={`${opp.longSymbol}-${opp.shortSymbol}`}
                className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="text-[13px] text-fg-primary">
                    Long {labelFor(opp.longSymbol)} · Short {labelFor(opp.shortSymbol)}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-fg-muted">
                    {formatPrice(tickers[opp.longSymbol]?.mark)} / {formatPrice(tickers[opp.shortSymbol]?.mark)}
                  </div>
                </div>
                <div className="text-right font-mono text-[13px] text-pnl-long">
                  +{opp.netAnnualPct.toFixed(1)}%
                </div>
              </li>
            ))}
          </ul>
        </div>

        <section className="mt-8 grid gap-3 text-[12px] leading-relaxed text-fg-muted md:grid-cols-3">
          <InfoCard title="What can go wrong">
            Funding can flip, spreads can widen, and legs can fill at different prices.
          </InfoCard>
          <InfoCard title="Why contracts matter">
            A vault needs audited Solana programs for deposits, accounting, shares, and withdrawals.
          </InfoCard>
          <InfoCard title="Current mode">
            Planner only. Use it to understand the trade; execute manually until contracts are wired.
          </InfoCard>
        </section>
      </section>
    </main>
  );
}

interface BasisOpportunity {
  readonly longSymbol: MarketSymbol;
  readonly shortSymbol: MarketSymbol;
  readonly longAnnualPct: number;
  readonly shortAnnualPct: number;
  readonly netAnnualPct: number;
}

function buildBasisOpportunities(
  symbols: readonly MarketSymbol[],
  funding: ReturnType<typeof useFundingRates>,
  tickers: ReturnType<typeof useTickers>,
): readonly BasisOpportunity[] {
  const rows = symbols
    .map((symbol) => ({
      symbol,
      annualPct: funding[symbol]?.annualPct,
      mark: tickers[symbol]?.mark,
    }))
    .filter((row): row is { symbol: MarketSymbol; annualPct: number; mark: number } => {
      const annualPct = row.annualPct;
      const mark = row.mark;
      return (
        typeof annualPct === 'number' &&
        Number.isFinite(annualPct) &&
        typeof mark === 'number' &&
        Number.isFinite(mark) &&
        mark > 0
      );
    });

  const out: BasisOpportunity[] = [];
  for (const long of rows) {
    for (const short of rows) {
      if (long.symbol === short.symbol) continue;
      const netAnnualPct = short.annualPct - long.annualPct;
      if (netAnnualPct <= 0) continue;
      out.push({
        longSymbol: long.symbol,
        shortSymbol: short.symbol,
        longAnnualPct: long.annualPct,
        shortAnnualPct: short.annualPct,
        netAnnualPct,
      });
    }
  }
  return out.sort((a, b) => b.netAnnualPct - a.netAnnualPct);
}

function LegCard({
  label,
  symbol,
  annualPct,
}: {
  readonly label: 'Long' | 'Short';
  readonly symbol: MarketSymbol;
  readonly annualPct: number;
}) {
  return (
    <div className="rounded-klub border border-border-subtle bg-bg-base p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-fg-muted">{label}</div>
      <div className="mt-1 text-[18px] font-semibold text-fg-primary">{labelFor(symbol)}</div>
      <div className="mt-2 font-mono text-[12px] text-fg-muted">
        funding {annualPct >= 0 ? '+' : ''}
        {annualPct.toFixed(1)}% annual
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <div className="rounded-klub border border-border-subtle bg-bg-surface/50 p-4">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.1em] text-fg-secondary">
        {title}
      </div>
      {children}
    </div>
  );
}

function labelFor(symbol: string): string {
  return MARKETS.find((market) => market.symbol === symbol)?.label ?? symbol.replace('-USD', '');
}

function formatPrice(value: number | undefined): string {
  if (!Number.isFinite(value)) return '—';
  const price = value as number;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 100) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
