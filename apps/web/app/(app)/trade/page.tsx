'use client';

import { calculate, type CalcOutput, type Side } from '@klub/calc';
import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import {
  useBulkAccount,
  type BulkOpenOrder,
  type BulkPosition,
} from '@/hooks/use-bulk-account';
import { useBulkCancel } from '@/hooks/use-bulk-cancel';
import { useBulkOrder } from '@/hooks/use-bulk-order';
import { useConnectionState } from '@/hooks/use-connection-state';
import { useRecentTrades } from '@/hooks/use-recent-trades';
import { useTickers } from '@/hooks/use-tickers';
import { useWalletGate } from '@/hooks/use-wallet-gate';
import type { SubmitOrderResult } from '@/lib/bulk/orders';
import { SEED_PRICES, SYMBOLS, type MarketSymbol } from '@/lib/markets';

/** Shape returned by `calculate()` from @klub/calc. Re-aliased locally
 *  so we don't leak the calc package import into children that only
 *  consume the result. */
type CalcResult = CalcOutput;

/**
 * /trade — KLUB expert trading screen.
 *
 * Layout follows Hyperliquid's three-column canvas pattern:
 *
 *   Desktop (lg+):
 *     ┌──────────────────────── Market header ─────────────────────────┐
 *     │  BTC-USD ▾   $67,420   +1.84%   funding · OI · vol · Live     │
 *     ├──────────────┬─────────────────────────────┬───────────────────┤
 *     │   Orderbook  │     Chart (TF selector)     │    Order form    │
 *     │   15 levels  │  ┌───────────────────────┐  │   Long/Short    │
 *     │   price/sz/Σ │  │                       │  │   Limit/Market  │
 *     │              │  └───────────────────────┘  │   Size · Lev    │
 *     │   Recent     ├─────────────────────────────┤   TP / SL       │
 *     │   trades     │     Positions · 1          │   Submit button │
 *     │              │                             │   The Math     │
 *     └──────────────┴─────────────────────────────┴──────────────────┘
 *
 *   Mobile: stacked as chart → orderbook → positions → order form.
 *
 * Top padding on <main> clears the fixed global chrome (hamburger
 * top-left, WalletButton+wordmark top-right).
 *
 * Bulk testnet data via `useTickers`. Mark has a seeded fallback so the
 * chart, orderbook, and math never flash zero at first paint.
 */

// Markets verified against a real Bulk testnet /account response
// (Apr 2026 post-upgrade). HYPE-USD is NOT yet available on Bulk — it
// will appear here when Bulk adds it. Leverage caps are from the
// user's `leverageSettings`; the UI slider respects those.
//
// TODO(Day 4): Fetch this list dynamically from Bulk's /exchangeInfo
// Market list + seed prices come from `@/lib/markets` — one source of
// truth shared with /quick-trade and /home. Adding a market is a
// single-file edit there rather than a three-file change.
//
// `Sym` is the literal-typed union of every supported symbol
// (re-exported from the module as `MarketSymbol`). We keep the local
// alias so the many `Sym` references in this file don't need updating.

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

type Sym = MarketSymbol;

export default function TradePage() {
  const [symbol, setSymbol] = useState<Sym>('BTC-USD');
  const [resultModal, setResultModal] = useState<SubmitOrderResult | null>(null);
  // Live math result streamed up from OrderFormPanel so the Math tab
  // in BottomTabs can render it without maintaining its own state.
  // `null` before the first calculation runs or when inputs are
  // invalid.
  const [mathResult, setMathResult] = useState<CalcResult | null>(null);

  const allSymbols = useMemo(() => [...SYMBOLS], []);
  const livePrices = useTickers(allSymbols);
  const mark = livePrices[symbol]?.mark ?? SEED_PRICES[symbol];

  // Account snapshot — positions, open orders, equity. Page-level
  // single fetch so the tables, counts, and close-position flow all
  // share the same data. `refresh()` is called after successful
  // close/cancel to force an immediate re-poll.
  const wallet = useWallet();
  const pubkey = wallet.publicKey ? wallet.publicKey.toBase58() : null;
  const { state: accountState, refresh: refreshAccount } = useBulkAccount(pubkey);
  const positions = accountState.data?.positions ?? [];
  const openOrders = accountState.data?.openOrders ?? [];

  return (
    // pt-16/md:pt-20 drops content below the fixed global chrome so the
    // market header, symbol selector, and connection pill never sit under
    // the hamburger or the wallet button.
    <main className="min-h-screen pt-16 md:pt-20">
      <MarketHeader symbol={symbol} mark={mark} onSymbolChange={setSymbol} />
      <ConnectionBanner />

      <div className="mx-auto max-w-[1600px] px-3 pb-10 pt-3 md:px-5">
        <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_340px]">
          {/* Left column: orderbook */}
          <div className="flex flex-col gap-3">
            <Orderbook mark={mark} />
          </div>

          {/* Center column: chart + tabbed bottom panel
              (Positions | Recent trades | Math) */}
          <div className="flex flex-col gap-3">
            <ChartPanel mark={mark} symbol={symbol} />
            <BottomTabs
              mark={mark}
              symbol={symbol}
              positions={positions}
              openOrders={openOrders}
              livePrices={livePrices}
              mathResult={mathResult}
              onAccountAction={refreshAccount}
              onResult={(result) => {
                setResultModal(result);
              }}
            />
          </div>

          {/* Right column: order form. Math panel moved from here
              to the bottom tabs — this column is now form-only. */}
          <OrderFormPanel
            symbol={symbol}
            mark={mark}
            onResult={(result) => {
              setResultModal(result);
            }}
            onMathResult={setMathResult}
          />
        </div>
      </div>

      {resultModal && (
        <SubmitResultModal
          result={resultModal}
          onClose={() => {
            setResultModal(null);
          }}
        />
      )}
    </main>
  );
}

