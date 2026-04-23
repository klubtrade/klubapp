'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useConnectionState } from '@/hooks/use-connection-state';
import { useTickers } from '@/hooks/use-tickers';

/**
 * /pro — KLUB Pro. Terminal-grade trading screen.
 *
 * Design goal: a trader who's used Bloomberg, OptionVision, or any
 * pro desk tool should feel at home inside 30 seconds. Six panels
 * laid out in a persistent grid, a command palette (⌘K) that
 * routes to actions, keyboard-first everywhere.
 *
 * Panels:
 *   1. Watchlist      — 12 markets with mark + funding + OI (sortable)
 *   2. Chart          — big central panel (canvas placeholder, 8 TFs)
 *   3. Orderbook      — 15 levels each side, cumulative size bars
 *   4. Tape           — recent prints with aggressor side
 *   5. Order form     — limit/market/stop, size, lev slider, TP/SL
 *   6. Positions      — open positions + PnL + close buttons
 *
 * ⌘K palette commands:
 *   - "buy BTC 0.1"   — open the order form prefilled
 *   - "close all"     — close every position
 *   - "alerts on"     — enable alerts
 *   - "go to <page>"  — navigation shortcuts
 *
 * Mobile: shows a "best on desktop" gate with a link to /quick-trade.
 * Terminals don't work on phones.
 */

const WATCHLIST: readonly {
  readonly sym: string;
  readonly mark: number;
  readonly chg24hPct: number;
  readonly fund8h: number;
  readonly oi: number;
}[] = [
  { sym: 'BTC-USD', mark: 67_420, chg24hPct: 1.84, fund8h: 0.0118, oi: 412_000_000 },
  { sym: 'ETH-USD', mark: 3_284, chg24hPct: 2.12, fund8h: 0.0094, oi: 248_000_000 },
  { sym: 'SOL-USD', mark: 178.4, chg24hPct: -0.62, fund8h: 0.0172, oi: 88_000_000 },
  { sym: 'HYPE-USD', mark: 31.22, chg24hPct: 5.41, fund8h: -0.0060, oi: 42_000_000 },
  { sym: 'DOGE-USD', mark: 0.1842, chg24hPct: -1.18, fund8h: 0.0205, oi: 36_000_000 },
  { sym: 'AVAX-USD', mark: 42.68, chg24hPct: 0.94, fund8h: 0.0038, oi: 19_000_000 },
  { sym: 'LINK-USD', mark: 14.88, chg24hPct: -0.22, fund8h: 0.0061, oi: 12_000_000 },
  { sym: 'ARB-USD', mark: 0.84, chg24hPct: 3.08, fund8h: 0.0012, oi: 8_000_000 },
  { sym: 'OP-USD', mark: 1.94, chg24hPct: 2.04, fund8h: -0.0004, oi: 6_000_000 },
  { sym: 'NEAR-USD', mark: 5.62, chg24hPct: 1.42, fund8h: 0.0081, oi: 5_000_000 },
  { sym: 'APT-USD', mark: 8.24, chg24hPct: -2.08, fund8h: 0.0028, oi: 3_200_000 },
  { sym: 'SUI-USD', mark: 1.68, chg24hPct: 4.12, fund8h: 0.0094, oi: 2_800_000 },
];

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D', '1W'] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

