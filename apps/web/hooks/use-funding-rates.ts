'use client';

import { useMemo } from 'react';

import { useTickers, type LivePrice } from './use-tickers';

/**
 * useFundingRates — derived selector on top of `useTickers`.
 *
 * Bulk doesn't have a separate "funding" WebSocket stream; the funding
 * rate is a field on the ticker. This hook exists so pages can consume
 * funding data without caring that it's derived.
 *
 *   const funding = useFundingRates(['BTC-USD', 'ETH-USD']);
 *   const btc = funding['BTC-USD']; // { rate, annualizedPct, updatedAt }
 *
 * `rate` is the per-interval funding rate as a fraction (e.g. 0.000118).
 * `annualizedPct` is rate × 3 × 365 × 100 (per-8h assumption matches Bulk
 * defaults; if Bulk publishes a non-8h interval in future this field
 * becomes approximate).
 */

export interface LiveFunding {
  readonly symbol: string;
  /** Per-interval funding rate as a fraction. */
  readonly rate: number;
  /** Annualized percentage (3 fundings per day × 365). */
  readonly annualizedPct: number;
  readonly updatedAt: number;
}

export function useFundingRates(
  symbols: readonly string[],
): Record<string, LiveFunding | undefined> {
  const prices = useTickers(symbols);

  return useMemo(() => {
    const out: Record<string, LiveFunding | undefined> = {};
    for (const [symbol, price] of Object.entries(prices)) {
      if (!price) continue;
      out[symbol] = toFunding(price);
    }
    return out;
  }, [prices]);
}

function toFunding(p: LivePrice): LiveFunding {
  return {
    symbol: p.symbol,
    rate: p.fundingRate,
    annualizedPct: p.fundingRate * 3 * 365 * 100,
    updatedAt: p.updatedAt,
  };
}