// =============================================================================
// Market header
// =============================================================================

function MarketHeader({
  symbol,
  mark,
  onSymbolChange,
}: {
  readonly symbol: Sym;
  readonly mark: number;
  readonly onSymbolChange: (s: Sym) => void;
}) {
  const base = SEED_PRICES[symbol];
  const pct = ((mark - base) / base) * 100;
  const pctTone = pct >= 0 ? 'text-pnl-long' : 'text-pnl-short';

  return (
    <section className="border-b border-border-subtle bg-bg-base">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-3 py-3 md:px-5">
        {/* Symbol + price cluster */}
        <div className="flex items-center gap-4">
          <select
            value={symbol}
            onChange={(e) => {
              onSymbolChange(e.target.value as Sym);
            }}
            className="cursor-pointer rounded-klub border border-border-subtle bg-bg-surface px-3 py-1.5 text-[14px] font-medium text-fg-primary transition-colors hover:border-border focus:border-accent focus:outline-none"
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">Mark</span>
            <span className="font-mono text-[20px] font-semibold tracking-[-0.01em] text-fg-primary">
              ${formatPrice(mark)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">24h</span>
            <span className={`font-mono text-[14px] ${pctTone}`}>
              {pct >= 0 ? '+' : ''}
              {pct.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* Secondary stats cluster — pushed right */}
        <div className="ml-auto hidden items-center gap-5 text-[11px] text-fg-muted md:flex">
          <Stat label="Funding 1h" value="0.0095%" />
          <Stat label="OI" value="$412M" />
          <Stat label="Vol 24h" value="$1.84B" />
          <ConnectionPill />
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="uppercase tracking-[0.06em]">{label}</span>
      <span className="font-mono text-fg-secondary">{value}</span>
    </span>
  );
}

function ConnectionPill() {
  const { isLive, isDemo, isReconnecting } = useConnectionState();
  if (isReconnecting) {
    return (
      <span className="flex items-center gap-1.5 text-alert-orange">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-alert-orange" />
        Reconnecting
      </span>
    );
  }
  if (isLive) {
    return (
      <span className="flex items-center gap-1.5 text-pnl-long">
        <span className="h-1.5 w-1.5 animate-pulse-accent rounded-full bg-pnl-long" />
        Live
      </span>
    );
  }
  if (isDemo) {
    return (
      <span className="flex items-center gap-1.5" title="No WS URL — simulated ticks">
        <span className="h-1.5 w-1.5 rounded-full bg-fg-muted" />
        Demo
      </span>
    );
  }
  return null;
}

/**
 * Loud banner shown when the market-data WebSocket is stuck
 * reconnecting. Trader needs to know their mark price is stale
 * BEFORE they sign an order at a stale price and it gets rejected
 * for crossing. Shows after ~6 seconds to avoid flashing on brief
 * reconnect cycles.
 */
function ConnectionBanner() {
  const { isReconnecting, isLive } = useConnectionState();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!isReconnecting || isLive) {
      setStuck(false);
      return;
    }
    const t = window.setTimeout(() => {
      setStuck(true);
    }, 6000);
    return () => {
      window.clearTimeout(t);
    };
  }, [isReconnecting, isLive]);

  if (!stuck) return null;

  return (
    <div className="border-b border-alert-orange/30 bg-alert-orange/10">
      <div className="mx-auto flex max-w-[1600px] items-start gap-3 px-3 py-2.5 md:px-5">
        <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-alert-orange" />
        <div className="flex-1 text-[12px] leading-relaxed">
          <span className="font-medium text-alert-orange">
            Market data is disconnected.
          </span>{' '}
          <span className="text-fg-secondary">
            We can&rsquo;t reach Bulk&rsquo;s price feed. Prices shown are last-known
            or seeded values &mdash; do not submit orders until reconnected.
            Check{' '}
            <a
              href="https://early.bulk.trade"
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-fg-primary"
            >
              early.bulk.trade
            </a>{' '}
            to see if the exchange is up.
          </span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Panel frame (local, no drag)
// =============================================================================

function Panel({
  title,
  actions,
  children,
  className = '',
}: {
  readonly title: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={`flex flex-col overflow-hidden rounded-klub border border-border-subtle bg-bg-surface ${className}`}
    >
      <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
          {title}
        </span>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

// =============================================================================
// Orderbook
// =============================================================================

function Orderbook({ mark }: { readonly mark: number }) {
  const book = useMemo(() => generateBook(mark), [mark]);

  return (
    <Panel title="Order book">
      <div className="grid flex-shrink-0 grid-cols-3 border-b border-border-subtle px-3 py-1.5 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Sum</span>
      </div>
      {/* Asks stack — red side */}
      <div>
        {book.asks.map((row, i) => (
          <BookRow key={`a${i}`} row={row} side="ask" maxSum={book.maxSum} />
        ))}
      </div>
      {/* Mark spread */}
      <div className="border-y border-border-subtle bg-bg-elevated px-3 py-2 text-center font-mono text-[15px] font-semibold text-accent">
        ${formatPrice(mark)}
      </div>
      {/* Bids stack — green side */}
      <div>
        {book.bids.map((row, i) => (
          <BookRow key={`b${i}`} row={row} side="bid" maxSum={book.maxSum} />
        ))}
      </div>
    </Panel>
  );
}

interface BookLevel {
  readonly px: number;
  readonly sz: number;
  readonly sum: number;
}

function BookRow({
  row,
  side,
  maxSum,
}: {
  readonly row: BookLevel;
  readonly side: 'ask' | 'bid';
  readonly maxSum: number;
}) {
  // Round to 2 decimals to eliminate SSR-vs-client IEEE-754 rounding
  // noise on the last bits of the division. Without this rounding,
  // React logs a hydration mismatch warning on every orderbook row
  // ("Server: 90.682846...33417%, Client: 90.682846...40156%").
  // Two decimals is plenty of precision for a depth-shading bar.
  const widthPct = ((row.sum / maxSum) * 100).toFixed(2);
  const tone = side === 'ask' ? 'text-pnl-short' : 'text-pnl-long';
  const bgTone = side === 'ask' ? 'bg-pnl-short/10' : 'bg-pnl-long/10';
  return (
    <div className="relative grid grid-cols-3 px-3 py-[3px] font-mono text-[11px]">
      <div
        aria-hidden
        className={`absolute inset-y-0 right-0 ${bgTone}`}
        style={{ width: `${widthPct}%` }}
      />
      <span className={`relative ${tone}`}>${formatPrice(row.px)}</span>
      <span className="relative text-right text-fg-secondary">{row.sz.toFixed(3)}</span>
      <span className="relative text-right text-fg-muted">{row.sum.toFixed(2)}</span>
    </div>
  );
}

function generateBook(mark: number): {
  readonly asks: readonly BookLevel[];
  readonly bids: readonly BookLevel[];
  readonly maxSum: number;
} {
  const tick = mark * 0.0001;
  const asks: BookLevel[] = [];
  const bids: BookLevel[] = [];
  let askSum = 0;
  let bidSum = 0;
  for (let i = 0; i < 12; i++) {
    const askSize = 0.8 + pseudoRandom(i, 1) * 2.5;
    askSum += askSize;
    asks.push({ px: mark + tick * (i + 1), sz: askSize, sum: askSum });
    const bidSize = 0.8 + pseudoRandom(i, 2) * 2.5;
    bidSum += bidSize;
    bids.push({ px: mark - tick * (i + 1), sz: bidSize, sum: bidSum });
  }
  asks.reverse();
  return { asks, bids, maxSum: Math.max(askSum, bidSum) };
}

// Deterministic pseudo-random so the book doesn't re-shuffle on every
// render and cause jitter. Real orderbook will come from Bulk L2 feed.
function pseudoRandom(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// =============================================================================
// Chart panel
// =============================================================================

function ChartPanel({ mark, symbol }: { readonly mark: number; readonly symbol: Sym }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const path = useMemo(() => buildChartPath(timeframe), [timeframe]);

  return (
    <Panel
      title={
        <span>
          Chart · <span className="text-fg-secondary">{symbol}</span>
        </span>
      }
      actions={
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => {
                setTimeframe(tf);
              }}
              className={`rounded px-2 py-0.5 font-mono text-[10px] font-medium transition-colors ${
                tf === timeframe
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-muted hover:bg-bg-elevated hover:text-fg-primary'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex min-h-[280px] flex-1 flex-col p-4">
        <div className="min-h-0 flex-1">
          <svg viewBox="0 0 800 300" className="h-full w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="trade-chart-fade" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[60, 120, 180, 240].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="800"
                y2={y}
                stroke="var(--border-subtle)"
                strokeDasharray="3,5"
              />
            ))}
            <path d={`${path} L 800 300 L 0 300 Z`} fill="url(#trade-chart-fade)" />
            <path d={path} stroke="var(--accent)" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t border-border-subtle pt-2 font-mono text-[10px] text-fg-muted">
          <span>
            O: <span className="text-fg-secondary">${formatPrice(mark * 0.982)}</span> · H:{' '}
            <span className="text-fg-secondary">${formatPrice(mark * 1.014)}</span> · L:{' '}
            <span className="text-fg-secondary">${formatPrice(mark * 0.974)}</span> · C:{' '}
            <span className="text-fg-secondary">${formatPrice(mark)}</span>
          </span>
          <span className="text-[10px]">lightweight-charts in Phase 3.5</span>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Deterministic chart path keyed off timeframe. Gives visible feedback
 * that timeframe buttons work, before real candles from Bulk land.
 */
function buildChartPath(tf: Timeframe): string {
  const seed = TIMEFRAMES.indexOf(tf);
  const steps = 32;
  const amplitude = 50 + seed * 10;
  const offset = 160 - seed * 10;
  const stepX = 800 / steps;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i * stepX).toFixed(1);
    const y = (
      offset +
      Math.sin(i * 0.45 + seed) * amplitude * 0.5 +
      Math.cos(i * 0.3 + seed * 2) * amplitude * 0.35
    ).toFixed(1);
    pts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  return pts.join(' ');
}

// =============================================================================
// Bottom panel — tabs: Positions | Recent trades | Math
// =============================================================================

type BottomTabId = 'positions' | 'trades' | 'math';

function BottomTabs({
  mark,
  symbol,
  positions,
  openOrders,
  livePrices,
  mathResult,
  onAccountAction,
  onResult,
}: {
  readonly mark: number;
  readonly symbol: Sym;
  readonly positions: readonly BulkPosition[];
  readonly openOrders: readonly BulkOpenOrder[];
  readonly livePrices: Record<string, { readonly mark: number } | undefined>;
  readonly mathResult: CalcResult | null;
  readonly onAccountAction: () => void;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const [tab, setTab] = useState<BottomTabId>('positions');
  const posCount = positions.length;
  const orderCount = openOrders.length;
  // Positions tab label shows combined filled+pending count if any
  // pending orders exist, so the user sees something is happening
  // without switching tabs. Uses the "N + M pending" form rather than
  // one combined number so the state is legible.
  const positionsLabel =
    orderCount > 0
      ? `Positions · ${posCount} + ${orderCount} pending`
      : `Positions · ${posCount}`;

  return (
    <section className="flex flex-col overflow-hidden rounded-klub border border-border-subtle bg-bg-surface">
      <header className="flex flex-shrink-0 items-center gap-1 border-b border-border-subtle px-2 py-1.5">
        <TabButton label={positionsLabel} active={tab === 'positions'} onClick={() => setTab('positions')} />
        <TabButton label="Recent trades" active={tab === 'trades'} onClick={() => setTab('trades')} />
        <TabButton label="Math" active={tab === 'math'} onClick={() => setTab('math')} />
      </header>
      <div className="min-h-0 flex-1">
        {tab === 'positions' && (
          <PositionsTableInner
            positions={positions}
            openOrders={openOrders}
            livePrices={livePrices}
            onAfterAction={onAccountAction}
            onResult={onResult}
          />
        )}
        {tab === 'trades' && <RecentTradesInner symbol={symbol} />}
        {tab === 'math' && <MathTab result={mathResult} />}
      </div>
    </section>
  );
}

function TabButton({ label, active, onClick }: { readonly label: string; readonly active: boolean; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors ${
        active ? 'bg-bg-elevated text-fg-primary' : 'text-fg-muted hover:text-fg-primary'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * PositionsTableInner — renders real open positions from Bulk's
 * /account response.
 *
 * Each row surfaces:
 *   - Market, direction (Long/Short inferred from signed size)
 *   - Base size (absolute value for display)
 *   - Entry price, mark/fair price
 *   - Notional (absolute USD)
 *   - Live unrealized PnL (computed per-position)
 *   - Close button — submits an offsetting market order, then
 *     refreshes /account so the row disappears
 *
 * Close action rationale: Bulk doesn't expose a dedicated "close
 * position" endpoint. The standard way is to submit a market order
 * with `reduce_only: true` and opposite side of the same size. We
 * don't set reduceOnly yet (Week 2 when we confirm the wire field)
 * — currently we just submit the offsetting market order and rely
 * on the user not having added size since snapshot.
 */
function PositionsTableInner({
  positions,
  openOrders,
  livePrices,
  onAfterAction,
  onResult,
}: {
  readonly positions: readonly BulkPosition[];
  readonly openOrders: readonly BulkOpenOrder[];
  readonly livePrices: Record<string, { readonly mark: number } | undefined>;
  readonly onAfterAction: () => void;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  // Pending limit orders are shown in a collapsible panel below the
  // positions table. Collapsed by default so the primary view stays
  // focused on filled trades; expand to inspect/cancel resting orders.
  const [showPending, setShowPending] = useState(false);
  const hasPositions = positions.length > 0;
  const hasPending = openOrders.length > 0;

  // Empty-empty state (no positions, no pending) — show a simple
  // placeholder. Matches the retail "nothing to worry about" feel.
  if (!hasPositions && !hasPending) {
    return (
      <div className="px-3 py-6 text-center text-[12px] text-fg-muted">
        No open positions.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {hasPositions && (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-fg-muted">
              <th className="px-3 py-2 font-medium">Market</th>
              <th className="px-3 py-2 font-medium">Side</th>
              <th className="px-3 py-2 text-right font-medium">Size</th>
              <th className="px-3 py-2 text-right font-medium">Entry</th>
              <th className="px-3 py-2 text-right font-medium">Mark</th>
              <th className="px-3 py-2 text-right font-medium">Notional</th>
              <th className="px-3 py-2 text-right font-medium">PnL</th>
              <th className="px-3 py-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <PositionRow
                key={p.symbol}
                position={p}
                livePrice={livePrices[p.symbol]?.mark ?? p.fairPrice}
                onAfterAction={onAfterAction}
                onResult={onResult}
              />
            ))}
          </tbody>
        </table>
      )}

      {!hasPositions && hasPending && (
        <div className="px-3 pt-4 pb-1 text-[12px] text-fg-muted">
          No open positions — but you have pending orders below.
        </div>
      )}

      {hasPending && (
        <div className="border-t border-border-subtle">
          <button
            type="button"
            onClick={() => {
              setShowPending((v) => !v);
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] uppercase tracking-[0.06em] text-fg-muted transition-colors hover:text-fg-primary"
            aria-expanded={showPending}
          >
            <span>Pending orders · {openOrders.length}</span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 12"
              className={`transition-transform ${showPending ? 'rotate-180' : ''}`}
              aria-hidden
            >
              <path
                d="M2 4l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {showPending && (
            <PendingOrdersTable
              orders={openOrders}
              onAfterAction={onAfterAction}
              onResult={onResult}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pending limit orders table. Keeps the same visual language as the
 * positions table (same column layout), just with order-specific
 * columns and a Cancel action. Rendered inside PositionsTableInner
 * under a disclosure toggle.
 */
function PendingOrdersTable({
  orders,
  onAfterAction,
  onResult,
}: {
  readonly orders: readonly BulkOpenOrder[];
  readonly onAfterAction: () => void;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-fg-muted">
          <th className="px-3 py-2 font-medium">Market</th>
          <th className="px-3 py-2 font-medium">Side</th>
          <th className="px-3 py-2 text-right font-medium">Size</th>
          <th className="px-3 py-2 text-right font-medium">Limit px</th>
          <th className="px-3 py-2 text-right font-medium">TIF</th>
          <th className="px-3 py-2 text-right font-medium" />
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <PendingOrderRow
            key={o.orderId || `${o.symbol}-${o.price}-${o.sizeBase}`}
            order={o}
            onAfterAction={onAfterAction}
            onResult={onResult}
          />
        ))}
      </tbody>
    </table>
  );
}

function PendingOrderRow({
  order,
  onAfterAction,
  onResult,
}: {
  readonly order: BulkOpenOrder;
  readonly onAfterAction: () => void;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const { cancel, state } = useBulkCancel();
  const cancelling = state.status === 'submitting';

  async function handleCancel() {
    if (!order.orderId) {
      onResult({
        ok: false,
        reason: 'rejected_invalid',
        message: 'This order has no id — try refreshing.',
      });
      return;
    }
    const result = await cancel({
      symbol: order.symbol,
      orderId: order.orderId,
    });
    onResult(result);
    if (result.ok) {
      setTimeout(onAfterAction, 800);
    }
  }

  return (
    <tr className="border-t border-border-subtle">
      <td className="px-3 py-2.5 font-mono text-fg-primary">{order.symbol}</td>
      <td className={`px-3 py-2.5 font-mono ${order.isBuy ? 'text-pnl-long' : 'text-pnl-short'}`}>
        {order.isBuy ? 'Buy' : 'Sell'}
      </td>
      <td className="px-3 py-2.5 text-right font-mono">{formatSize(order.sizeBase)}</td>
      <td className="px-3 py-2.5 text-right font-mono">${formatPrice(order.price)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-fg-secondary">
        {order.tif ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          className="btn-ghost btn-sm text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </button>
      </td>
    </tr>
  );
}

function PositionRow({
  position,
  livePrice,
  onAfterAction,
  onResult,
}: {
  readonly position: BulkPosition;
  readonly livePrice: number;
  readonly onAfterAction: () => void;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const { submit, state } = useBulkOrder();
  const isLong = position.sizeBase > 0;
  const absSize = Math.abs(position.sizeBase);
  const pnl = position.unrealizedPnlUsd ?? (position.sizeBase * (livePrice - position.entryPrice));
  const pnlTone = pnl >= 0 ? 'text-pnl-long' : 'text-pnl-short';
  const closing = state.status === 'submitting';

  async function handleClose() {
    // To close: submit a market order on the opposite side with the
    // same absolute base size. If the user has added to the position
    // since /account was last polled (15s cycle), this will under-
    // close by the delta; for Day 4 that's acceptable. A proper fix
    // requires the Bulk `reduce_only` wire flag which we confirm
    // Week 2 and will set `r: true` on the wire action.
    const result = await submit({
      symbol: position.symbol,
      side: isLong ? 'short' : 'long',
      orderType: 'market',
      size: absSize,
    });
    onResult(result);
    if (result.ok) {
      // Give Bulk a beat to update /account then refresh so the row
      // disappears. No magic timing — /account is the source of
      // truth and 15s polling catches it anyway; this is a nicety.
      setTimeout(onAfterAction, 800);
    }
  }

  return (
    <tr className="border-t border-border-subtle">
      <td className="px-3 py-2.5 font-mono text-fg-primary">{position.symbol}</td>
      <td className={`px-3 py-2.5 font-mono ${isLong ? 'text-pnl-long' : 'text-pnl-short'}`}>
        {isLong ? 'Long' : 'Short'}
      </td>
      <td className="px-3 py-2.5 text-right font-mono">{formatSize(absSize)}</td>
      <td className="px-3 py-2.5 text-right font-mono">${formatPrice(position.entryPrice)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-fg-secondary">
        ${formatPrice(livePrice)}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-fg-secondary">
        ${Math.abs(position.notionalUsd).toFixed(0)}
      </td>
      <td className={`px-3 py-2.5 text-right font-mono ${pnlTone}`}>
        {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          type="button"
          onClick={handleClose}
          disabled={closing}
          className="btn-ghost btn-sm text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {closing ? 'Closing…' : 'Close'}
        </button>
      </td>
    </tr>
  );
}

/** Format a base-asset size with adaptive precision. */
function formatSize(size: number): string {
  if (size >= 100) return size.toFixed(2);
  if (size >= 1) return size.toFixed(4);
  return size.toFixed(6);
}

function RecentTradesInner({ symbol }: { readonly symbol: Sym }) {
  // Real trades tape from Bulk WS. `useRecentTrades` maintains a
  // rolling buffer keyed on symbol; switching symbol resets to empty
  // and the next batch repopulates.
  const prints = useRecentTrades(symbol, { limit: 30 });
  const now = Date.now();

  if (prints.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[12px] text-fg-muted">
        Waiting for trades on {symbol}…
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid flex-shrink-0 grid-cols-4 border-b border-border-subtle px-3 py-1.5 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
        <span>Side</span>
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      <div>
        {prints.map((p, i) => (
          <div
            // Trades don't have a server-assigned id we can rely on,
            // so key by (time, index) — stable across renders of the
            // same buffer. Duplicates at the exact same millisecond
            // are rare and benign.
            key={`${p.time}-${i}`}
            className="grid grid-cols-4 px-3 py-[5px] font-mono text-[11px]"
          >
            <span className={p.side === 'buy' ? 'text-pnl-long' : 'text-pnl-short'}>
              {p.isLiquidation ? 'LIQ' : p.side === 'buy' ? 'Buy' : 'Sell'}
            </span>
            <span className={p.side === 'buy' ? 'text-pnl-long' : 'text-pnl-short'}>
              ${formatPrice(p.px)}
            </span>
            <span className="text-right text-fg-secondary">{p.sz.toFixed(4)}</span>
            <span className="text-right text-fg-muted">{formatAgo(now - p.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Render a millisecond age as a compact relative-time string.
 * Shows "now" under 2s, "Ns" under 60s, "Nm" under an hour, "Nh"
 * beyond. Keeps the tape readable without per-row timers re-rendering.
 * (Accuracy is bounded by how often React re-renders this row; the
 * buffer updates on every new trade so activity keeps it current.)
 */
function formatAgo(ms: number): string {
  if (ms < 2_000) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

// =============================================================================
// Math tab (moved from OrderFormPanel side slot to the bottom tabs)
// =============================================================================

function MathTab({ result }: { readonly result: CalcResult | null }) {
  if (!result) {
    return (
      <div className="px-3 py-6 text-center text-[12px] text-fg-muted">
        Enter an order to see the math.
      </div>
    );
  }
  return (
    <div className="p-3">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px] md:grid-cols-4">
        <MathStat k="Liq price" v={`$${formatPrice(result.liquidationPrice)}`} tone="accent" />
        <MathStat k="Buffer" v={`${(result.liqBufferFrac * 100).toFixed(1)}%`} />
        <MathStat k="Margin" v={`$${result.requiredMargin.toFixed(2)}`} />
        <MathStat k="Notional" v={`$${result.notional.toFixed(2)}`} />
        {result.pnlAtTarget !== undefined && (
          <MathStat
            k="PnL at TP"
            v={`${result.pnlAtTarget >= 0 ? '+' : ''}$${result.pnlAtTarget.toFixed(2)}`}
            tone="long"
          />
        )}
        {result.lossAtStop !== undefined && (
          <MathStat
            k="Loss at SL"
            v={`${result.lossAtStop >= 0 ? '+' : ''}$${result.lossAtStop.toFixed(2)}`}
            tone="short"
          />
        )}
        {result.rewardToRisk !== undefined && (
          <MathStat k="R:R" v={`${result.rewardToRisk.toFixed(2)} : 1`} />
        )}
        <MathStat
          k="Funding 24h"
          v={`${result.fundingCostPer24h > 0 ? '−' : '+'}$${Math.abs(result.fundingCostPer24h).toFixed(2)}`}
        />
      </dl>
      {result.stopIsSafe === false && (
        <div className="mt-3 rounded-klub border border-pnl-short/30 bg-pnl-short/10 p-2.5 text-[11px] font-medium text-pnl-short">
          ⚠ Stop beyond liquidation. Tighten stop or reduce leverage.
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Order form + Math side panel
// =============================================================================

function OrderFormPanel({
  symbol,
  mark,
  onResult,
  onMathResult,
}: {
  readonly symbol: Sym;
  readonly mark: number;
  readonly onResult: (result: SubmitOrderResult) => void;
  readonly onMathResult: (result: CalcResult | null) => void;
}) {
  const { connected, mounted, promptConnect } = useWalletGate();
  const { state, submit } = useBulkOrder();

  const [side, setSide] = useState<Side>('long');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [price, setPrice] = useState(mark);
  // `sizeUsd` is what the user types — dollar notional of the position.
  // We convert to base-asset size (`size / price`) only when submitting
  // to Bulk (which expects base units). This matches retail UX.
  //
  // State is `number | ''` so the input can be fully cleared. Previous
  // version mapped empty → 0, which re-rendered as "0.00" and made the
  // field effectively impossible to erase without selecting-all-and-
  // replacing. The empty state is treated as zero for derived math and
  // disables the submit button, which is the correct behavior.
  const [sizeUsd, setSizeUsd] = useState<number | ''>(500);
  const sizeUsdNum = typeof sizeUsd === 'number' ? sizeUsd : 0;
  const [leverage, setLeverage] = useState(5);
  const [targetPrice, setTargetPrice] = useState<number | ''>(mark * 1.04);
  const [stopPrice, setStopPrice] = useState<number | ''>(mark * 0.96);

  // Track whether the user has manually edited each price field. If
  // they haven't, we keep auto-filling with the current mark so the
  // defaults stay sensible even when the WS price moves before they
  // interact. Once they type anything, we stop auto-updating so their
  // input doesn't get clobbered on the next tick.
  //
  // Rationale: without this, we either
  //   (a) lock the input to page-load mark (forever stale), OR
  //   (b) snap the input to every WS tick (impossible to type)
  // Touch-tracking cleanly threads the needle: "stale default until
  // the user cares, then user-controlled".
  const [priceTouched, setPriceTouched] = useState(false);
  const [tpTouched, setTpTouched] = useState(false);
  const [slTouched, setSlTouched] = useState(false);

  // Auto-sync to mark while untouched. Runs on every WS tick but only
  // writes state when untouched, so it's cheap and causes no churn.
  useEffect(() => {
    if (!priceTouched) setPrice(mark);
    if (!tpTouched) setTargetPrice(mark * 1.04);
    if (!slTouched) setStopPrice(mark * 0.96);
  }, [mark, priceTouched, tpTouched, slTouched]);

  // Reset touched flags + defaults on symbol change. Switching asset
  // is an explicit "start over" intent — the old price/TP/SL aren't
  // meaningful for the new market.
  useEffect(() => {
    setPriceTouched(false);
    setTpTouched(false);
    setSlTouched(false);
  }, [symbol]);

  // Derived: base-asset size used for the math calc AND for the final
  // Bulk submission. Guard against zero mark to avoid Infinity.
  const entryPx = orderType === 'limit' ? price : mark;
  const sizeBase = entryPx > 0 ? sizeUsdNum / entryPx : 0;

  const result = useMemo(() => {
    try {
      return calculate({
        side,
        leverage,
        entryPrice: entryPx,
        size: sizeBase,
        ...(typeof targetPrice === 'number' ? { targetPrice } : {}),
        ...(typeof stopPrice === 'number' ? { stopPrice } : {}),
        maintenanceMarginFrac: 0.005,
        takerBps: 5,
        funding8hRate: 0.0001,
      });
    } catch {
      return null;
    }
  }, [side, leverage, orderType, price, mark, entryPx, sizeBase, targetPrice, stopPrice]);

  // Publish the live math result to the parent so the Math tab in
  // BottomTabs can render it. Running as an effect rather than inline
  // so we don't call a parent setter during our own render.
  useEffect(() => {
    onMathResult(result);
  }, [result, onMathResult]);

  const isSubmitting = state.status === 'submitting';
  const submitDisabled =
    !mounted ||
    isSubmitting ||
    !Number.isFinite(sizeUsdNum) ||
    sizeUsdNum <= 0 ||
    !Number.isFinite(sizeBase) ||
    sizeBase <= 0 ||
    (orderType === 'limit' && (!Number.isFinite(price) || price <= 0));

  async function handleSubmit() {
    if (!mounted) return;
    if (!connected) {
      promptConnect();
      return;
    }
    // TP/SL are intentionally ignored in Day 3 — we submit only the
    // primary order. Bulk's `range` / on-fill bracket API goes live
    // in a later milestone once basic submission is stable.
    const outcome = await submit({
      symbol,
      side,
      orderType,
      size: sizeBase,
      ...(orderType === 'limit' ? { price } : {}),
    });
    onResult(outcome);
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel title="Order">
        <div className="space-y-3 p-3">
          {/* Long / Short */}
          <div className="grid grid-cols-2 overflow-hidden rounded-klub border border-border">
            <button
              type="button"
              onClick={() => {
                setSide('long');
              }}
              className={`py-2 text-[12px] font-medium transition-colors ${
                side === 'long'
                  ? 'bg-pnl-long/15 text-pnl-long'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              Long
            </button>
            <button
              type="button"
              onClick={() => {
                setSide('short');
              }}
              className={`border-l border-border py-2 text-[12px] font-medium transition-colors ${
                side === 'short'
                  ? 'bg-pnl-short/15 text-pnl-short'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              Short
            </button>
          </div>

          {/* Limit / Market */}
          <div className="grid grid-cols-2 overflow-hidden rounded-klub border border-border">
            {(['limit', 'market'] as const).map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setOrderType(t);
                }}
                className={`${
                  i === 1 ? 'border-l border-border' : ''
                } py-1.5 text-[11px] font-medium transition-colors ${
                  orderType === t
                    ? 'bg-accent/15 text-accent'
                    : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {t === 'limit' ? 'Limit' : 'Market'}
              </button>
            ))}
          </div>

          {orderType === 'limit' && (
            <NumField
              label="Price"
              value={price}
              onChange={(v) => {
                setPriceTouched(true);
                if (typeof v === 'number') setPrice(v);
                // NumField may emit '' for empty input; ignore here so
                // we don't stomp the defaulted value into an invalid
                // state that breaks the submit button logic.
              }}
              suffix="USD"
            />
          )}
          <div>
            <NumField
              label="Size"
              value={sizeUsd}
              onChange={(v) => {
                // Pass through both number and '' — NumField already
                // distinguishes "empty input" from "invalid input", so
                // forwarding both lets the user fully clear the field.
                // Previous implementation mapped empty → 0, which
                // re-rendered as "0.00" and trapped the input.
                setSizeUsd(v);
              }}
              suffix="USD"
              step={10}
              decimals={2}
            />
            <div className="mt-1 flex items-center justify-between text-[10px] text-fg-muted">
              <span>≈ {sizeBase > 0 ? sizeBase.toFixed(6) : '—'} {symbol.split('-')[0] ?? ''}</span>
              <div className="flex gap-1">
                {[100, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSizeUsd(preset);
                    }}
                    className="rounded px-1.5 py-0.5 text-[10px] text-fg-muted transition-colors hover:bg-bg-elevated hover:text-fg-primary"
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label>Leverage</Label>
              <span className="font-mono text-[15px] text-accent">{leverage}×</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={0.5}
              value={leverage}
              onChange={(e) => {
                setLeverage(Number(e.target.value));
              }}
              className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
            />
          </div>

          {/* TP / SL row */}
          <div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-3">
            <NumField
              label="TP"
              value={targetPrice}
              onChange={(v) => {
                setTpTouched(true);
                setTargetPrice(v);
              }}
              optional
              compact
            />
            <NumField
              label="SL"
              value={stopPrice}
              onChange={(v) => {
                setSlTouched(true);
                setStopPrice(v);
              }}
              optional
              compact
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className={`w-full rounded-klub py-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              !mounted || !connected
                ? 'bg-accent text-bg-base hover:opacity-90'
                : side === 'long'
                  ? 'bg-pnl-long text-bg-base hover:opacity-90'
                  : 'bg-pnl-short text-bg-base hover:opacity-90'
            }`}
          >
            {!mounted
              ? '…'
              : !connected
                ? 'Connect wallet to trade'
                : isSubmitting
                  ? 'Submitting…'
                  : `${side === 'long' ? 'Buy / Long' : 'Sell / Short'} · ${orderType}`}
          </button>
        </div>
      </Panel>

      {/* Math panel moved to BottomTabs (Positions | Recent trades |
          Math). Result is published to the parent via `onMathResult`
          in the useEffect above. */}
    </div>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">{children}</span>
  );
}

function MathStat({
  k,
  v,
  tone,
}: {
  readonly k: string;
  readonly v: string;
  readonly tone?: 'long' | 'short' | 'accent';
}) {
  const color =
    tone === 'long'
      ? 'text-pnl-long'
      : tone === 'short'
        ? 'text-pnl-short'
        : tone === 'accent'
          ? 'text-accent'
          : 'text-fg-primary';
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">{k}</dt>
      <dd className={`text-right font-mono ${color}`}>{v}</dd>
    </>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = 0.01,
  decimals,
  optional,
  compact,
}: {
  readonly label: string;
  readonly value: number | '';
  readonly onChange: (v: number | '') => void;
  readonly suffix?: string;
  readonly step?: number;
  readonly decimals?: number;
  readonly optional?: boolean;
  readonly compact?: boolean;
}) {
  // Focus-aware display. The key bug: if `display` always reads
  // `value.toFixed(2)`, then as the user backspaces "500.00" the
  // input re-renders the fully-formatted string on every keystroke,
  // effectively fighting the user's edit — every Backspace looks
  // like it did nothing. The user can't clear the field to type
  // their own value.
  //
  // Fix: while focused, show a raw string that tracks what the user
  // is actually typing (no forced decimals). When they blur, snap
  // back to the formatted `.toFixed(decimals)` presentation. This
  // matches how every financial input on every real trading app
  // behaves — formatted when not active, raw when editing.
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState<string>('');

  const formatted =
    value === '' ? '' : decimals !== undefined ? value.toFixed(decimals) : String(value);
  const display = focused ? raw : formatted;

  return (
    <div>
      <Label>
        {label}
        {optional && <span className="ml-1 text-fg-muted">· opt</span>}
      </Label>
      <div className="relative mt-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={display}
          onFocus={() => {
            // Seed the raw buffer with the current formatted value
            // so the user's first keystroke edits what they see
            // rather than replacing a stale string.
            setRaw(formatted);
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
          }}
          onChange={(e) => {
            const s = e.target.value;
            setRaw(s);
            if (s === '') {
              onChange('');
              return;
            }
            const n = Number(s);
            if (Number.isFinite(n)) onChange(n);
          }}
          className={`w-full rounded-klub border border-border bg-bg-base ${
            compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
          } pr-11 font-mono text-[12px] text-fg-primary focus:border-accent focus:outline-none`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Submit result modal — shows success with order id or failure reason
// =============================================================================

function SubmitResultModal({
  result,
  onClose,
}: {
  readonly result: SubmitOrderResult;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const testnetUrl = process.env['NEXT_PUBLIC_BULK_TESTNET_APP_URL'] ?? 'https://early.bulk.trade';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-klub-lg border border-border bg-bg-surface p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between">
          {result.ok ? (
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-pnl-long">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pnl-long" />
              Submitted
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-pnl-short">
              <span className="h-1.5 w-1.5 rounded-full bg-pnl-short" />
              Rejected
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-lg text-fg-muted transition-colors hover:text-fg-primary"
          >
            ×
          </button>
        </div>

        {result.ok ? (
          <>
            <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-fg-primary">
              Order sent to Bulk.
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-secondary">
              Your order was accepted by the exchange. Fill status will appear
              in your positions once matched.
            </p>
            {result.orderId && (
              <div className="mt-5 rounded-klub border border-border-subtle bg-bg-base p-3">
                <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
                  Order ID
                </div>
                <div className="mt-1 break-all font-mono text-[12px] text-fg-primary">
                  {result.orderId}
                </div>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <a
                href={testnetUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-secondary btn-compact"
              >
                View on Bulk ↗
              </a>
              <button type="button" onClick={onClose} className="btn-primary btn-compact">
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mt-4 text-[20px] font-semibold tracking-tight text-fg-primary">
              {titleForReason(result.reason)}
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-secondary">
              {humanizeReason(result.reason, result.message)}
            </p>
            <div className="mt-4 rounded-klub border border-border-subtle bg-bg-base p-3">
              <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
                Raw response
              </div>
              <div className="mt-1 break-words font-mono text-[11px] text-fg-muted">
                {result.message}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-primary btn-compact">
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function titleForReason(reason: Extract<SubmitOrderResult, { ok: false }>['reason']): string {
  switch (reason) {
    case 'rejected_risk_limit':
      return 'Risk limit exceeded';
    case 'rejected_crossing':
      return 'Order would cross the book';
    case 'user_rejected':
      return 'Signature cancelled';
    case 'network_error':
      return 'Network error';
    case 'rejected_invalid':
    default:
      return 'Order rejected';
  }
}

function humanizeReason(
  reason: Extract<SubmitOrderResult, { ok: false }>['reason'],
  raw: string,
): string {
  switch (reason) {
    case 'rejected_risk_limit':
      return 'This order exceeds your position or margin risk limit. Reduce size or leverage and try again.';
    case 'rejected_crossing':
      return 'Your limit price would match an existing order on the opposite side. Adjust the price or use a market order.';
    case 'user_rejected':
      return 'You declined the signature request. No order was submitted.';
    case 'network_error':
      return 'Could not reach the exchange. Check your connection and try again.';
    case 'rejected_invalid':
    default:
      return raw || 'The exchange rejected this order. See details below.';
  }
}

// =============================================================================
// Helpers
// =============================================================================

function formatPrice(p: number): string {
  if (p === 0) return '0.00';
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}