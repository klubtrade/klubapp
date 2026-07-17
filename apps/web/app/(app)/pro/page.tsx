'use client';

import type { CandleInterval, L2Book } from '@klub/api-client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useActiveAccount } from '@/hooks/use-active-account';
import { useBulkAccount, type BulkOpenOrder, type BulkPosition } from '@/hooks/use-bulk-account';
import { useBulkCancel } from '@/hooks/use-bulk-cancel';
import { useBulkOrder } from '@/hooks/use-bulk-order';
import { useCandles } from '@/hooks/use-candles';
import { useConnectionState } from '@/hooks/use-connection-state';
import { useL2Book } from '@/hooks/use-l2-book';
import { useRecentTrades } from '@/hooks/use-recent-trades';
import { useTickers, type LivePrice } from '@/hooks/use-tickers';
import { MARKETS } from '@/lib/markets';
import type { SubmitOrderResult } from '@/lib/bulk/orders';
import { useTradingWallet } from '@/lib/trading-wallet';

/**
 * /pro — KLUB Pro. Bloomberg-style trading terminal.
 *
 * The one place in KLUB where terminal aesthetics are the brief, not
 * the anti-reference. Desktop-only by design — mobile gate redirects
 * to /trade.
 *
 * Six panels in a persistent 4-column grid:
 *   1. Watchlist  — canonical 10 markets, real mark + 24h chg
 *   2. Chart      — lightweight-charts v5 with timeframe selector
 *   3. Positions  — real positions from /api/bulk/account, Close button
 *   4. Order book — L2 ladder, REST polled at 1Hz
 *   5. Tape       — recent trades, WS-streamed
 *   6. Order form — real submit via useBulkOrder
 *
 * ⌘K palette opens a command list (symbol jumps + nav).
 *
 * Session 1 wires real data. Sessions 2+ add hotkey order entry,
 * saved layouts (react-grid-layout), and click-to-trade L2 ladder.
 */

const CandleChart = dynamic(() => import('@/components/candle-chart'), { ssr: false });

const TIMEFRAMES: readonly { readonly label: string; readonly value: CandleInterval }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '4h', value: '4h' },
  { label: '1D', value: '1d' },
];

const ALL_SYMBOLS = MARKETS.map((m) => m.symbol);

function seedPriceFor(symbol: string): number {
  return MARKETS.find((m) => m.symbol === symbol)?.seedPrice ?? 0;
}

function maxLeverageFor(symbol: string): number {
  return MARKETS.find((m) => m.symbol === symbol)?.defaultLeverage ?? 10;
}

function baseLabelFor(symbol: string): string {
  return MARKETS.find((m) => m.symbol === symbol)?.label ?? symbol.split('-')[0] ?? symbol;
}