export default function ProPage() {
  const [symbol, setSymbol] = useState('BTC-USD');
  const [timeframe, setTimeframe] = useState<Timeframe>('15m');
  const [showPalette, setShowPalette] = useState(false);

  // Subscribe to every market in the watchlist — singleton socket
  // multiplexes, one subscription per symbol.
  const allSymbols = useMemo(() => WATCHLIST.map((w) => w.sym), []);
  const livePrices = useTickers(allSymbols);

  // ⌘K / Ctrl+K opens the palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      if (e.key === 'Escape') setShowPalette(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Live mark with seeded fallback. If a tick has arrived for this
  // symbol, use it; otherwise use the WATCHLIST seed price so the
  // chart, orderbook, and order form always have something to render.
  const mark =
    livePrices[symbol]?.mark ??
    WATCHLIST.find((w) => w.sym === symbol)?.mark ??
    0;

  return (
    <>
      {/* Mobile gate */}
      <div className="flex min-h-screen items-center justify-center px-6 md:hidden">
        <div className="max-w-sm rounded-klub-lg border border-border-subtle bg-bg-surface p-8 text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
            KLUB Pro
          </div>
          <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight">
            Best on a real screen.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-fg-secondary">
            Pro is a terminal. On mobile, Quick Trade is better — simpler, safer, same markets.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Link href="/quick-trade" className="btn-primary btn-compact">
              Open Quick Trade
            </Link>
            <Link href="/home" className="text-[13px] text-fg-muted transition-colors hover:text-fg-primary">
              Back to home
            </Link>
          </div>
        </div>
      </div>

      {/* Desktop terminal */}
      <main className="pro-scope hidden min-h-screen pt-16 md:block md:pt-20">
        <ProHeader symbol={symbol} onOpenPalette={() => { setShowPalette(true); }} />
        <div className="grid h-[calc(100vh-64px-56px-56px)] grid-cols-[240px_minmax(0,1fr)_280px_320px] gap-px bg-border-subtle md:h-[calc(100vh-80px-56px-56px)]">
          <PanelWatchlist
            symbol={symbol}
            onSelect={setSymbol}
            livePrices={livePrices}
          />
          <div className="grid grid-rows-[minmax(0,1.3fr)_minmax(0,1fr)] gap-px bg-border-subtle">
            <PanelChart
              symbol={symbol}
              mark={mark}
              timeframe={timeframe}
              onTimeframe={setTimeframe}
            />
            <PanelPositions mark={mark} symbol={symbol} />
          </div>
          <div className="grid grid-rows-[minmax(0,1.6fr)_minmax(0,1fr)] gap-px bg-border-subtle">
            <PanelOrderbook mark={mark} />
            <PanelTape mark={mark} />
          </div>
          <PanelOrderForm symbol={symbol} mark={mark} />
        </div>
        <ProStatusBar onOpenPalette={() => { setShowPalette(true); }} />

        {showPalette && (
          <CommandPalette
            onClose={() => {
              setShowPalette(false);
            }}
            onSymbol={(s) => {
              setSymbol(s);
              setShowPalette(false);
            }}
          />
        )}
      </main>
    </>
  );
}

// =============================================================================
// Header + status bar
// =============================================================================

