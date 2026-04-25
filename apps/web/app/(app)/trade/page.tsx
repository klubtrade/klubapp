'use client';

import { calculate, type Side } from '@klub/calc';
import { useEffect, useMemo, useState } from 'react';

import { useConnectionState } from '@/hooks/use-connection-state';
import { useTickers } from '@/hooks/use-tickers';
import { MARKETS, SEED_PRICES, type MarketSymbol } from '@/lib/markets';

/**
 * /trade — the central trading screen.
 *
 * Backed by `useTickers` via the shared market-data singleton. Live
 * Bulk data when `NEXT_PUBLIC_BULK_WS_URL` is set; demo-mode simulated
 * ticks otherwise. The mark value always has a seeded fallback so the
 * orderbook, chart, and math panel never flash zero at mount.
 *
 * Four panels: market header, orderbook, chart + positions, order
 * form + live Math side panel.
 *
 * Source-of-truth: market list is imported from `lib/markets.ts` so
 * adding/removing a market is a one-line change in that file (it's
 * also consumed by /quick-trade, /pro, /calculator, etc).
 */

const SYMBOLS = MARKETS.map((m) => m.symbol) as readonly MarketSymbol[];
type Sym = MarketSymbol;
const INITIAL_PRICES = SEED_PRICES;

export default function TradePage() {
  const [symbol, setSymbol] = useState<Sym>('BTC-USD');
  const [submitModal, setSubmitModal] = useState<{
    readonly side: Side;
    readonly orderType: 'market' | 'limit';
  } | null>(null);

  // Live tickers for every symbol in the dropdown. Switching markets
  // is instant — the subscription is already open.
  const allSymbols = useMemo(() => [...SYMBOLS], []);
  const livePrices = useTickers(allSymbols);
  const mark = livePrices[symbol]?.mark ?? INITIAL_PRICES[symbol];

  return (
    <main className="min-h-screen">
      <MarketHeader symbol={symbol} mark={mark} onSymbolChange={setSymbol} />
      <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-6 md:px-6">
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_380px]">
          <Orderbook mark={mark} />
          <ChartAndPositions mark={mark} symbol={symbol} />
          <OrderFormPanel
            symbol={symbol}
            mark={mark}
            onSubmit={(ctx) => {
              setSubmitModal(ctx);
            }}
          />
        </div>
      </div>
      {submitModal && (
        <SubmitStubModal
          side={submitModal.side}
          orderType={submitModal.orderType}
          onClose={() => {
            setSubmitModal(null);
          }}
        />
      )}
    </main>
  );
}

// =============================================================================
// Market header
// =============================================================================

/**
 * The header is sticky just below the global TopNav (which is `top-0`
 * h-14). We pin to `top-14` so the symbol/mark/24h context stays
 * visible while users scroll through the orderbook, chart, and order
 * form. `z-30` keeps it below the TopNav drawer (z-50) and the
 * waitlist/submit modal (z-50) but above the panels' contents.
 *
 * The translucent background + backdrop-blur is the standard "sticky
 * surface" pattern: keeps the bar legible when content scrolls
 * underneath without opaquely hiding what's behind it.
 */