export default function ProPage() {
  const [symbol, setSymbol] = useState<string>(MARKETS[0]?.symbol ?? 'BTC-USD');
  const [interval, setInterval] = useState<CandleInterval>('15m');
  const [showPalette, setShowPalette] = useState(false);
  const [result, setResult] = useState<SubmitOrderResult | null>(null);

  const { connected } = useTradingWallet();
  // Active account drives positions, orders, and the trading account
  // on every signed action.
  const { pubkey } = useActiveAccount();

  const livePrices = useTickers(ALL_SYMBOLS);
  const { state: accountState, refresh: refreshAccount } = useBulkAccount(pubkey);

  const mark = livePrices[symbol]?.mark ?? seedPriceFor(symbol);

  // ⌘K opens palette; Esc closes palette/result.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
      if (e.key === 'Escape') {
        setShowPalette(false);
        setResult(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleResult = useCallback(
    (r: SubmitOrderResult) => {
      setResult(r);
      if (r.ok) refreshAccount();
    },
    [refreshAccount],
  );

  return (
    <>
      {/* Mobile gate — terminals don't work on phones */}
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
            <Link href="/trade" className="btn-primary btn-compact">
              Open Trade
            </Link>
            <Link href="/portfolio" className="text-[13px] text-fg-muted transition-colors hover:text-fg-primary">
              Back to portfolio
            </Link>
          </div>
        </div>
      </div>

      {/* Desktop terminal */}
      <main className="hidden min-h-screen md:block">
        <ProHeader symbol={symbol} mark={mark} onOpenPalette={() => setShowPalette(true)} />

        <div className="grid h-[calc(100vh-56px-56px)] grid-cols-[240px_minmax(0,1fr)_280px_320px] gap-px bg-border-subtle">
          <PanelWatchlist
            symbol={symbol}
            onSelect={setSymbol}
            livePrices={livePrices}
          />

          <div className="grid grid-rows-[minmax(0,1.3fr)_minmax(0,1fr)] gap-px bg-border-subtle">
            <PanelChart
              symbol={symbol}
              interval={interval}
              onInterval={setInterval}
              mark={mark}
            />
            <PanelPositions
              positions={accountState.data?.positions ?? []}
              openOrders={accountState.data?.openOrders ?? []}
              livePrices={livePrices}
              accountStatus={accountState.status}
              connected={connected}
              onResult={handleResult}
            />
          </div>

          <div className="grid grid-rows-[minmax(0,1.6fr)_minmax(0,1fr)] gap-px bg-border-subtle">
            <PanelOrderbook symbol={symbol} mark={mark} />
            <PanelTape symbol={symbol} />
          </div>

          <PanelOrderForm
            symbol={symbol}
            mark={mark}
            connected={connected}
            onResult={handleResult}
          />
        </div>

        <ProStatusBar
          accountState={accountState}
          connected={connected}
          onOpenPalette={() => setShowPalette(true)}
        />

        {showPalette && (
          <CommandPalette
            livePrices={livePrices}
            onClose={() => setShowPalette(false)}
            onSymbol={(s) => {
              setSymbol(s);
              setShowPalette(false);
            }}
          />
        )}

        {result && <ResultModal result={result} onClose={() => setResult(null)} />}
      </main>
    </>
  );
}

// =============================================================================
// Header + status bar
// =============================================================================

function ProHeader({
  symbol,
  mark,
  onOpenPalette,
}: {
  readonly symbol: string;
  readonly mark: number;
  readonly onOpenPalette: () => void;
}) {
  // The desktop sidebar handles left-side clearance via the
  // (app)/layout.tsx `md:pl-20` wrapper, so this header only needs to
  // reserve room on the right for the layout-shell wallet pill (the
  // wallet, when connected, renders as ~250-300px of pills via
  // WalletButton). px-6 / md:pr-[20rem] does that.
  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border-subtle bg-bg-base pl-6 pr-72 md:pr-[20rem]">
      <div className="flex min-w-0 items-center gap-3 font-mono text-[13px] text-fg-muted">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em]">
          Pro
        </span>
        <span className="text-fg-primary">{symbol}</span>
        {mark > 0 && (
          <span className="text-accent">${formatPrice(mark)}</span>
        )}
      </div>
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex shrink-0 items-center gap-2 rounded-klub border border-border-subtle bg-bg-surface px-3 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-border hover:text-fg-primary"
      >
        <span>Search or run command</span>
        <kbd className="rounded border border-border-subtle bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>
    </header>
  );
}

function ProStatusBar({
  accountState,
  connected,
  onOpenPalette,
}: {
  readonly accountState: ReturnType<typeof useBulkAccount>['state'];
  readonly connected: boolean;
  readonly onOpenPalette: () => void;
}) {
  const { isLive, isDemo, isReconnecting } = useConnectionState();

  const equity = accountState.data?.equityUsd ?? null;
  const free = accountState.data?.freeMarginUsd ?? null;
  const used =
    equity !== null && free !== null ? Math.max(equity - free, 0) : null;

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
        <span>{connected ? 'Wallet · connected' : 'Wallet · disconnected'}</span>
        <span>Equity · {equity !== null ? `$${formatUsd(equity)}` : '—'}</span>
        <span>Used margin · {used !== null ? `$${formatUsd(used)}` : '—'}</span>
        <span>Free · {free !== null ? `$${formatUsd(free)}` : '—'}</span>
      </div>
      <div className="flex items-center gap-4">
        <button type="button" onClick={onOpenPalette} className="text-accent">
          ⌘K
        </button>
        <span>v0.2.0</span>
      </div>
    </footer>
  );
}

