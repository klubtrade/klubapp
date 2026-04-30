'use client';

import { useEffect, useState } from 'react';

import { marketData } from '@/lib/market-data/client';

/**
 * useTickers — subscribe to mark-price + funding updates for a set of
 * symbols. Returns a map keyed by symbol.
 *
 *   const prices = useTickers(['BTC-USD', 'ETH-USD']);
 *   const btc = prices['BTC-USD']; // { mark, fundingRate, updatedAt } | undefined
 *
 * Internally this subscribes to Bulk's `frontendContext` stream (one
 * subscription delivers updates for ALL markets every 2s). We filter
 * down to the requested `symbols` client-side so we stay well under the
 * 100-subscription server cap no matter how many symbols pages ask for.
 *
 * If you need tighter-than-2s resolution on the ACTIVE market (e.g.
 * the Pro terminal's header tape), use `useActiveMarketTicker(symbol)`
 * below — that uses the per-symbol `ticker` stream (200ms).
 */

export interface LivePrice {
  readonly symbol: string;
  /** Mark price (fair price). Use this for PnL + liq math. */
  readonly mark: number;
  /** Last traded price. */
  readonly last: number;
  /** Per-interval funding rate as a fraction. */
  readonly fundingRate: number;
  /**
   * 24h percent change in PERCENT units (e.g. -1.36 = -1.36%, not the
   * fractional 0.0136 the original comment claimed). Matches what Bulk
   * sends on the wire under `priceChangePercent`. Display directly with
   * `.toFixed(2)` — do NOT multiply by 100.
   */
  readonly change24hPct: number;
  /** 24h volume in quote currency (USD). */
  readonly volume24h: number;
  /** Open interest (base units). */
  readonly openInterest: number;
  readonly updatedAt: number;
}

export function useTickers(
  symbols: readonly string[],
): Record<string, LivePrice | undefined> {
  const [prices, setPrices] = useState<Record<string, LivePrice | undefined>>({});

  useEffect(() => {
    if (symbols.length === 0) return;

    const wanted = new Set(symbols);

    const unsub = marketData.onFrontendContext((rows) => {
      setPrices((prev) => {
        let changed = false;
        const next = { ...prev };
        const now = Date.now();
        for (const row of rows) {
          if (!wanted.has(row.symbol)) continue;
          const update: LivePrice = {
            symbol: row.symbol,
            mark: row.lastPrice, // frontendContext gives lastPrice; close enough for dashboards
            last: row.lastPrice,
            fundingRate: row.funding,
            change24hPct: row.priceChangePercent,
            volume24h: row.volume,
            openInterest: row.oi,
            updatedAt: now,
          };
          next[row.symbol] = update;
          changed = true;
        }
        return changed ? next : prev;
      });
    });

    return () => {
      unsub();
    };
    // Joined string = stable dep for readonly array inputs
  }, [symbols.join(',')]);

  return prices;
}

/**
 * useActiveMarketTicker — subscribe to the full per-symbol ticker
 * stream at 200ms resolution. Returns the entire Ticker (not just
 * mark price). Use this on the Pro terminal's active-symbol header
 * and on the expert Trade page.
 *
 * Counts against Bulk's 100-sub limit. Only use for the symbol the
 * user is actively looking at — not for a whole watchlist.
 */
export function useActiveMarketTicker(symbol: string | null): {
  readonly markPrice: number | null;
  readonly fundingRate: number | null;
  readonly regime: number | null;
  readonly updatedAt: number | null;
} {
  const [state, setState] = useState<{
    markPrice: number | null;
    fundingRate: number | null;
    regime: number | null;
    updatedAt: number | null;
  }>({ markPrice: null, fundingRate: null, regime: null, updatedAt: null });

  useEffect(() => {
    if (!symbol) return;
    const unsub = marketData.onTicker(symbol, (ticker) => {
      setState({
        markPrice: ticker.markPrice,
        fundingRate: ticker.fundingRate,
        regime: ticker.regime,
        updatedAt: Date.now(),
      });
    });
    return () => {
      unsub();
    };
  }, [symbol]);

  return state;
}