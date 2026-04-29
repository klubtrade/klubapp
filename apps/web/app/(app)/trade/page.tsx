'use client';

import { calculate, type Side } from '@klub/calc';
import type { CandleInterval, UserFill } from '@klub/api-client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

import {
  useBulkAccount,
  type BulkOpenOrder,
  type BulkPosition,
} from '@/hooks/use-bulk-account';
import { useBulkCancel } from '@/hooks/use-bulk-cancel';
import { useBulkOrder } from '@/hooks/use-bulk-order';
import { useCandles } from '@/hooks/use-candles';
import { useConnectionState } from '@/hooks/use-connection-state';
import { useTickers } from '@/hooks/use-tickers';
import { useToast } from '@/components/toast';
import { useUserFills } from '@/hooks/use-user-fills';
import { useActiveAccount } from '@/hooks/use-active-account';
import { useWalletGate } from '@/hooks/use-wallet-gate';
import type { SubmitOrderResult } from '@/lib/bulk/orders';
import { MARKETS, SEED_PRICES, type MarketSymbol } from '@/lib/markets';

// CandleChart wraps `lightweight-charts`, which uses canvas APIs and
// won't run on the server. Dynamic-import with `ssr: false` keeps the
// module out of Next's static-prerender pass — without this, build
// fails with `ReferenceError: window is not defined` during page
// generation.
const CandleChart = dynamic(() => import('@/components/candle-chart'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center text-[11px] text-fg-muted">
      Loading chart…
    </div>
  ),
});

/**
 * /trade — central trading screen.
 *
 * Layout philosophy (mobile-first):
 *
 *   Mobile (<lg):
 *     ┌─ Header (scrolls with page, NOT sticky)
 *     ├─ Order form
 *     ├─ Chart
 *     ├─ Tabs (Activity / Recent trades / Math)
 *     └─ Orderbook (compact, below tabs)
 *
 *   Desktop (lg+):
 *     ┌──────────┬───────────────────┬──────────────┐
 *     │ Order    │ Chart             │ Order form   │
 *     │ book     │ Tabs (Activity /  │ (math is in  │
 *     │ (full    │ trades / math)    │ tabs only —  │
 *     │ height)  │                   │ no duplicate)│
 *     └──────────┴───────────────────┴──────────────┘
 *
 * Key decisions:
 *   - Top padding (pt-16 md:pt-20) reserves space for the global
 *     chrome — the layout mounts NavDrawer top-left and WalletButton
 *     top-right at `fixed top-4` / `top-6`. Without this padding the
 *     fixed elements overlap our header (visible bug in screenshot:
 *     wallet pill on top of funding/OI/vol strip).
 *   - Header is NOT sticky. The whole page scrolls together.
 *   - Header right side is empty on desktop now — funding/OI/vol
 *     dropped because the wallet pill claims that space anyway.
 *     Connection-status pill kept but moved next to the symbol
 *     selector so it sits in the left-half safely.
 *   - The Math is ONLY in the tabs. No duplicate right-column panel.
 *   - Mobile order: Order form FIRST. Chart second. Tabs third.
 *     Orderbook last — reference, not action.
 *
 * Real plumbing wired through `useBulkOrder`, `useBulkCancel`,
 * `useBulkAccount`, `useUserFills` — same hooks /quick-trade uses.
 *
 * Source-of-truth for markets: `lib/markets.ts`.
 */

const SYMBOLS = MARKETS.map((m) => m.symbol) as readonly MarketSymbol[];
type Sym = MarketSymbol;
const INITIAL_PRICES = SEED_PRICES;

type BottomTab = 'activity' | 'trades' | 'math';

