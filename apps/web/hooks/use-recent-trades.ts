'use client';

import { useEffect, useState } from 'react';
import type { TradeUpdate } from '@klub/api-client';

import { marketData } from '@/lib/market-data/client';

/**
 * useRecentTrades — subscribe to Bulk's public trades stream for one
 * symbol.
 *
 * Maintains a rolling buffer of the last N trades (most recent first)
 * so the UI can render a tape without unbounded memory growth.
 *
 * Each call subscribes a new listener to `marketData.onTrades`. The
 * marketData singleton handles subscribe/unsubscribe over the single
 * shared WebSocket, so multiple components observing the same symbol
 * share the underlying network subscription.
 *
 * Symbol changes reset the buffer — a tape of BTC trades becomes
 * meaningless the moment the user switches to ETH.
 */
export function useRecentTrades(
  symbol: string,
  opts: { readonly limit?: number } = {},
): readonly RecentTrade[] {
  const limit = opts.limit ?? 30;
  const [trades, setTrades] = useState<readonly RecentTrade[]>([]);

  useEffect(() => {
    // Reset on symbol change so we don't render stale-market trades
    // for a split second while the first WS batch arrives.
    setTrades([]);

    if (!marketData.hasConfiguredWs()) {
      return undefined;
    }

    const unsub = marketData.onTrades(symbol, (batch: readonly TradeUpdate[]) => {
      if (batch.length === 0) return;
      // Bulk sends batches; newest can be first or last depending on
      // the exchange's internal ordering. We sort by time descending
      // once per batch — cheaper than per-trade sorted insert.
      const normalized = batch.map(normalize);
      setTrades((prev) => {
        const merged = [...normalized, ...prev];
        merged.sort((a, b) => b.time - a.time);
        return merged.slice(0, limit);
      });
    });

    return () => {
      unsub();
    };
  }, [symbol, limit]);

  return trades;
}

/**
 * Public-facing shape for a single trade. Derived from the raw
 * TradeUpdate with `side` flipped into a string for easier UI use.
 */
export interface RecentTrade {
  readonly px: number;
  readonly sz: number;
  readonly time: number;
  readonly side: 'buy' | 'sell';
  readonly isLiquidation: boolean;
}

function normalize(t: TradeUpdate): RecentTrade {
  return {
    px: t.px,
    sz: t.sz,
    time: t.time,
    // `side: true` = taker bought = aggressive buyer = "buy" tape
    side: t.side ? 'buy' : 'sell',
    isLiquidation: t.liq === true || t.reason === 'liquidation' || t.reason === 'adl',
  };
}