// =============================================================================
// Watchlist — canonical MARKETS with live ticker overlay
// =============================================================================

function PanelWatchlist({
  symbol,
  onSelect,
  livePrices,
}: {
  readonly symbol: string;
  readonly onSelect: (s: string) => void;
  readonly livePrices: Record<string, LivePrice | undefined>;
}) {
  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>Watchlist</PanelHead>
      <div className="flex-1 overflow-auto">
        {MARKETS.map((m) => {
          const live = livePrices[m.symbol];
          const displayMark = live?.mark ?? m.seedPrice;
          const chg = live?.change24hPct;
          const chgTone =
            chg === undefined ? 'text-fg-muted'
              : chg >= 0 ? 'text-pnl-long' : 'text-pnl-short';
          const active = m.symbol === symbol;
          return (
            <button
              key={m.symbol}
              type="button"
              onClick={() => onSelect(m.symbol)}
              className={`flex w-full items-baseline justify-between border-b border-border-subtle px-3 py-2 text-left font-mono text-[12px] transition-colors ${
                active ? 'bg-accent/10' : 'hover:bg-bg-elevated'
              }`}
            >
              <span className={active ? 'font-semibold text-accent' : 'text-fg-primary'}>
                {m.label}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-fg-secondary">${formatPrice(displayMark)}</span>
                <span className={chgTone}>
                  {chg === undefined
                    ? '—'
                    : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`}
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
// Chart — real candles via lightweight-charts v5
// =============================================================================

function PanelChart({
  symbol,
  interval,
  onInterval,
  mark,
}: {
  readonly symbol: string;
  readonly interval: CandleInterval;
  readonly onInterval: (i: CandleInterval) => void;
  readonly mark: number;
}) {
  const { state } = useCandles(symbol, interval);
  const candles = state.candles;

  const last = candles.length > 0 ? candles[candles.length - 1]! : null;
  const o = last ? Number(last.o) : mark * 0.99;
  const h = last ? Number(last.h) : mark * 1.01;
  const l = last ? Number(last.l) : mark * 0.99;
  const c = last ? Number(last.c) : mark;

  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>
        <div className="flex items-center justify-between">
          <span>Chart · {symbol}</span>
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                type="button"
                onClick={() => onInterval(tf.value)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  interval === tf.value
                    ? 'bg-accent/15 text-accent'
                    : 'text-fg-muted hover:text-fg-primary'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </PanelHead>
      <div className="flex-1 overflow-hidden">
        {state.status === 'error' && candles.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-fg-muted">
            Couldn&rsquo;t load candles. Bulk&rsquo;s API may be slow — retrying.
          </div>
        ) : (
          <CandleChart key={`${symbol}-${interval}`} candles={candles} height={420} />
        )}
      </div>
      <div className="border-t border-border-subtle px-4 py-1.5 font-mono text-[11px] text-fg-muted">
        O ${formatPrice(o)} · H ${formatPrice(h)} · L ${formatPrice(l)} · C ${formatPrice(c)}
      </div>
    </section>
  );
}

// =============================================================================
// Order book — real L2 from /l2Book
// =============================================================================

function PanelOrderbook({ symbol, mark }: { readonly symbol: string; readonly mark: number }) {
  const { state } = useL2Book(symbol, { depth: 15 });
  const ladder = useMemo(() => buildLadder(state.book), [state.book]);
  const errorMsg = state.status === 'error' ? state.error : null;

  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>
        <div className="flex items-center justify-between">
          <span>Order book</span>
          {errorMsg && <span className="text-pnl-short">stale</span>}
        </div>
      </PanelHead>
      <div className="grid grid-cols-3 border-b border-border-subtle px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Sum</span>
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          {ladder.asks.length === 0 ? (
            <BookSkeleton side="ask" />
          ) : (
            ladder.asks.map((r, i) => (
              <BookRow key={`a${i}`} row={r} side="ask" maxSum={ladder.maxSum} />
            ))
          )}
        </div>
        <div className="border-y border-border-subtle px-3 py-1.5 text-center font-mono text-[13px] text-accent">
          ${formatPrice(mark)}
        </div>
        <div className="flex-1 overflow-auto">
          {ladder.bids.length === 0 ? (
            <BookSkeleton side="bid" />
          ) : (
            ladder.bids.map((r, i) => (
              <BookRow key={`b${i}`} row={r} side="bid" maxSum={ladder.maxSum} />
            ))
          )}
        </div>
      </div>
      {errorMsg && (
        <div className="border-t border-pnl-short/30 bg-pnl-short/5 px-3 py-1.5 font-mono text-[10px] leading-relaxed text-pnl-short/90">
          {errorMsg}
        </div>
      )}
    </section>
  );
}

interface LadderRow {
  readonly px: number;
  readonly sz: number;
  readonly sum: number;
}

function buildLadder(book: L2Book | null): {
  readonly asks: readonly LadderRow[];
  readonly bids: readonly LadderRow[];
  readonly maxSum: number;
} {
  if (!book) return { asks: [], bids: [], maxSum: 0 };

  const asks: LadderRow[] = [];
  let askSum = 0;
  for (const [pxStr, szStr] of book.asks) {
    const px = Number(pxStr);
    const sz = Number(szStr);
    if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
    askSum += sz;
    asks.push({ px, sz, sum: askSum });
  }
  // Asks render best-ask at the bottom (closest to spread)
  asks.reverse();

  const bids: LadderRow[] = [];
  let bidSum = 0;
  for (const [pxStr, szStr] of book.bids) {
    const px = Number(pxStr);
    const sz = Number(szStr);
    if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
    bidSum += sz;
    bids.push({ px, sz, sum: bidSum });
  }

  return { asks, bids, maxSum: Math.max(askSum, bidSum, 1) };
}

function BookSkeleton({ side }: { readonly side: 'ask' | 'bid' }) {
  const tone = side === 'ask' ? 'text-pnl-short/40' : 'text-pnl-long/40';
  return (
    <div className="flex flex-col gap-px px-3 py-1 font-mono text-[11px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="grid grid-cols-3 py-0.5">
          <span className={tone}>—</span>
          <span className="text-right text-fg-muted/40">—</span>
          <span className="text-right text-fg-muted/40">—</span>
        </div>
      ))}
    </div>
  );
}

function BookRow({
  row,
  side,
  maxSum,
}: {
  readonly row: LadderRow;
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
// Tape — recent trades from WS
// =============================================================================

function PanelTape({ symbol }: { readonly symbol: string }) {
  const trades = useRecentTrades(symbol, { limit: 40 });
  const now = Date.now();

  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>Tape · {baseLabelFor(symbol)}</PanelHead>
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border-subtle px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      <div className="flex-1 overflow-auto">
        {trades.length === 0 ? (
          <div className="px-3 py-4 text-center font-mono text-[11px] text-fg-muted">
            Waiting for trades…
          </div>
        ) : (
          trades.map((p) => (
            <div
              key={`${p.time}-${p.px}-${p.sz}`}
              className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-0.5 font-mono text-[11px]"
            >
              <span className={p.side === 'buy' ? 'text-pnl-long' : 'text-pnl-short'}>
                ${formatPrice(p.px)}
                {p.isLiquidation && <span className="ml-1 text-alert-orange">·LIQ</span>}
              </span>
              <span className="text-right text-fg-secondary">{p.sz.toFixed(3)}</span>
              <span className="text-right text-fg-muted">{timeAgo(now, p.time)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function timeAgo(now: number, then: number): string {
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

// =============================================================================
// Positions — real positions, real Close button
// =============================================================================

function PanelPositions({
  positions,
  openOrders,
  livePrices,
  accountStatus,
  connected,
  onResult,
}: {
  readonly positions: readonly BulkPosition[];
  readonly openOrders: readonly BulkOpenOrder[];
  readonly livePrices: Record<string, LivePrice | undefined>;
  readonly accountStatus: ReturnType<typeof useBulkAccount>['state']['status'];
  readonly connected: boolean;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>
        Positions · {positions.length} · Orders · {openOrders.length}
      </PanelHead>
      <div className="flex-1 overflow-auto p-3">
        {!connected ? (
          <PositionsEmpty message="Connect a wallet to see positions." />
        ) : accountStatus === 'loading' && positions.length === 0 ? (
          <PositionsEmpty message="Loading positions…" />
        ) : positions.length === 0 && openOrders.length === 0 ? (
          <PositionsEmpty message="No positions or resting orders." />
        ) : (
          <div className="flex flex-col gap-2">
            {positions.map((p) => (
              <PositionRow
                key={`pos-${p.symbol}`}
                pos={p}
                live={livePrices[p.symbol]}
                onResult={onResult}
              />
            ))}
            {openOrders.map((o) => (
              <OpenOrderRow key={`ord-${o.orderId}`} order={o} onResult={onResult} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PositionsEmpty({ message }: { readonly message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-center font-mono text-[11px] text-fg-muted">
      {message}
    </div>
  );
}

function PositionRow({
  pos,
  live,
  onResult,
}: {
  readonly pos: BulkPosition;
  readonly live: LivePrice | undefined;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const { submit, state } = useBulkOrder();
  const isLong = pos.sizeBase > 0;
  const absSize = Math.abs(pos.sizeBase);
  const mark = live?.mark ?? pos.fairPrice;
  const pnl =
    pos.unrealizedPnlUsd ?? (mark - pos.entryPrice) * pos.sizeBase;
  const tone = pnl >= 0 ? 'text-pnl-long' : 'text-pnl-short';

  async function close() {
    if (state.status === 'submitting') return;
    const r = await submit({
      symbol: pos.symbol,
      side: isLong ? 'short' : 'long',
      orderType: 'market',
      size: absSize,
      reduceOnly: true,
    });
    onResult(r);
  }

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-klub border border-border-subtle bg-bg-surface p-3">
      <div className="font-mono text-[12px]">
        <div className="flex items-baseline gap-2">
          <span className={isLong ? 'text-pnl-long' : 'text-pnl-short'}>
            {isLong ? 'LONG' : 'SHORT'}
          </span>
          <span className="text-fg-primary">{pos.symbol}</span>
          <span className="text-fg-muted">{absSize.toFixed(4)}</span>
        </div>
        <div className="mt-1 text-fg-muted">
          Entry ${formatPrice(pos.entryPrice)} · Mark ${formatPrice(mark)}
        </div>
      </div>
      <div className="text-right">
        <div className={`font-mono text-[14px] ${tone}`}>
          {pnl >= 0 ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
        </div>
        <button
          type="button"
          onClick={close}
          disabled={state.status === 'submitting'}
          className="btn-ghost btn-sm mt-1 text-[11px] disabled:opacity-50"
        >
          {state.status === 'submitting' ? 'Closing…' : 'Close'}
        </button>
      </div>
    </div>
  );
}

function OpenOrderRow({
  order,
  onResult,
}: {
  readonly order: BulkOpenOrder;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const { cancel, state } = useBulkCancel();

  async function doCancel() {
    if (state.status === 'submitting') return;
    const r = await cancel({ symbol: order.symbol, orderId: order.orderId });
    onResult(r);
  }

  const sideTone = order.isBuy ? 'text-pnl-long' : 'text-pnl-short';
  const sideLabel = order.isBuy ? 'BUY' : 'SELL';

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-klub border border-border-subtle bg-bg-surface/60 p-3">
      <div className="font-mono text-[12px]">
        <div className="flex items-baseline gap-2">
          <span className={sideTone}>{sideLabel}</span>
          <span className="text-fg-primary">{order.symbol}</span>
          <span className="text-fg-muted">{Math.abs(order.sizeBase).toFixed(4)}</span>
          <span className="text-fg-muted">@ ${formatPrice(order.price)}</span>
        </div>
        {order.tif && <div className="mt-1 text-fg-muted">{order.tif}</div>}
      </div>
      <button
        type="button"
        onClick={doCancel}
        disabled={state.status === 'submitting'}
        className="btn-ghost btn-sm text-[11px] disabled:opacity-50"
      >
        {state.status === 'submitting' ? 'Cancelling…' : 'Cancel'}
      </button>
    </div>
  );
}

// =============================================================================
// Order form — real submit via useBulkOrder
// =============================================================================

function PanelOrderForm({
  symbol,
  mark,
  connected,
  onResult,
}: {
  readonly symbol: string;
  readonly mark: number;
  readonly connected: boolean;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [tif, setTif] = useState<'GTC' | 'IOC' | 'ALO'>('GTC');
  const [price, setPrice] = useState(mark);
  const [size, setSize] = useState(0.05);
  const [lev, setLev] = useState(5);
  const [reduceOnly, setReduceOnly] = useState(false);
  // TP/SL price targets. Optional — when 0/undefined the order ships
  // without bracket legs. UI shows them as preview today; auto-
  // execution as reduce-only follow-up orders is wired separately
  // (the user can also Close manually from the Positions panel).
  const [tpPrice, setTpPrice] = useState(0);
  const [slPrice, setSlPrice] = useState(0);

  const { submit, state, usingAgent } = useBulkOrder();

  const maxLev = maxLeverageFor(symbol);

  // Reset price + clamp leverage when the symbol changes. Also reset
  // TP/SL since their numeric values are tied to the prior symbol's
  // price scale.
  useEffect(() => {
    setPrice(mark);
    setLev((cur) => Math.min(cur, maxLeverageFor(symbol)));
    setTpPrice(0);
    setSlPrice(0);
  }, [symbol, mark]);

  const refPx = type === 'limit' ? price : mark;
  const notional = size * refPx;
  const margin = lev > 0 ? notional / lev : 0;

  async function onSubmit() {
    if (!connected) {
      onResult({
        ok: false,
        reason: 'rejected_invalid',
        message: 'Connect a wallet first.',
      });
      return;
    }
    if (state.status === 'submitting') return;
    const req = {
      symbol,
      side,
      orderType: type,
      size,
      ...(type === 'limit' ? { price, timeInForce: tif } : {}),
      ...(reduceOnly ? { reduceOnly: true } : {}),
    };
    const r = await submit(req);
    onResult(r);

    // Bracket legs — fire native TP + SL conditionals after the main fills.
    // Failures don't unwind the main; user gets a separate result for
    // each leg via the same modal pipe.
    if (!r.ok) return;
    const closeSide: 'long' | 'short' = side === 'long' ? 'short' : 'long';
    if (tpPrice > 0 && Number.isFinite(tpPrice)) {
      const tp = await submit({
        symbol,
        side: closeSide,
        orderType: 'trigger',
        size,
        triggerPrice: tpPrice,
        tpSl: 'tp',
        reduceOnly: true,
      });
      if (!tp.ok) onResult(tp);
    }
    if (slPrice > 0 && Number.isFinite(slPrice)) {
      const sl = await submit({
        symbol,
        side: closeSide,
        orderType: 'trigger',
        size,
        triggerPrice: slPrice,
        tpSl: 'sl',
        reduceOnly: true,
      });
      if (!sl.ok) onResult(sl);
    }
  }

  const submitting = state.status === 'submitting';
  const buttonLabel = !connected
    ? 'Connect wallet'
    : submitting
      ? usingAgent
        ? 'Submitting…'
        : 'Sign in wallet…'
      : `${side === 'long' ? 'Buy' : 'Sell'} ${baseLabelFor(symbol)} · ${type}`;

  return (
    <section className="flex flex-col overflow-hidden bg-bg-base">
      <PanelHead>
        <div className="flex items-center justify-between">
          <span>Order · {symbol}</span>
          {usingAgent && <span className="text-accent">Agent · silent</span>}
        </div>
      </PanelHead>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        <div className="grid grid-cols-2 overflow-hidden rounded-klub border border-border">
          <button
            onClick={() => setSide('long')}
            className={`py-2 text-[12px] font-medium transition-colors ${
              side === 'long' ? 'bg-pnl-long/15 text-pnl-long' : 'text-fg-secondary hover:text-fg-primary'
            }`}
          >
            Long
          </button>
          <button
            onClick={() => setSide('short')}
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
              onClick={() => setType(t)}
              className={`${i === 1 ? 'border-l border-border' : ''} py-1.5 text-[11px] font-medium transition-colors ${
                type === t ? 'bg-accent/15 text-accent' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {type === 'limit' && (
          <ProField label="Price" value={price} onChange={setPrice} suffix="USD" decimals={2} />
        )}
        <ProField
          label="Size"
          value={size}
          onChange={setSize}
          suffix={baseLabelFor(symbol)}
          step={0.001}
          decimals={4}
        />

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
              Leverage · max {maxLev}×
            </span>
            <span className="font-mono text-[14px] text-accent">{lev}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={maxLev}
            step={0.5}
            value={lev}
            onChange={(e) => setLev(Number(e.target.value))}
            className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
          />
        </div>

        {type === 'limit' && (
          <div className="grid grid-cols-3 overflow-hidden rounded-klub border border-border-subtle">
            {(['GTC', 'IOC', 'ALO'] as const).map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => setTif(t)}
                className={`${i > 0 ? 'border-l border-border-subtle' : ''} py-1 text-[10px] font-medium transition-colors ${
                  tif === t ? 'bg-bg-elevated text-fg-primary' : 'text-fg-muted hover:text-fg-primary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Optional bracket — TP / SL prices. Display only for now;
            auto-execution as reduce-only follow-up orders is a
            separate slice. The user can Close manually from the
            Positions panel until then. */}
        <div className="grid grid-cols-2 gap-2">
          <ProField
            label="Take profit"
            value={tpPrice}
            onChange={setTpPrice}
            suffix="USD"
            decimals={2}
          />
          <ProField
            label="Stop loss"
            value={slPrice}
            onChange={setSlPrice}
            suffix="USD"
            decimals={2}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-fg-secondary">
          <input
            type="checkbox"
            checked={reduceOnly}
            onChange={(e) => setReduceOnly(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-accent"
          />
          Reduce only
        </label>

        {/* Notional / margin readout — promoted above the submit so
            the user sees the live numbers WHILE adjusting size and
            leverage. Notional is what the position controls; margin
            is what the user actually puts up; these update on every
            input change. */}
        <div className="rounded-klub border border-accent/30 bg-accent/5 p-3">
          <div className="flex items-baseline justify-between font-mono text-[12px]">
            <span className="text-fg-muted">Notional</span>
            <span className="text-[14px] font-semibold text-fg-primary">
              ${notional.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between font-mono text-[12px]">
            <span className="text-fg-muted">Margin</span>
            <span className="text-[14px] font-semibold text-accent">
              ${margin.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between font-mono text-[11px] text-fg-muted">
            <span>Mark</span>
            <span>${formatPrice(mark)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className={`btn-block py-2.5 text-[13px] font-medium disabled:opacity-50 ${
            side === 'long' ? 'btn-primary' : 'btn-danger'
          }`}
        >
          {buttonLabel}
        </button>

        {(tpPrice > 0 || slPrice > 0) && (
          <p className="text-[10px] leading-relaxed text-fg-muted">
            TP/SL fire as reduce-only legs after the main order fills.
            Stop-loss uses Bulk&rsquo;s trigger order; if Bulk rejects the
            shape, the toast shows the reason and you can close
            manually from the Positions panel.
          </p>
        )}
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
  // Mirrors the /trade NumField pattern: while focused, show the user's
  // raw text via `draft` state so toFixed() doesn't append zeros and
  // fight keystrokes. On blur, reformat to canonical form.
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const display = focused
    ? draft
    : decimals !== undefined
      ? value.toFixed(decimals)
      : String(value);

  return (
    <div>
      <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">{label}</span>
      <div className="relative mt-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={display}
          onFocus={(e) => {
            setFocused(true);
            setDraft(e.target.value);
            requestAnimationFrame(() => e.target.select());
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-full rounded-klub border border-border bg-bg-surface px-2.5 py-1.5 pr-12 font-mono text-[12px] text-fg-primary focus:border-accent focus:outline-none"
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
// Panel head
// =============================================================================

function PanelHead({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="border-b border-border-subtle bg-bg-base px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
      {children}
    </div>
  );
}

// =============================================================================
// Command palette
// =============================================================================

function CommandPalette({
  livePrices,
  onClose,
  onSymbol,
}: {
  readonly livePrices: Record<string, LivePrice | undefined>;
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
      ...MARKETS.map((m) => {
        const live = livePrices[m.symbol]?.mark ?? m.seedPrice;
        return {
          id: `sym-${m.symbol}`,
          label: `Go to ${m.symbol}`,
          hint: `$${formatPrice(live)}`,
          run: () => onSymbol(m.symbol),
        };
      }),
      { id: 'nav-quick', label: 'Open Trade', hint: '/trade', run: () => { window.location.href = '/trade'; } },
      { id: 'nav-home', label: 'Go to Portfolio', hint: '/portfolio', run: () => { window.location.href = '/portfolio'; } },
      { id: 'nav-follow', label: 'Browse leaders', hint: '/copy', run: () => { window.location.href = '/copy'; } },
      { id: 'nav-health', label: 'Account health', hint: '/health', run: () => { window.location.href = '/health'; } },
      { id: 'nav-ramp', label: 'Add funds', hint: '/funding/add', run: () => { window.location.href = '/funding/add'; } },
    ],
    [livePrices, onSymbol],
  );

  const filtered = q
    ? commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))
    : commands.slice(0, 12);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg-base/70 p-4 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-klub-lg border border-border bg-bg-surface shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={q}
          placeholder="Search markets, run commands…"
          onChange={(e) => setQ(e.target.value)}
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
                onClick={() => c.run()}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left font-mono text-[13px] transition-colors hover:bg-bg-elevated"
              >
                <span className="text-fg-primary">{c.label}</span>
                <span className="text-[11px] text-fg-muted">{c.hint}</span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2 font-mono text-[10px] text-fg-muted">
          <span>↵ run · esc close</span>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Result modal — order placement outcome
// =============================================================================

function ResultModal({
  result,
  onClose,
}: {
  readonly result: SubmitOrderResult;
  readonly onClose: () => void;
}) {
  const testnetUrl = process.env['NEXT_PUBLIC_BULK_TESTNET_APP_URL'] ?? 'https://early.bulk.trade';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-klub-lg border border-border bg-bg-surface p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {result.ok ? (
          <>
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-pnl-long">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pnl-long" />
              Order placed
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-fg-primary">
              You&rsquo;re in the trade.
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-secondary">
              Bulk accepted your order. Fill status will appear in Positions.
            </p>
            {result.orderId && (
              <div className="mt-5 rounded-klub border border-border-subtle bg-bg-base p-2.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">Order ID</div>
                <div className="mt-1 break-all font-mono text-[11px] text-fg-primary">{result.orderId}</div>
              </div>
            )}
            <div className="mt-6 flex gap-2">
              <a href={testnetUrl} target="_blank" rel="noreferrer noopener" className="btn-secondary btn-block">
                View on Bulk ↗
              </a>
              <button type="button" onClick={onClose} className="btn-primary btn-block">
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-pnl-short">
              <span className="h-1.5 w-1.5 rounded-full bg-pnl-short" />
              Not placed
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-fg-primary">
              {titleForReason(result.reason)}
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-secondary">
              {humanizeReason(result.reason, result.message)}
            </p>
            <div className="mt-4 rounded-klub border border-border-subtle bg-bg-base p-2.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">Details</div>
              <div className="mt-1 break-words font-mono text-[11px] text-fg-muted">{result.message}</div>
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={onClose} className="btn-primary btn-block">
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
    case 'rejected_risk_limit': return 'Too much risk for your account';
    case 'rejected_crossing': return 'Price moved too far';
    case 'user_rejected': return 'You cancelled the signature';
    case 'network_error': return 'Network error';
    case 'rejected_invalid':
    default: return 'Order was rejected';
  }
}

function humanizeReason(
  reason: Extract<SubmitOrderResult, { ok: false }>['reason'],
  raw: string,
): string {
  switch (reason) {
    case 'rejected_risk_limit': return 'This trade is larger than your account can back. Lower the amount or reduce leverage.';
    case 'rejected_crossing': return 'The market moved between preview and submit. Try again.';
    case 'user_rejected': return 'No order was submitted.';
    case 'network_error': return 'We could not reach the exchange. Check your connection.';
    case 'rejected_invalid':
    default: return raw || 'Bulk rejected this order. See details below.';
  }
}

// =============================================================================
// Format helpers
// =============================================================================

function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p === 0) return '0.00';
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}