function MarketHeader({
  symbol,
  mark,
  onSymbolChange,
}: {
  readonly symbol: Sym;
  readonly mark: number;
  readonly onSymbolChange: (s: Sym) => void;
}) {
  const base = INITIAL_PRICES[symbol];
  const pct = ((mark - base) / base) * 100;
  const pctTone = pct >= 0 ? 'text-pnl-long' : 'text-pnl-short';

  return (
    <section className="sticky top-14 z-30 border-b border-border-subtle bg-bg-base/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-4 py-4 md:px-6">
        <div className="flex items-center gap-8">
          <select
            value={symbol}
            onChange={(e) => {
              onSymbolChange(e.target.value as Sym);
            }}
            className="cursor-pointer rounded-klub border border-border-subtle bg-bg-surface px-3 py-2 text-[14px] font-medium text-fg-primary transition-colors hover:border-border focus:border-accent focus:outline-none"
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div>
            <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">Mark</div>
            <div className="mt-1 font-mono text-[22px] tracking-[-0.01em] text-fg-primary">
              ${formatPrice(mark)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">24h</div>
            <div className={`mt-1 font-mono text-[18px] ${pctTone}`}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-6 text-[12px] text-fg-muted md:flex">
          <span>
            Funding 1h <span className="text-fg-secondary">0.0095%</span>
          </span>
          <span>
            OI <span className="text-fg-secondary">$412M</span>
          </span>
          <span>
            Vol 24h <span className="text-fg-secondary">$1.84B</span>
          </span>
          <TradeConnectionPill />
        </div>
      </div>
    </section>
  );
}

function TradeConnectionPill() {
  const { isLive, isDemo, isReconnecting } = useConnectionState();
  if (isReconnecting) {
    return (
      <span className="flex items-center gap-2 text-alert-orange">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-alert-orange" />
        Reconnecting
      </span>
    );
  }
  if (isLive) {
    return (
      <span className="flex items-center gap-2 text-pnl-long">
        <span className="live-dot" aria-hidden />
        Live
      </span>
    );
  }
  if (isDemo) {
    return (
      <span className="flex items-center gap-2" title="No WS URL — simulated ticks">
        <span className="h-1.5 w-1.5 rounded-full bg-fg-muted" />
        Demo
      </span>
    );
  }
  return null;
}

// =============================================================================
// Orderbook
// =============================================================================

function Orderbook({ mark }: { readonly mark: number }) {
  const book = useMemo(() => generateBook(mark), [mark]);
  return (
    <section className="flex flex-col overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface">
      <PanelHead>Order book</PanelHead>
      <div className="grid grid-cols-3 border-b border-border-subtle px-3 py-2 text-[11px] uppercase tracking-[0.06em] text-fg-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Sum</span>
      </div>
      <div className="flex flex-col">
        {book.asks.map((row, i) => (
          <BookRow key={`a${i}`} row={row} side="ask" maxSum={book.maxSum} />
        ))}
      </div>
      <div className="border-y border-border-subtle px-3 py-2.5 text-center font-mono text-[17px] text-accent">
        ${formatPrice(mark)}
      </div>
      <div className="flex flex-col">
        {book.bids.map((row, i) => (
          <BookRow key={`b${i}`} row={row} side="bid" maxSum={book.maxSum} />
        ))}
      </div>
    </section>
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
  const widthPct = (row.sum / maxSum) * 100;
  const tone = side === 'ask' ? 'text-pnl-short' : 'text-pnl-long';
  const bgTone = side === 'ask' ? 'bg-pnl-short/10' : 'bg-pnl-long/10';
  return (
    <div className="relative grid grid-cols-3 px-3 py-1 font-mono text-[11px]">
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
  for (let i = 0; i < 10; i++) {
    const askSize = 0.8 + Math.random() * 2.5;
    askSum += askSize;
    asks.push({ px: mark + tick * (i + 1), sz: askSize, sum: askSum });
    const bidSize = 0.8 + Math.random() * 2.5;
    bidSum += bidSize;
    bids.push({ px: mark - tick * (i + 1), sz: bidSize, sum: bidSum });
  }
  asks.reverse();
  return { asks, bids, maxSum: Math.max(askSum, bidSum) };
}

// =============================================================================
// Chart + positions
// =============================================================================

function ChartAndPositions({ mark, symbol }: { readonly mark: number; readonly symbol: Sym }) {
  return (
    <section className="flex flex-col gap-4">
      <ChartPlaceholder mark={mark} symbol={symbol} />
      <PositionsTable mark={mark} symbol={symbol} />
    </section>
  );
}

function ChartPlaceholder({ mark, symbol }: { readonly mark: number; readonly symbol: Sym }) {
  return (
    <div className="flex min-h-[340px] flex-col justify-between rounded-klub-lg border border-border-subtle bg-bg-surface p-6">
      <div className="flex items-center justify-between">
        <PanelHead>Chart · {symbol}</PanelHead>
        <div className="flex gap-1">
          {['1m', '5m', '15m', '1h', '4h', '1D'].map((tf, i) => (
            <button
              key={tf}
              type="button"
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                i === 2
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-muted hover:bg-bg-elevated hover:text-fg-primary'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 py-4">
        <svg viewBox="0 0 400 150" className="h-full w-full">
          <defs>
            <linearGradient id="chart-fade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M 0 120 Q 40 80 80 90 T 160 70 T 240 60 T 320 50 T 400 40 L 400 150 L 0 150 Z"
            fill="url(#chart-fade)"
          />
          <path
            d="M 0 120 Q 40 80 80 90 T 160 70 T 240 60 T 320 50 T 400 40"
            stroke="var(--accent)"
            strokeWidth="1.5"
            fill="none"
          />
          {[30, 60, 90, 120].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="400"
              y2={y}
              stroke="var(--border-subtle)"
              strokeDasharray="2,4"
            />
          ))}
        </svg>
      </div>
      <div className="flex items-baseline justify-between text-[11px] text-fg-muted">
        <span>
          Mark <span className="text-fg-primary">${formatPrice(mark)}</span>
        </span>
        <span>lightweight-charts integration in Phase 3.5</span>
      </div>
    </div>
  );
}

function PositionsTable({ mark, symbol }: { readonly mark: number; readonly symbol: Sym }) {
  const position = {
    symbol,
    side: 'long' as const,
    sizeBase: 0.1,
    entry: INITIAL_PRICES[symbol] * 0.985,
    liqPx: INITIAL_PRICES[symbol] * 0.82,
  };
  const pnl = (mark - position.entry) * position.sizeBase;
  const pnlTone = pnl >= 0 ? 'text-pnl-long' : 'text-pnl-short';
  const buffer = ((mark - position.liqPx) / mark) * 100;
  return (
    <div className="overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface">
      <PanelHead>Positions · 1</PanelHead>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-fg-muted">
            <th className="px-4 py-2.5 font-medium">Market</th>
            <th className="px-4 py-2.5 font-medium">Side</th>
            <th className="px-4 py-2.5 text-right font-medium">Size</th>
            <th className="px-4 py-2.5 text-right font-medium">Entry</th>
            <th className="px-4 py-2.5 text-right font-medium">Liq</th>
            <th className="px-4 py-2.5 text-right font-medium">Buffer</th>
            <th className="px-4 py-2.5 text-right font-medium">PnL</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border-subtle">
            <td className="px-4 py-3 font-mono text-fg-primary">{position.symbol}</td>
            <td className="px-4 py-3 font-mono text-pnl-long">Long</td>
            <td className="px-4 py-3 text-right font-mono">{position.sizeBase}</td>
            <td className="px-4 py-3 text-right font-mono">${formatPrice(position.entry)}</td>
            <td className="px-4 py-3 text-right font-mono">${formatPrice(position.liqPx)}</td>
            <td className="px-4 py-3 text-right font-mono text-accent">{buffer.toFixed(1)}%</td>
            <td className={`px-4 py-3 text-right font-mono ${pnlTone}`}>
              {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Order form + Math side panel
// =============================================================================

function OrderFormPanel({
  symbol,
  mark,
  onSubmit,
}: {
  readonly symbol: Sym;
  readonly mark: number;
  readonly onSubmit: (ctx: { readonly side: Side; readonly orderType: 'market' | 'limit' }) => void;
}) {
  const [side, setSide] = useState<Side>('long');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [price, setPrice] = useState<number | ''>(mark);
  const [size, setSize] = useState<number | ''>(0.05);
  const [leverage, setLeverage] = useState(5);
  const [targetPrice, setTargetPrice] = useState<number | ''>(mark * 1.04);
  const [stopPrice, setStopPrice] = useState<number | ''>(mark * 0.96);

  useEffect(() => {
    setPrice(mark);
    setTargetPrice(mark * 1.04);
    setStopPrice(mark * 0.96);
  }, [symbol, mark]);

  const result = useMemo(() => {
    // price + size can be '' when the user clears the input mid-typing.
    // The calculator contract requires finite numbers, so short-circuit
    // to null in that state rather than feeding it bad input.
    if (size === '') return null;
    const entryPrice = orderType === 'limit' ? price : mark;
    if (entryPrice === '') return null;
    try {
      return calculate({
        side,
        leverage,
        entryPrice,
        size,
        ...(typeof targetPrice === 'number' ? { targetPrice } : {}),
        ...(typeof stopPrice === 'number' ? { stopPrice } : {}),
        maintenanceMarginFrac: 0.005,
        takerBps: 5,
        funding8hRate: 0.0001,
      });
    } catch {
      return null;
    }
  }, [side, leverage, orderType, price, mark, size, targetPrice, stopPrice]);

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-klub-lg border border-border-subtle bg-bg-surface">
        <PanelHead>Order</PanelHead>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 overflow-hidden rounded-klub border border-border">
            <button
              type="button"
              onClick={() => {
                setSide('long');
              }}
              className={`py-2.5 text-[13px] font-medium transition-colors ${
                side === 'long' ? 'bg-pnl-long/15 text-pnl-long' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              Long
            </button>
            <button
              type="button"
              onClick={() => {
                setSide('short');
              }}
              className={`border-l border-border py-2.5 text-[13px] font-medium transition-colors ${
                side === 'short' ? 'bg-pnl-short/15 text-pnl-short' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              Short
            </button>
          </div>

          <div className="grid grid-cols-2 overflow-hidden rounded-klub border border-border">
            {(['limit', 'market'] as const).map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setOrderType(t);
                }}
                className={`${i === 1 ? 'border-l border-border' : ''} py-2 text-[13px] font-medium transition-colors ${
                  orderType === t ? 'bg-accent/15 text-accent' : 'text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {t === 'limit' ? 'Limit' : 'Market'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {orderType === 'limit' && (
              <NumField label="Price" value={price} onChange={setPrice} suffix="USD" />
            )}
            <NumField
              label="Size"
              value={size}
              onChange={setSize}
              suffix={symbol.split('-')[0] ?? symbol}
              step={0.001}
              decimals={4}
            />
            <div>
              <div className="flex items-baseline justify-between">
                <Label>Leverage</Label>
                <span className="font-mono text-lg text-accent">{leverage}×</span>
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
                className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-4">
            <NumField label="TP" value={targetPrice} onChange={setTargetPrice} optional compact />
            <NumField label="SL" value={stopPrice} onChange={setStopPrice} optional compact />
          </div>

          <button
            type="button"
            onClick={() => {
              onSubmit({ side, orderType });
            }}
            className={`w-full rounded-klub py-3 text-[14px] font-medium transition-colors ${
              side === 'long'
                ? 'bg-pnl-long text-bg-base hover:opacity-90'
                : 'bg-pnl-short text-bg-base hover:opacity-90'
            }`}
          >
            {side === 'long' ? 'Buy / Long' : 'Sell / Short'} @ {orderType}
          </button>
        </div>
      </div>

      <div className="rounded-klub-lg border border-border-subtle bg-bg-surface">
        <PanelHead>The Math · live</PanelHead>
        {result && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm">
            <Stat k="Liq price" v={`$${formatPrice(result.liquidationPrice)}`} tone="accent" />
            <Stat k="Buffer" v={`${(result.liqBufferFrac * 100).toFixed(1)}%`} />
            <Stat k="Margin" v={`$${result.requiredMargin.toFixed(2)}`} />
            <Stat k="Notional" v={`$${result.notional.toFixed(2)}`} />
            {result.pnlAtTarget !== undefined && (
              <Stat
                k="PnL at target"
                v={`${result.pnlAtTarget >= 0 ? '+' : ''}$${result.pnlAtTarget.toFixed(2)}`}
                tone="long"
              />
            )}
            {result.lossAtStop !== undefined && (
              <Stat
                k="Loss at stop"
                v={`${result.lossAtStop >= 0 ? '+' : ''}$${result.lossAtStop.toFixed(2)}`}
                tone="short"
              />
            )}
            {result.rewardToRisk !== undefined && (
              <Stat k="R:R" v={`${result.rewardToRisk.toFixed(2)} : 1`} />
            )}
            <Stat
              k="Funding 24h"
              v={`${result.fundingCostPer24h > 0 ? '−' : '+'}$${Math.abs(result.fundingCostPer24h).toFixed(2)}`}
            />
          </dl>
        )}
        {result?.stopIsSafe === false && (
          <div className="mx-5 mb-5 rounded-klub border border-pnl-short/30 bg-pnl-short/10 p-3 text-[12px] font-medium text-pnl-short">
            ⚠ Stop beyond liquidation. Tighten stop or reduce leverage.
          </div>
        )}
      </div>
    </section>
  );
}

function PanelHead({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="border-b border-border-subtle px-5 py-3 text-[11px] uppercase tracking-[0.06em] text-fg-muted">
      {children}
    </div>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">{children}</span>
  );
}

function Stat({
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
      <dt className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">{k}</dt>
      <dd className={`text-right font-mono ${color}`}>{v}</dd>
    </>
  );
}

/**
 * NumField — numeric input with select-on-focus.
 *
 * Retail UX fix: previously, tapping the size input forced users to
 * manually delete each character of the default value (e.g. 0.0500)
 * before entering their own size. `onFocus={(e) => e.target.select()}`
 * highlights the entire content the moment the field receives focus,
 * so typing immediately replaces — exactly what users expect from
 * trading screens (Coinbase, Hyperliquid, dYdX, Bulk all do this).
 *
 * Also catches the keyboard-tab path: tabbing into the field selects
 * everything just like tapping with a mouse.
 */
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
  const display = value === '' ? '' : decimals !== undefined ? value.toFixed(decimals) : String(value);
  return (
    <div>
      <Label>
        {label}
        {optional && <span className="ml-1 text-fg-muted">·opt</span>}
      </Label>
      <div className="relative mt-1.5">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={display}
          onFocus={(e) => {
            e.target.select();
          }}
          onChange={(e) => {
            const s = e.target.value;
            if (s === '') {
              onChange('');
              return;
            }
            const n = Number(s);
            if (Number.isFinite(n)) onChange(n);
          }}
          className={`w-full rounded-klub border border-border bg-bg-base ${compact ? 'px-2 py-1.5' : 'px-3 py-2'} pr-12 font-mono text-sm text-fg-primary focus:border-accent focus:outline-none`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] uppercase tracking-[0.06em] text-fg-muted">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function formatPrice(p: number): string {
  if (p === 0) return '0.00';
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// =============================================================================
// Submit stub modal — honest "not wired yet" without a waitlist gate
// =============================================================================

/**
 * Previously this modal told the user "you're on the waitlist" and
 * routed them to /#waitlist. That created a confusing dead-end where
 * users who clicked Buy thought they'd been put on a waitlist they
 * never signed up for, and got redirected to the marketing page — a
 * UX gate disguised as a confirmation. There is no actual waitlist
 * blocking trading; the only thing missing is the Ed25519 signer
 * wiring (worker → Bulk's `placeOrders`). So the modal now says
 * exactly that, in plain language, with two real next-actions:
 * try practice mode (works today) or browse leaders (also works).
 */
function SubmitStubModal({
  side,
  orderType,
  onClose,
}: {
  readonly side: Side;
  readonly orderType: 'market' | 'limit';
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

  const sideLabel = side === 'long' ? 'Buy / Long' : 'Sell / Short';
  const sideTone = side === 'long' ? 'text-pnl-long' : 'text-pnl-short';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-klub-lg border border-border bg-bg-surface p-8 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
            <span className="live-dot" aria-hidden />
            Pre-launch
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-lg text-fg-muted transition-colors hover:text-fg-primary"
          >
            ×
          </button>
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight text-fg-primary">
          Order signing is next.
        </h2>
        <p className="mt-4 text-[14px] leading-relaxed text-fg-secondary">
          Your <span className={sideTone}>{sideLabel}</span> ({orderType}) passed validation —
          the math, the risk, the route are all correct. What&rsquo;s missing is the
          Ed25519 agent-wallet signer that hands the order to Bulk. We&rsquo;re wiring
          it now. In the meantime, practice mode lets you place identical orders against
          a simulated book.
        </p>
        <dl className="mt-6 grid grid-cols-3 gap-3 border-y border-border-subtle py-4 text-[11px] uppercase tracking-[0.06em]">
          <div>
            <dt className="text-fg-muted">Validation</dt>
            <dd className="mt-1 text-pnl-long">Passed</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Signer</dt>
            <dd className="mt-1 text-accent">Wiring</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Practice</dt>
            <dd className="mt-1 text-fg-primary">Ready</dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/practice"
            className="rounded-klub bg-accent px-4 py-2 text-[13px] font-medium text-bg-base transition-colors hover:bg-accent-bright"
          >
            Try practice mode
          </a>
          <a
            href="/follow"
            className="rounded-klub border border-border px-4 py-2 text-[13px] font-medium text-fg-primary transition-colors hover:border-fg-muted hover:bg-bg-elevated"
          >
            Browse leaders
          </a>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
          >
            Back to the screen
          </button>
        </div>
      </div>
    </div>
  );
}
