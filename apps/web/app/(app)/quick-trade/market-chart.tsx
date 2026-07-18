"use client";

import type { CandleInterval } from "@klub/api-client";
import dynamic from "next/dynamic";
import { useState } from "react";

import { useCandles } from "@/hooks/use-candles";
import type { LivePrice } from "@/hooks/use-tickers";
import { MARKETS } from "@/lib/markets";

import { MarketPicker } from "./components";

const QuickPriceChart = dynamic(() => import("./quick-price-chart"), {
  ssr: false,
});
const TIMEFRAMES: readonly CandleInterval[] = ["1m", "5m", "15m", "1h", "1d"];

export function QuickMarketChart({
  market,
  livePrice,
  livePrices,
  onMarket,
}: {
  readonly market: (typeof MARKETS)[number];
  readonly livePrice: number;
  readonly livePrices: Record<string, LivePrice | undefined>;
  readonly onMarket: (market: (typeof MARKETS)[number]) => void;
}) {
  const [interval, setInterval] = useState<CandleInterval>("15m");
  const { state } = useCandles(market.symbol, interval);

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <MarketPicker
          markets={MARKETS}
          selected={market}
          onSelect={onMarket}
          livePrices={livePrices}
        />
        <div className="flex rounded-klub border border-border-subtle bg-bg-surface p-1">
          {TIMEFRAMES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              className={`min-h-10 flex-1 rounded-md px-2 text-[11px] transition-colors sm:flex-none ${
                interval === value
                  ? "bg-bg-elevated text-fg-primary"
                  : "text-fg-muted hover:text-fg-primary"
              }`}
            >
              {value === "1d" ? "1D" : value}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <div>
            <div className="text-[11px] font-medium text-fg-secondary">
              Price chart
            </div>
            <div className="mt-0.5 text-[10px] text-fg-muted">
              {market.label} / USD · {interval}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[14px] font-semibold text-fg-primary">
              $
              {livePrice.toLocaleString(undefined, {
                maximumFractionDigits: livePrice < 10 ? 4 : 2,
              })}
            </div>
            <div className="text-[10px] text-fg-muted">
              {state.status === "error" ? "Feed retrying" : "Live Bulk data"}
            </div>
          </div>
        </div>
        {state.candles.length > 0 ? (
          <QuickPriceChart
            key={`${market.symbol}-${interval}`}
            candles={state.candles}
          />
        ) : (
          <div className="flex h-[320px] items-center justify-center rounded-klub-lg border border-border-subtle bg-bg-surface text-[12px] text-fg-muted">
            {state.status === "error"
              ? "Price feed is retrying…"
              : "Loading chart…"}
          </div>
        )}
      </div>
    </>
  );
}
