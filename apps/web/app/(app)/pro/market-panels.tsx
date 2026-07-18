import type { CandleInterval, L2Book } from "@klub/api-client";
import dynamic from "next/dynamic";
import { useMemo } from "react";

import { useCandles } from "@/hooks/use-candles";
import { useL2Book } from "@/hooks/use-l2-book";
import { useRecentTrades } from "@/hooks/use-recent-trades";
import type { LivePrice } from "@/hooks/use-tickers";
import { MARKETS } from "@/lib/markets";

import { MarketNewsTicker } from "./market-news";
import { baseLabelFor, formatPrice, PanelHead } from "./utils";

const CandleChart = dynamic(() => import("@/components/candle-chart"), {
  ssr: false,
});

const TIMEFRAMES: readonly {
  readonly label: string;
  readonly value: CandleInterval;
}[] = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1D", value: "1d" },
];

export function PanelWatchlist({
  symbol,
  onSelect,
  livePrices,
}: {
  readonly symbol: string;
  readonly onSelect: (s: string) => void;
  readonly livePrices: Record<string, LivePrice | undefined>;
}) {
  return (
    <section className="pro-panel flex flex-col overflow-hidden">
      <PanelHead>Watchlist</PanelHead>
      <div className="flex-1 overflow-y-auto">
        {MARKETS.map((m) => {
          const live = livePrices[m.symbol];
          const displayMark = live?.mark ?? null;
          const chg = live?.change24hPct;
          const chgTone =
            chg === undefined
              ? "text-fg-muted"
              : chg >= 0
                ? "text-pnl-long"
                : "text-pnl-short";
          const active = m.symbol === symbol;
          return (
            <button
              key={m.symbol}
              type="button"
              onClick={() => onSelect(m.symbol)}
              className={`flex w-full items-baseline justify-between border-b border-border-subtle px-3 py-2 text-left font-mono text-[12px] transition-colors ${
                active ? "bg-accent/10" : "hover:bg-bg-elevated"
              }`}
            >
              <span
                className={
                  active ? "font-semibold text-accent" : "text-fg-primary"
                }
              >
                {m.label}
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-fg-secondary">
                  {displayMark === null ? "—" : `$${formatPrice(displayMark)}`}
                </span>
                <span className={chgTone}>
                  {chg === undefined
                    ? "—"
                    : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}
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

export function PanelChart({
  symbol,
  interval,
  onInterval,
}: {
  readonly symbol: string;
  readonly interval: CandleInterval;
  readonly onInterval: (i: CandleInterval) => void;
}) {
  const { state } = useCandles(symbol, interval);
  const candles = state.candles;

  const last = candles.length > 0 ? candles[candles.length - 1]! : null;
  const o = last ? Number(last.o) : null;
  const h = last ? Number(last.h) : null;
  const l = last ? Number(last.l) : null;
  const c = last ? Number(last.c) : null;

  return (
    <section className="pro-panel flex flex-col overflow-hidden">
      <PanelHead>
        <div className="flex items-center justify-between">
          <span>Chart · {symbol}</span>
          <span className="ml-3 rounded-full border border-border-subtle px-2 py-0.5 text-[9px] text-fg-muted">
            {state.status === "ok"
              ? "Bulk candles"
              : state.status === "loading"
                ? "Loading"
                : "Retrying"}
          </span>
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.value}
                type="button"
                onClick={() => onInterval(tf.value)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  interval === tf.value
                    ? "bg-accent/15 text-accent"
                    : "text-fg-muted hover:text-fg-primary"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </PanelHead>
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {state.status === "error" && candles.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-fg-muted">
            Couldn&rsquo;t load candles. Bulk&rsquo;s API may be slow —
            retrying.
          </div>
        ) : (
          <CandleChart key={`${symbol}-${interval}`} candles={candles} fill />
        )}
      </div>
      <MarketNewsTicker />
      <div className="shrink-0 border-t border-border-subtle px-4 py-1.5 font-mono text-[11px] text-fg-muted">
        O {o === null ? "—" : `$${formatPrice(o)}`} · H{" "}
        {h === null ? "—" : `$${formatPrice(h)}`} · L{" "}
        {l === null ? "—" : `$${formatPrice(l)}`} · C{" "}
        {c === null ? "—" : `$${formatPrice(c)}`}
      </div>
    </section>
  );
}

// =============================================================================
// Order book — real L2 from /l2Book
// =============================================================================

export function PanelOrderbook({
  symbol,
  mark,
}: {
  readonly symbol: string;
  readonly mark: number;
}) {
  const { state } = useL2Book(symbol, { depth: 15 });
  const ladder = useMemo(() => buildLadder(state.book), [state.book]);
  const errorMsg = state.status === "error" ? state.error : null;

  return (
    <section className="pro-panel flex flex-col overflow-hidden">
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
              <BookRow
                key={`a${i}`}
                row={r}
                side="ask"
                maxSum={ladder.maxSum}
              />
            ))
          )}
        </div>
        <div className="border-y border-border-subtle px-3 py-1.5 text-center font-mono text-[13px] text-accent">
          {mark > 0 ? `$${formatPrice(mark)}` : "—"}
        </div>
        <div className="flex-1 overflow-auto">
          {ladder.bids.length === 0 ? (
            <BookSkeleton side="bid" />
          ) : (
            ladder.bids.map((r, i) => (
              <BookRow
                key={`b${i}`}
                row={r}
                side="bid"
                maxSum={ladder.maxSum}
              />
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

function BookSkeleton({ side }: { readonly side: "ask" | "bid" }) {
  const tone = side === "ask" ? "text-pnl-short/40" : "text-pnl-long/40";
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
  readonly side: "ask" | "bid";
  readonly maxSum: number;
}) {
  const widthPct = (row.sum / maxSum) * 100;
  const tone = side === "ask" ? "text-pnl-short" : "text-pnl-long";
  const bgTone = side === "ask" ? "bg-pnl-short/10" : "bg-pnl-long/10";
  return (
    <div className="relative grid grid-cols-3 px-3 py-0.5 font-mono text-[11px]">
      <div
        aria-hidden
        className={`absolute inset-y-0 right-0 ${bgTone}`}
        style={{ width: `${widthPct}%` }}
      />
      <span className={`relative ${tone}`}>${formatPrice(row.px)}</span>
      <span className="relative text-right text-fg-secondary">
        {row.sz.toFixed(3)}
      </span>
      <span className="relative text-right text-fg-muted">
        {row.sum.toFixed(2)}
      </span>
    </div>
  );
}

// =============================================================================
// Tape — recent trades from WS
// =============================================================================

export function PanelTape({ symbol }: { readonly symbol: string }) {
  const trades = useRecentTrades(symbol, { limit: 40 });
  const now = Date.now();

  return (
    <section className="pro-panel flex flex-col overflow-hidden">
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
              <span
                className={
                  p.side === "buy" ? "text-pnl-long" : "text-pnl-short"
                }
              >
                ${formatPrice(p.px)}
                {p.isLiquidation && (
                  <span className="ml-1 text-alert-orange">·LIQ</span>
                )}
              </span>
              <span className="text-right text-fg-secondary">
                {p.sz.toFixed(3)}
              </span>
              <span className="text-right text-fg-muted">
                {timeAgo(now, p.time)}
              </span>
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