export default function TradePage() {
  const { connected, mounted, promptConnect } = useWalletGate();
  // The active account drives all queries + the `account` field on
  // signed transactions. Master by default; switches to a sub-account
  // ("pot") when the user picks one in the AccountSwitcher.
  const { pubkey: activePubkey } = useActiveAccount();
  const pubkey = activePubkey;

  const { state: accountState, refresh: refreshAccount } = useBulkAccount(pubkey);
  const { state: fillsState, refresh: refreshFills } = useUserFills(pubkey);

  const positions = accountState.data?.positions ?? [];
  const openOrders = accountState.data?.openOrders ?? [];
  const fills = fillsState.fills;

  const [symbol, setSymbol] = useState<Sym>('BTC-USD');
  const [resultModal, setResultModal] = useState<SubmitOrderResult | null>(null);
  const [activeTab, setActiveTab] = useState<BottomTab>('activity');

  const allSymbols = useMemo(() => [...SYMBOLS], []);
  const livePrices = useTickers(allSymbols);
  const mark = livePrices[symbol]?.mark ?? INITIAL_PRICES[symbol];

  // Order-form state lifted to the parent so the Math tab tracks
  // every keystroke in the form.
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

  const calcResult = useMemo(() => {
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

  const activityCount = positions.length + openOrders.length;
  const tradeCount = fills.filter((f) => f.symbol === symbol).length;

  function handleResult(r: SubmitOrderResult) {
    setResultModal(r);
    if (r.ok) {
      setTimeout(() => {
        refreshAccount();
        refreshFills();
      }, 800);
    }
  }

  return (
    <main className="min-h-screen pt-16 md:pt-20">
      <MarketHeader symbol={symbol} mark={mark} onSymbolChange={setSymbol} />
      <div className="mx-auto max-w-[1600px] px-4 pb-16 pt-4 md:px-6 md:pt-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)_380px]">
          {/* 1. ORDER FORM — first on mobile, third column on desktop */}
          <div className="order-1 lg:order-3 lg:col-start-3">
            <OrderFormPanel
              symbol={symbol}
              mounted={mounted}
              connected={connected}
              promptConnect={promptConnect}
              side={side}
              setSide={setSide}
              orderType={orderType}
              setOrderType={setOrderType}
              price={price}
              setPrice={setPrice}
              size={size}
              setSize={setSize}
              leverage={leverage}
              setLeverage={setLeverage}
              targetPrice={targetPrice}
              setTargetPrice={setTargetPrice}
              stopPrice={stopPrice}
              setStopPrice={setStopPrice}
              calcResult={calcResult}
              onResult={handleResult}
            />
          </div>

          {/* 2. CHART + tabs — second on mobile, second column on desktop */}
          <div className="order-2 lg:order-2 lg:col-start-2 flex flex-col gap-4">
            <ChartPanel mark={mark} symbol={symbol} />
            <BottomPanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              positions={positions}
              openOrders={openOrders}
              fills={fills}
              symbol={symbol}
              livePrices={livePrices}
              activityCount={activityCount}
              tradeCount={tradeCount}
              onResult={handleResult}
              onRefreshAccount={refreshAccount}
              calcResult={calcResult}
              orderType={orderType}
            />
          </div>

          {/* 3. ORDERBOOK — last on mobile, first column on desktop */}
          <div className="order-3 lg:order-1 lg:col-start-1 lg:flex lg:min-h-[820px] lg:flex-col">
            <Orderbook mark={mark} />
          </div>
        </div>
      </div>
      {resultModal && (
        <ResultModal
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
// Market header — NOT sticky
// =============================================================================

/**
 * The right side of the header USED to hold the funding/OI/vol context
 * strip, but the global WalletButton (mounted at `fixed top-6 right-6`)
 * sat ON TOP of it visually — see the screenshot bug. The strip is
 * dropped here; we keep the connection-status pill on the LEFT half
 * of the header instead, where the wallet pill can't reach.
 *
 * Funding/OI/Vol re-emerge later as part of a market-detail drawer
 * (a future surface) where they get proper space rather than fighting
 * with the wallet pill for screen real estate.
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
    <section className="border-b border-border-subtle bg-bg-base">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 md:gap-6 md:px-6 md:py-4">
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
          <div className="text-[10px] uppercase tracking-[0.06em] text-fg-muted md:text-[11px]">
            Mark
          </div>
          <div className="mt-0.5 font-mono text-[18px] tracking-[-0.01em] text-fg-primary md:mt-1 md:text-[22px]">
            ${formatPrice(mark)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.06em] text-fg-muted md:text-[11px]">
            24h
          </div>
          <div className={`mt-0.5 font-mono text-[14px] md:mt-1 md:text-[18px] ${pctTone}`}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
          </div>
        </div>
        <div className="ml-auto md:ml-2">
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
      <span className="flex items-center gap-2 text-[11px] text-alert-orange md:text-[12px]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-alert-orange" />
        Reconnecting
      </span>
    );
  }
  if (isLive) {
    return (
      <span className="flex items-center gap-2 text-[11px] text-pnl-long md:text-[12px]">
        <span className="live-dot" aria-hidden />
        Live
      </span>
    );
  }
  if (isDemo) {
    return (
      <span className="flex items-center gap-2 text-[11px] text-fg-muted md:text-[12px]" title="No WS URL — simulated ticks">
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
    <section className="flex flex-col overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface lg:h-full">
      <PanelHead>Order book</PanelHead>
      <div className="grid grid-cols-3 border-b border-border-subtle px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-fg-muted md:text-[11px]">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Sum</span>
      </div>
      <div className="flex flex-col justify-end overflow-y-auto lg:flex-1">
        {book.asks.map((row, i) => (
          <BookRow key={`a${i}`} row={row} side="ask" maxSum={book.maxSum} />
        ))}
      </div>
      <div className="border-y border-border-subtle px-3 py-2 text-center font-mono text-[15px] text-accent md:py-2.5 md:text-[17px]">
        ${formatPrice(mark)}
      </div>
      <div className="flex flex-col overflow-y-auto lg:flex-1">
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
    <div className="relative grid grid-cols-3 px-3 py-1 font-mono text-[10px] md:text-[11px]">
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
// Chart
// =============================================================================

/**
 * Chart panel — real candlestick chart via TradingView Lightweight
 * Charts.
 *
 * Timeframe state is local to this component so symbol switches
 * preserve the user's selected interval (most users have a "I always
 * trade on 15m" preference). Bulk's CandleInterval uses lowercase
 * `1d` (not `1D`); the UI label keeps the conventional `1D` casing.
 *
 * The chart key forces a fresh chart instance whenever symbol or
 * interval changes — this is intentional: lightweight-charts keeps
 * the user's pan/zoom on `setData()` calls, but we WANT a reset when
 * switching markets so the new asset's price range fits cleanly.
 */
const TIMEFRAMES: ReadonlyArray<{
  readonly label: string;
  readonly api: CandleInterval;
}> = [
  { label: '1m', api: '1m' },
  { label: '5m', api: '5m' },
  { label: '15m', api: '15m' },
  { label: '1h', api: '1h' },
  { label: '4h', api: '4h' },
  { label: '1D', api: '1d' },
];

function ChartPanel({ mark, symbol }: { readonly mark: number; readonly symbol: Sym }) {
  const [interval, setInterval] = useState<CandleInterval>('15m');
  const { state } = useCandles(symbol, interval);
  const candles = state.candles;
  const isLoading = state.status === 'loading' && candles.length === 0;
  const isError = state.status === 'error' && candles.length === 0;

  return (
    <div className="flex min-h-[260px] flex-col rounded-klub-lg border border-border-subtle bg-bg-surface p-4 md:min-h-[380px] md:p-5">
      <div className="flex items-center justify-between">
        <PanelHead>Chart · {symbol} · {currentLabel(interval)}</PanelHead>
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf, i) => {
            const active = tf.api === interval;
            return (
              <button
                key={tf.api}
                type="button"
                onClick={() => {
                  setInterval(tf.api);
                }}
                aria-pressed={active}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors md:px-2.5 md:text-[12px] ${
                  active
                    ? 'bg-accent/15 text-accent'
                    : 'text-fg-muted hover:bg-bg-elevated hover:text-fg-primary'
                } ${i < 2 || i > 3 ? 'hidden md:inline-flex' : ''}`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="relative mt-3 flex-1">
        {isLoading ? (
          <div className="flex h-[260px] items-center justify-center text-[12px] text-fg-muted md:h-[320px]">
            Loading {symbol} {currentLabel(interval)}…
          </div>
        ) : isError ? (
          <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-[12px] md:h-[320px]">
            <span className="text-pnl-short">Couldn&rsquo;t load candles</span>
            <span className="text-fg-muted">
              Bulk&rsquo;s API may be slow or your connection dropped. Retrying.
            </span>
          </div>
        ) : (
          <CandleChart
            // Force a fresh chart when symbol OR interval changes so the
            // new data fits cleanly without the previous market's zoom
            // being preserved.
            key={`${symbol}-${interval}`}
            candles={candles}
          />
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between text-[10px] text-fg-muted md:text-[11px]">
        <span>
          Mark <span className="font-mono text-fg-primary">${formatPrice(mark)}</span>
        </span>
        <span className="hidden md:inline">
          {candles.length > 0 ? `${candles.length} candles · TradingView` : 'TradingView'}
        </span>
      </div>
    </div>
  );
}

function currentLabel(interval: CandleInterval): string {
  return TIMEFRAMES.find((t) => t.api === interval)?.label ?? interval;
}

// =============================================================================
// Bottom panel — tabs (Activity / Trades / Math)
// =============================================================================

function BottomPanel({
  activeTab,
  onTabChange,
  positions,
  openOrders,
  fills,
  symbol,
  livePrices,
  activityCount,
  tradeCount,
  onResult,
  onRefreshAccount,
  calcResult,
  orderType,
}: {
  readonly activeTab: BottomTab;
  readonly onTabChange: (t: BottomTab) => void;
  readonly positions: readonly BulkPosition[];
  readonly openOrders: readonly BulkOpenOrder[];
  readonly fills: readonly UserFill[];
  readonly symbol: Sym;
  readonly livePrices: Record<string, { readonly mark: number } | undefined>;
  readonly activityCount: number;
  readonly tradeCount: number;
  readonly onResult: (r: SubmitOrderResult) => void;
  readonly onRefreshAccount: () => void;
  readonly calcResult: ReturnType<typeof calculate> | null;
  readonly orderType: 'market' | 'limit';
}) {
  return (
    <div className="overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface">
      {/* Tab strip — overflow-x-auto + flex-shrink-0 on tabs prevents
          edge clipping at narrow widths. The screenshot bug ("tivity"
          instead of "Activity") was the strip clipping the leading
          tab. */}
      <div className="flex overflow-x-auto border-b border-border-subtle">
        <TabButton
          active={activeTab === 'activity'}
          label="Activity"
          count={activityCount}
          onClick={() => {
            onTabChange('activity');
          }}
        />
        <TabButton
          active={activeTab === 'trades'}
          label="Recent trades"
          count={tradeCount}
          onClick={() => {
            onTabChange('trades');
          }}
        />
        <TabButton
          active={activeTab === 'math'}
          label="The Math"
          onClick={() => {
            onTabChange('math');
          }}
        />
      </div>
      {activeTab === 'activity' && (
        <ActivityTab
          positions={positions}
          openOrders={openOrders}
          livePrices={livePrices}
          onResult={onResult}
          onRefreshAccount={onRefreshAccount}
        />
      )}
      {activeTab === 'trades' && (
        <RecentTradesTab fills={fills} symbol={symbol} />
      )}
      {activeTab === 'math' && (
        <MathTab calcResult={calcResult} orderType={orderType} />
      )}
    </div>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly count?: number;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-3 text-[12px] font-medium transition-colors md:px-5 md:text-[13px] ${
        active
          ? 'text-fg-primary'
          : 'text-fg-muted hover:text-fg-secondary'
      }`}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span
          className={`rounded-full px-1.5 text-[10px] font-mono ${
            active
              ? 'bg-accent/20 text-accent'
              : 'bg-bg-elevated text-fg-muted'
          }`}
        >
          {count}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-accent"
        />
      )}
    </button>
  );
}

// =============================================================================
// Activity tab
// =============================================================================

function ActivityTab({
  positions,
  openOrders,
  livePrices,
  onResult,
  onRefreshAccount,
}: {
  readonly positions: readonly BulkPosition[];
  readonly openOrders: readonly BulkOpenOrder[];
  readonly livePrices: Record<string, { readonly mark: number } | undefined>;
  readonly onResult: (r: SubmitOrderResult) => void;
  readonly onRefreshAccount: () => void;
}) {
  if (positions.length === 0 && openOrders.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-[13px] text-fg-muted">
        No open positions or waiting orders.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      {positions.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-fg-muted md:text-[11px]">
              <th className="px-3 py-2 font-medium md:px-4 md:py-2.5">Position</th>
              <th className="px-3 py-2 font-medium md:px-4 md:py-2.5">Side</th>
              <th className="px-3 py-2 text-right font-medium md:px-4 md:py-2.5">Size</th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell md:px-4 md:py-2.5">Entry</th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell md:px-4 md:py-2.5">Mark</th>
              <th className="px-3 py-2 text-right font-medium md:px-4 md:py-2.5">PnL</th>
              <th className="px-3 py-2 text-right font-medium md:px-4 md:py-2.5" />
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <PositionRow
                key={p.symbol}
                position={p}
                livePrice={livePrices[p.symbol]?.mark ?? p.fairPrice}
                onResult={onResult}
                onAfterClose={onRefreshAccount}
              />
            ))}
          </tbody>
        </table>
      )}
      {openOrders.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-t border-border-subtle text-left text-[10px] uppercase tracking-[0.06em] text-fg-muted md:text-[11px]">
              <th className="px-3 py-2 font-medium md:px-4 md:py-2.5">Waiting</th>
              <th className="px-3 py-2 font-medium md:px-4 md:py-2.5">Side</th>
              <th className="px-3 py-2 text-right font-medium md:px-4 md:py-2.5">Size</th>
              <th className="px-3 py-2 text-right font-medium md:px-4 md:py-2.5">Price</th>
              <th className="px-3 py-2 text-right font-medium md:px-4 md:py-2.5" />
            </tr>
          </thead>
          <tbody>
            {openOrders.map((o) => (
              <OpenOrderRow
                key={o.orderId || `${o.symbol}-${o.price}-${o.sizeBase}`}
                order={o}
                onResult={onResult}
                onAfterCancel={onRefreshAccount}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PositionRow({
  position,
  livePrice,
  onResult,
  onAfterClose,
}: {
  readonly position: BulkPosition;
  readonly livePrice: number;
  readonly onResult: (r: SubmitOrderResult) => void;
  readonly onAfterClose: () => void;
}) {
  const { submit, state } = useBulkOrder();
  const [confirming, setConfirming] = useState(false);
  const closing = state.status === 'submitting';

  const isLong = position.sizeBase > 0;
  const absSize = Math.abs(position.sizeBase);
  const pnl =
    position.unrealizedPnlUsd ?? position.sizeBase * (livePrice - position.entryPrice);
  const pnlTone = pnl >= 0 ? 'text-pnl-long' : 'text-pnl-short';

  async function handleClose() {
    setConfirming(false);
    const r = await submit({
      symbol: position.symbol,
      side: isLong ? 'short' : 'long',
      orderType: 'market',
      size: absSize,
    });
    onResult(r);
    if (r.ok) {
      setTimeout(onAfterClose, 800);
    }
  }

  return (
    <tr className="border-t border-border-subtle">
      <td className="px-3 py-2.5 font-mono text-fg-primary md:px-4 md:py-3">{position.symbol}</td>
      <td className={`px-3 py-2.5 font-mono md:px-4 md:py-3 ${isLong ? 'text-pnl-long' : 'text-pnl-short'}`}>
        {isLong ? 'Long' : 'Short'}
      </td>
      <td className="px-3 py-2.5 text-right font-mono md:px-4 md:py-3">{absSize.toFixed(4)}</td>
      <td className="hidden px-3 py-2.5 text-right font-mono md:table-cell md:px-4 md:py-3">
        ${formatPrice(position.entryPrice)}
      </td>
      <td className="hidden px-3 py-2.5 text-right font-mono md:table-cell md:px-4 md:py-3">
        ${formatPrice(livePrice)}
      </td>
      <td className={`px-3 py-2.5 text-right font-mono md:px-4 md:py-3 ${pnlTone}`}>
        {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
      </td>
      <td className="px-3 py-2.5 text-right md:px-4 md:py-3">
        {confirming ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
              }}
              className="rounded-klub border border-border-subtle px-2 py-1 text-[11px] text-fg-secondary hover:border-border"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={closing}
              className="rounded-klub bg-pnl-short/20 px-2.5 py-1 text-[11px] font-medium text-pnl-short transition-colors hover:bg-pnl-short/30 disabled:opacity-60"
            >
              {closing ? 'Closing…' : 'Yes, close'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
            }}
            disabled={closing}
            className="rounded-klub border border-border-subtle px-2.5 py-1 text-[11px] font-medium text-fg-secondary transition-colors hover:border-border hover:text-fg-primary disabled:opacity-60"
          >
            Close
          </button>
        )}
      </td>
    </tr>
  );
}

function OpenOrderRow({
  order,
  onResult,
  onAfterCancel,
}: {
  readonly order: BulkOpenOrder;
  readonly onResult: (r: SubmitOrderResult) => void;
  readonly onAfterCancel: () => void;
}) {
  const { cancel, state } = useBulkCancel();
  const [confirming, setConfirming] = useState(false);
  const cancelling = state.status === 'submitting';

  async function handleCancel() {
    setConfirming(false);
    if (!order.orderId) {
      onResult({
        ok: false,
        reason: 'rejected_invalid',
        message: 'This order has no id — try refreshing.',
      });
      return;
    }
    const r = await cancel({
      symbol: order.symbol,
      orderId: order.orderId,
    });
    onResult(r);
    if (r.ok) {
      setTimeout(onAfterCancel, 800);
    }
  }

  return (
    <tr className="border-t border-border-subtle">
      <td className="px-3 py-2.5 font-mono text-fg-primary md:px-4 md:py-3">{order.symbol}</td>
      <td className={`px-3 py-2.5 font-mono md:px-4 md:py-3 ${order.isBuy ? 'text-pnl-long' : 'text-pnl-short'}`}>
        {order.isBuy ? 'Buy' : 'Sell'}
      </td>
      <td className="px-3 py-2.5 text-right font-mono md:px-4 md:py-3">{order.sizeBase.toFixed(4)}</td>
      <td className="px-3 py-2.5 text-right font-mono md:px-4 md:py-3">${formatPrice(order.price)}</td>
      <td className="px-3 py-2.5 text-right md:px-4 md:py-3">
        {confirming ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
              }}
              className="rounded-klub border border-border-subtle px-2 py-1 text-[11px] text-fg-secondary hover:border-border"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded-klub bg-pnl-short/20 px-2.5 py-1 text-[11px] font-medium text-pnl-short transition-colors hover:bg-pnl-short/30 disabled:opacity-60"
            >
              {cancelling ? 'Cancelling…' : 'Yes, cancel'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
            }}
            disabled={cancelling}
            className="rounded-klub border border-border-subtle px-2.5 py-1 text-[11px] font-medium text-fg-secondary transition-colors hover:border-border hover:text-fg-primary disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </td>
    </tr>
  );
}

// =============================================================================
// Recent trades tab
// =============================================================================

function RecentTradesTab({
  fills,
  symbol,
}: {
  readonly fills: readonly UserFill[];
  readonly symbol: Sym;
}) {
  const symbolFills = useMemo(
    () => fills.filter((f) => f.symbol === symbol).slice(0, 20),
    [fills, symbol],
  );

  if (symbolFills.length === 0) {
    return (
      <div className="px-5 py-8 text-center text-[13px] text-fg-muted">
        No filled trades on {symbol} yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-fg-muted md:text-[11px]">
            <th className="px-3 py-2 font-medium md:px-4 md:py-2.5">Time</th>
            <th className="px-3 py-2 font-medium md:px-4 md:py-2.5">Side</th>
            <th className="px-3 py-2 text-right font-medium md:px-4 md:py-2.5">Size</th>
            <th className="px-3 py-2 text-right font-medium md:px-4 md:py-2.5">Price</th>
            <th className="hidden px-3 py-2 text-right font-medium md:table-cell md:px-4 md:py-2.5">Fee</th>
            <th className="hidden px-3 py-2 text-right font-medium md:table-cell md:px-4 md:py-2.5">Reason</th>
          </tr>
        </thead>
        <tbody>
          {symbolFills.map((f) => {
            const fee = f.fee ?? f.takerFee ?? f.makerFee ?? 0;
            return (
              <tr
                key={`${f.timestamp}-${f.slot}-${f.price}`}
                className="border-t border-border-subtle"
              >
                <td className="px-3 py-2.5 font-mono text-fg-muted md:px-4 md:py-3">
                  {formatRelativeTime(f.timestamp)}
                </td>
                <td className={`px-3 py-2.5 font-mono md:px-4 md:py-3 ${f.isBuy ? 'text-pnl-long' : 'text-pnl-short'}`}>
                  {f.isBuy ? 'Buy' : 'Sell'}
                </td>
                <td className="px-3 py-2.5 text-right font-mono md:px-4 md:py-3">{f.amount.toFixed(4)}</td>
                <td className="px-3 py-2.5 text-right font-mono md:px-4 md:py-3">${formatPrice(f.price)}</td>
                <td className="hidden px-3 py-2.5 text-right font-mono text-fg-muted md:table-cell md:px-4 md:py-3">
                  ${fee.toFixed(2)}
                </td>
                <td className={`hidden px-3 py-2.5 text-right font-mono text-[11px] md:table-cell md:px-4 md:py-3 ${
                  f.reason === 'liquidation' || f.reason === 'adl'
                    ? 'text-pnl-short'
                    : 'text-fg-muted'
                }`}>
                  {f.reason}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatRelativeTime(ts: number): string {
  const deltaMs = Date.now() - ts;
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// =============================================================================
// Math tab — clean label/value rows (was a 3-col grid that overflowed)
// =============================================================================

/**
 * The previous version used a 3-column dl grid that overflowed at the
 * panel's actual width — labels like "PNL AT TARGET" wrapped onto two
 * lines and values bled into other columns (visible bug in screenshot).
 *
 * Replaced with a clean row-per-stat list:
 *   - Each row: label on the left, value on the right
 *   - Single column on mobile, two columns on desktop
 *   - Labels are normal-cased ("Liq price", not "LIQ PRICE") so they
 *     don't shout. Values are mono-font for tabular alignment.
 *   - The "stop beyond liq" warning sits on its own below the rows
 *     with proper visual weight.
 */
function MathTab({
  calcResult,
  orderType,
}: {
  readonly calcResult: ReturnType<typeof calculate> | null;
  readonly orderType: 'market' | 'limit';
}) {
  if (!calcResult) {
    return (
      <div className="px-5 py-8 text-center text-[13px] text-fg-muted">
        Enter a size in the order form to see the math.
      </div>
    );
  }

  const rows: Array<{
    label: string;
    value: string;
    tone?: 'long' | 'short' | 'accent';
  }> = [
    {
      label: 'Liq price',
      value: `$${formatPrice(calcResult.liquidationPrice)}`,
      tone: 'accent',
    },
    {
      label: 'Liq buffer',
      value: `${(calcResult.liqBufferFrac * 100).toFixed(1)}%`,
    },
    {
      label: 'Margin required',
      value: `$${calcResult.requiredMargin.toFixed(2)}`,
    },
    {
      label: 'Notional',
      value: `$${calcResult.notional.toFixed(2)}`,
    },
  ];
  if (calcResult.pnlAtTarget !== undefined) {
    rows.push({
      label: 'PnL at target',
      value: `${calcResult.pnlAtTarget >= 0 ? '+' : ''}$${calcResult.pnlAtTarget.toFixed(2)}`,
      tone: 'long',
    });
  }
  if (calcResult.lossAtStop !== undefined) {
    rows.push({
      label: 'Loss at stop',
      value: `${calcResult.lossAtStop >= 0 ? '+' : ''}$${calcResult.lossAtStop.toFixed(2)}`,
      tone: 'short',
    });
  }
  if (calcResult.rewardToRisk !== undefined) {
    rows.push({
      label: 'Reward / Risk',
      value: `${calcResult.rewardToRisk.toFixed(2)} : 1`,
    });
  }
  rows.push({
    label: 'Funding 24h',
    value: `${calcResult.fundingCostPer24h > 0 ? '−' : '+'}$${Math.abs(calcResult.fundingCostPer24h).toFixed(2)}`,
  });
  rows.push({
    label: 'Order type',
    value: orderType === 'market' ? 'Market' : 'Limit',
  });

  return (
    <div className="px-4 py-4 md:px-5 md:py-5">
      <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 border-b border-border-subtle/60 py-1.5 text-[13px] last:border-0"
          >
            <span className="text-fg-muted">{r.label}</span>
            <span
              className={`font-mono ${
                r.tone === 'long'
                  ? 'text-pnl-long'
                  : r.tone === 'short'
                    ? 'text-pnl-short'
                    : r.tone === 'accent'
                      ? 'text-accent'
                      : 'text-fg-primary'
              }`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
      {calcResult.stopIsSafe === false && (
        <div className="mt-4 rounded-klub border border-pnl-short/30 bg-pnl-short/10 p-3 text-[12px] font-medium text-pnl-short">
          ⚠ Stop beyond liquidation. Tighten stop or reduce leverage.
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Order form
// =============================================================================

function OrderFormPanel({
  symbol,
  mounted,
  connected,
  promptConnect,
  side,
  setSide,
  orderType,
  setOrderType,
  price,
  setPrice,
  size,
  setSize,
  leverage,
  setLeverage,
  targetPrice,
  setTargetPrice,
  stopPrice,
  setStopPrice,
  calcResult,
  onResult,
}: {
  readonly symbol: Sym;
  readonly mounted: boolean;
  readonly connected: boolean;
  readonly promptConnect: () => void;
  readonly side: Side;
  readonly setSide: (s: Side) => void;
  readonly orderType: 'market' | 'limit';
  readonly setOrderType: (t: 'market' | 'limit') => void;
  readonly price: number | '';
  readonly setPrice: (p: number | '') => void;
  readonly size: number | '';
  readonly setSize: (s: number | '') => void;
  readonly leverage: number;
  readonly setLeverage: (l: number) => void;
  readonly targetPrice: number | '';
  readonly setTargetPrice: (p: number | '') => void;
  readonly stopPrice: number | '';
  readonly setStopPrice: (p: number | '') => void;
  readonly calcResult: ReturnType<typeof calculate> | null;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const toast = useToast();
  const { state: orderState, submit } = useBulkOrder();
  const submitting = orderState.status === 'submitting';

  async function handleSubmit() {
    if (!mounted) return;
    if (!connected) {
      promptConnect();
      return;
    }
    if (size === '' || size <= 0 || !Number.isFinite(size)) {
      toast.error('Enter a valid size');
      return;
    }
    if (orderType === 'limit' && (price === '' || price <= 0 || !Number.isFinite(price))) {
      toast.error('Enter a valid limit price');
      return;
    }
    const outcome = await submit({
      symbol,
      side,
      orderType,
      size,
      ...(orderType === 'limit' && typeof price === 'number' ? { price } : {}),
    });
    onResult(outcome);
  }

  const submitLabel = !mounted
    ? '…'
    : !connected
      ? 'Connect wallet to trade'
      : submitting
        ? 'Submitting…'
        : `${side === 'long' ? 'Buy / Long' : 'Sell / Short'} @ ${orderType}`;

  const liqBufferPct = calcResult ? (calcResult.liqBufferFrac * 100).toFixed(1) : null;
  const lossAtStop = calcResult?.lossAtStop;

  return (
    <section className="rounded-klub-lg border border-border-subtle bg-bg-surface">
      <PanelHead>Order</PanelHead>
      <div className="space-y-4 p-4 md:p-5">
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

        {calcResult && (
          <div className="flex items-baseline justify-between rounded-klub border border-border-subtle bg-bg-base/60 px-3 py-2 text-[11px]">
            <span className="text-fg-muted">
              Liq buffer{' '}
              <span className="font-mono text-accent">{liqBufferPct}%</span>
            </span>
            {typeof lossAtStop === 'number' && (
              <span className="text-fg-muted">
                Max loss{' '}
                <span className="font-mono text-pnl-short">−${Math.abs(lossAtStop).toFixed(0)}</span>
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !mounted}
          className={`w-full rounded-klub py-3 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            side === 'long'
              ? 'bg-pnl-long text-bg-base hover:opacity-90'
              : 'bg-pnl-short text-bg-base hover:opacity-90'
          }`}
        >
          {submitLabel}
        </button>
      </div>
    </section>
  );
}

function PanelHead({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="border-b border-border-subtle px-4 py-2.5 text-[11px] uppercase tracking-[0.06em] text-fg-muted md:px-5 md:py-3">
      {children}
    </div>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">{children}</span>
  );
}

/**
 * NumField — usable numeric input with select-on-focus + draft-while-
 * typing so trailing zeros from `.toFixed()` don't clobber keystrokes.
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
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>('');

  const formatted =
    value === ''
      ? ''
      : decimals !== undefined
        ? value.toFixed(decimals)
        : String(value);
  const display = focused ? draft : formatted;

  return (
    <div>
      <Label>
        {label}
        {optional && <span className="ml-1 text-fg-muted">·opt</span>}
      </Label>
      <div className="relative mt-1.5">
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          step={step}
          value={display}
          onFocus={(e) => {
            setDraft(formatted);
            setFocused(true);
            requestAnimationFrame(() => {
              e.target.select();
            });
          }}
          onBlur={() => {
            setFocused(false);
            setDraft('');
          }}
          onChange={(e) => {
            const s = e.target.value;
            setDraft(s);
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
// ResultModal
// =============================================================================

function ResultModal({
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
        className="w-full max-w-sm rounded-klub-lg border border-border bg-bg-surface p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => {
          e.stopPropagation();
        }}
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
              Your order was accepted by Bulk. Fill status will show up in your
              positions once it matches.
            </p>
            {result.orderId && (
              <div className="mt-5 rounded-klub border border-border-subtle bg-bg-base p-2.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
                  Order ID
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-fg-primary">
                  {result.orderId}
                </div>
              </div>
            )}
            <div className="mt-6 flex gap-2">
              <a
                href={testnetUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-secondary btn-block"
              >
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
              <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
                Details
              </div>
              <div className="mt-1 break-words font-mono text-[11px] text-fg-muted">
                {result.message}
              </div>
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
    case 'rejected_risk_limit':
      return 'Too much risk for your account';
    case 'rejected_crossing':
      return 'Price moved too far';
    case 'user_rejected':
      return 'You cancelled the signature';
    case 'network_error':
      return 'Network error';
    case 'rejected_invalid':
    default:
      return 'Order was rejected';
  }
}

function humanizeReason(
  reason: Extract<SubmitOrderResult, { ok: false }>['reason'],
  raw: string,
): string {
  switch (reason) {
    case 'rejected_risk_limit':
      return 'This trade is larger than your account can back. Lower the amount or reduce leverage.';
    case 'rejected_crossing':
      return 'The market moved between preview and submit. Try again.';
    case 'user_rejected':
      return 'No order was submitted.';
    case 'network_error':
      return 'We could not reach the exchange. Check your connection.';
    case 'rejected_invalid':
    default:
      return raw || 'Bulk rejected this order. See details below.';
  }
}