function ProHeader({
  symbol,
  onOpenPalette,
}: {
  readonly symbol: string;
  readonly onOpenPalette: () => void;
}) {
  const prices = useTickers([symbol]);
  const mark = prices[symbol]?.mark;
  return (
    <header className="flex h-14 items-center justify-between border-b border-border-subtle bg-bg-base px-4">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-2 text-[14px] font-semibold text-fg-primary">
          <span className="text-fg-muted">Pro</span>
          <span className="text-fg-muted">·</span>
          <span className="text-fg-primary">{symbol}</span>
          {mark !== undefined && (
            <span className="ml-1 text-accent">${formatPrice(mark)}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex items-center gap-2 rounded-klub border border-border-subtle bg-bg-surface px-2.5 py-1 text-[11px] text-fg-muted transition-colors hover:border-border hover:text-fg-primary"
        >
          <span>Search / command</span>
          <kbd className="rounded border border-border-subtle bg-bg-elevated px-1.5 py-0 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
      </div>
      {/* Right side intentionally empty — global top-right strip owns this area */}
    </header>
  );
}

function ProStatusBar({ onOpenPalette }: { readonly onOpenPalette: () => void }) {
  const { isLive, isDemo, isReconnecting } = useConnectionState();
  return (
    <footer className="flex h-14 items-center justify-between border-t border-border-subtle bg-bg-base px-4 font-mono text-[11px] text-fg-muted">
      <div className="flex items-center gap-6">
        {isReconnecting ? (
          <span className="flex items-center gap-2 text-alert-orange">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-alert-orange" />
            Reconnecting
          </span>
        ) : isLive ? (
          <span className="flex items-center gap-2 text-pnl-long">
            <span className="h-1.5 w-1.5 animate-pulse-accent rounded-full bg-pnl-long" />
            Live
          </span>
        ) : isDemo ? (
          <span className="flex items-center gap-2" title="No WS URL — simulated ticks">
            <span className="h-1.5 w-1.5 rounded-full bg-fg-muted" />
            Demo
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-fg-muted" />
            Idle
          </span>
        )}
        <span>Latency · 14ms</span>
        <span>Equity · $5,124.32</span>
        <span>Used margin · $337</span>
        <span>Free · $4,787</span>
      </div>
      <div className="flex items-center gap-4">
        <button type="button" onClick={onOpenPalette} className="text-accent">
          ⌘K
        </button>
        <span>v0.1.0</span>
      </div>
    </footer>
  );
}

// =============================================================================
// Watchlist
// =============================================================================

function PanelWatchlist({
  symbol,
  onSelect,
  livePrices,
}: {
  readonly symbol: string;
  readonly onSelect: (s: string) => void;
  readonly livePrices: Record<string, { mark: number; updatedAt: number } | undefined>;
}) {
  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>Watchlist</PanelHead>
      <div className="flex-1 overflow-auto">
        {WATCHLIST.map((w) => {
          const active = w.sym === symbol;
          const chgTone = w.chg24hPct >= 0 ? 'text-pnl-long' : 'text-pnl-short';
          const livePrice = livePrices[w.sym]?.mark;
          const displayMark = livePrice ?? w.mark;
          return (
            <button
              key={w.sym}
              type="button"
              onClick={() => {
                onSelect(w.sym);
              }}
              className={`flex w-full items-baseline justify-between border-b border-border-subtle px-3 py-2 text-left font-mono text-[12px] transition-colors ${
                active ? 'bg-accent/10' : 'hover:bg-bg-elevated'
              }`}
            >
              <span
                className={active ? 'font-semibold text-accent' : 'text-fg-primary'}
              >
                {w.sym}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-fg-secondary">${formatPrice(displayMark)}</span>
                <span className={chgTone}>
                  {w.chg24hPct >= 0 ? '+' : ''}{w.chg24hPct.toFixed(2)}%
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// =============================================================================
// Chart
// =============================================================================

function PanelChart({
  symbol,
  mark,
  timeframe,
  onTimeframe,
}: {
  readonly symbol: string;
  readonly mark: number;
  readonly timeframe: Timeframe;
  readonly onTimeframe: (tf: Timeframe) => void;
}) {
  const path = useMemo(() => buildProChartPath(timeframe), [timeframe]);
  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>
        <div className="flex items-center justify-between">
          <span>Chart · {symbol} · {timeframe}</span>
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => {
                  onTimeframe(tf);
                }}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  tf === timeframe ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg-primary'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </PanelHead>
      <div className="flex-1 p-4">
        <svg viewBox="0 0 800 300" className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pro-chart-fade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
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
          <path d={`${path} L 800 300 L 0 300 Z`} fill="url(#pro-chart-fade)" />
          <path d={path} stroke="var(--accent)" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
      <div className="border-t border-border-subtle px-4 py-1.5 font-mono text-[11px] text-fg-muted">
        O: ${formatPrice(mark * 0.982)} · H: ${formatPrice(mark * 1.014)} · L: $
        {formatPrice(mark * 0.974)} · C: ${formatPrice(mark)}
      </div>
    </section>
  );
}

// =============================================================================
// Orderbook
// =============================================================================

function PanelOrderbook({ mark }: { readonly mark: number }) {
  const book = useMemo(() => generateBook(mark, 15), [mark]);
  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>Order book</PanelHead>
      <div className="grid grid-cols-3 border-b border-border-subtle px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Sum</span>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          {book.asks.map((r, i) => (
            <BookRow key={`a${i}`} row={r} side="ask" maxSum={book.maxSum} />
          ))}
        </div>
        <div className="border-y border-border-subtle px-3 py-1.5 text-center font-mono text-[13px] text-accent">
          ${formatPrice(mark)}
        </div>
        <div className="flex-1 overflow-auto">
          {book.bids.map((r, i) => (
            <BookRow key={`b${i}`} row={r} side="bid" maxSum={book.maxSum} />
          ))}
        </div>
      </div>
    </section>
  );
}

function generateBook(mark: number, depth: number) {
  const tick = mark * 0.0001;
  const asks: { px: number; sz: number; sum: number }[] = [];
  const bids: { px: number; sz: number; sum: number }[] = [];
  let askSum = 0;
  let bidSum = 0;
  for (let i = 0; i < depth; i++) {
    const asz = 0.5 + Math.random() * 2.5;
    askSum += asz;
    asks.push({ px: mark + tick * (i + 1), sz: asz, sum: askSum });
    const bsz = 0.5 + Math.random() * 2.5;
    bidSum += bsz;
    bids.push({ px: mark - tick * (i + 1), sz: bsz, sum: bidSum });
  }
  asks.reverse();
  return { asks, bids, maxSum: Math.max(askSum, bidSum) };
}

function BookRow({
  row,
  side,
  maxSum,
}: {
  readonly row: { px: number; sz: number; sum: number };
  readonly side: 'ask' | 'bid';
  readonly maxSum: number;
}) {
  const widthPct = (row.sum / maxSum) * 100;
  const tone = side === 'ask' ? 'text-pnl-short' : 'text-pnl-long';
  const bgTone = side === 'ask' ? 'bg-pnl-short/10' : 'bg-pnl-long/10';
  return (
    <div className="relative grid grid-cols-3 px-3 py-0.5 font-mono text-[11px]">
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

// =============================================================================
// Tape
// =============================================================================

function PanelTape({ mark }: { readonly mark: number }) {
  const prints = useMemo(
    () =>
      Array.from({ length: 40 }).map((_, i) => ({
        id: i,
        px: mark * (1 + (Math.random() - 0.5) * 0.0008),
        sz: 0.02 + Math.random() * 0.5,
        side: (Math.random() > 0.5 ? 'buy' : 'sell') as 'buy' | 'sell',
        ago: `${Math.floor(i * 2.5)}s`,
      })),
    [mark],
  );
  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>Tape</PanelHead>
      <div className="flex-1 overflow-auto">
        {prints.map((p) => (
          <div
            key={p.id}
            className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-0.5 font-mono text-[11px]"
          >
            <span className={p.side === 'buy' ? 'text-pnl-long' : 'text-pnl-short'}>
              ${formatPrice(p.px)}
            </span>
            <span className="text-right text-fg-secondary">{p.sz.toFixed(3)}</span>
            <span className="text-right text-fg-muted">{p.ago}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// =============================================================================
// Positions
// =============================================================================

function PanelPositions({ mark, symbol }: { readonly mark: number; readonly symbol: string }) {
  const pos = {
    symbol,
    side: 'long' as const,
    sizeBase: 0.1,
    entry: mark * 0.982,
    liq: mark * 0.88,
  };
  const pnl = (mark - pos.entry) * pos.sizeBase;
  const tone = pnl >= 0 ? 'text-pnl-long' : 'text-pnl-short';
  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>Positions · 1</PanelHead>
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-klub border border-border-subtle bg-bg-surface p-3">
          <div className="font-mono text-[12px]">
            <div className="flex items-baseline gap-2">
              <span className="text-pnl-long">LONG</span>
              <span className="text-fg-primary">{pos.symbol}</span>
              <span className="text-fg-muted">{pos.sizeBase}</span>
            </div>
            <div className="mt-1 text-fg-muted">
              Entry ${formatPrice(pos.entry)} · Liq ${formatPrice(pos.liq)}
            </div>
          </div>
          <div className="text-right">
            <div className={`font-mono text-[14px] ${tone}`}>
              {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
            </div>
            <button className="btn-ghost btn-sm mt-1 text-[11px]">Close</button>
          </div>
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Order form
// =============================================================================

function PanelOrderForm({ symbol, mark }: { readonly symbol: string; readonly mark: number }) {
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState(mark);
  const [size, setSize] = useState(0.05);
  const [lev, setLev] = useState(5);

  useEffect(() => {
    setPrice(mark);
  }, [mark, symbol]);

  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>Order · {symbol}</PanelHead>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <div className="grid grid-cols-2 overflow-hidden rounded-klub border border-border">
          <button
            onClick={() => {
              setSide('long');
            }}
            className={`py-2 text-[12px] font-medium transition-colors ${
              side === 'long' ? 'bg-pnl-long/15 text-pnl-long' : 'text-fg-secondary hover:text-fg-primary'
            }`}
          >
            Long
          </button>
          <button
            onClick={() => {
              setSide('short');
            }}
            className={`border-l border-border py-2 text-[12px] font-medium transition-colors ${
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
              onClick={() => {
                setType(t);
              }}
              className={`${i === 1 ? 'border-l border-border' : ''} py-1.5 text-[11px] font-medium transition-colors ${
                type === t ? 'bg-accent/15 text-accent' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {type === 'limit' && (
          <ProField
            label="Price"
            value={price}
            onChange={setPrice}
            suffix="USD"
          />
        )}
        <ProField
          label="Size"
          value={size}
          onChange={setSize}
          suffix={symbol.split('-')[0]}
          step={0.001}
          decimals={4}
        />

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">Leverage</span>
            <span className="font-mono text-[14px] text-accent">{lev}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            step={0.5}
            value={lev}
            onChange={(e) => {
              setLev(Number(e.target.value));
            }}
            className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
          />
        </div>

        <div className="grid grid-cols-4 gap-1">
          {[10, 25, 50, 100].map((p) => (
            <button
              key={p}
              type="button"
              className="rounded-md border border-border-subtle bg-bg-surface py-1 text-[10px] font-medium text-fg-secondary transition-colors hover:border-border hover:text-fg-primary"
            >
              {p}%
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`btn-block mt-4 py-2.5 text-[13px] font-medium ${
            side === 'long' ? 'btn-primary' : 'btn-danger'
          }`}
        >
          {side === 'long' ? 'Buy' : 'Sell'} {symbol} · {type}
        </button>

        <div className="border-t border-border-subtle pt-3 font-mono text-[11px] text-fg-muted">
          <div className="flex items-baseline justify-between">
            <span>Notional</span>
            <span className="text-fg-secondary">
              ${(size * (type === 'limit' ? price : mark) * 1).toFixed(2)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span>Margin</span>
            <span className="text-fg-secondary">
              ${((size * (type === 'limit' ? price : mark)) / lev).toFixed(2)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span>Fee · maker/taker</span>
            <span className="text-fg-secondary">2bps / 5bps</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProField({
  label,
  value,
  onChange,
  suffix,
  step = 0.01,
  decimals,
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly suffix?: string;
  readonly step?: number;
  readonly decimals?: number;
}) {
  return (
    <div>
      <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">{label}</span>
      <div className="relative mt-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={decimals !== undefined ? value.toFixed(decimals) : value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-full rounded-klub border border-border bg-bg-surface px-2.5 py-1.5 pr-10 font-mono text-[12px] text-fg-primary focus:border-accent focus:outline-none"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Panel head + Command Palette
// =============================================================================

function PanelHead({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="border-b border-border-subtle bg-bg-base px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
      {children}
    </div>
  );
}

function CommandPalette({
  onClose,
  onSymbol,
}: {
  readonly onClose: () => void;
  readonly onSymbol: (s: string) => void;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo(
    () => [
      ...WATCHLIST.map((w) => ({
        id: `sym-${w.sym}`,
        label: `Go to ${w.sym}`,
        hint: `$${formatPrice(w.mark)}`,
        run: () => {
          onSymbol(w.sym);
        },
      })),
      {
        id: 'nav-home',
        label: 'Go to Home',
        hint: '/home',
        run: () => {
          window.location.href = '/home';
        },
      },
      {
        id: 'nav-basis',
        label: 'Go to Basis',
        hint: '/basis',
        run: () => {
          window.location.href = '/basis';
        },
      },
      {
        id: 'nav-desk',
        label: 'Go to The Desk',
        hint: '/desk',
        run: () => {
          window.location.href = '/desk';
        },
      },
      {
        id: 'nav-ramp',
        label: 'Add funds',
        hint: '/ramp',
        run: () => {
          window.location.href = '/ramp';
        },
      },
      {
        id: 'act-close-all',
        label: 'Close all positions',
        hint: 'action',
        run: () => {
          onClose();
        },
      },
    ],
    [onSymbol, onClose],
  );

  const filtered = q
    ? commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))
    : commands.slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg-base/70 p-4 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-klub-lg border border-border bg-bg-surface shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={q}
          placeholder="Search markets, run commands…"
          onChange={(e) => {
            setQ(e.target.value);
          }}
          className="w-full border-b border-border-subtle bg-transparent px-4 py-4 text-[15px] text-fg-primary outline-none placeholder:text-fg-muted"
        />
        <div className="max-h-[50vh] overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-fg-muted">No matches.</div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  c.run();
                }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left font-mono text-[13px] transition-colors hover:bg-bg-elevated"
              >
                <span className="text-fg-primary">{c.label}</span>
                <span className="text-[11px] text-fg-muted">{c.hint}</span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2 font-mono text-[10px] text-fg-muted">
          <span>↵ run · ↑↓ navigate · esc close</span>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Deterministic chart path seeded by timeframe. Gives visible feedback
 * that timeframe buttons do something, before real candle data lands.
 */
function buildProChartPath(tf: Timeframe): string {
  const seed = TIMEFRAMES.indexOf(tf);
  const steps = 24;
  const amplitude = 60 + seed * 10;
  const offset = 200 - seed * 12;
  const stepX = 800 / steps;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (i * stepX).toFixed(1);
    const y = (
      offset +
      Math.sin(i * 0.5 + seed) * amplitude * 0.5 +
      Math.cos(i * 0.3 + seed * 2) * amplitude * 0.3
    ).toFixed(1);
    pts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  return pts.join(' ');
}

function formatPrice(p: number): string {
  if (p === 0) return '0.00';
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}