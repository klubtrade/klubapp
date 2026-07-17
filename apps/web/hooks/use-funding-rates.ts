'use client';

import { useMemo } from 'react';

import { useTickers, type LivePrice } from './use-tickers';

/**
 * useFundingRates — derived selector on top of `useTickers`.
 *
 * Bulk doesn't have a separate "funding" WebSocket stream; the funding
 * rate is a field on the frontendContext / ticker stream. This hook
 * exists so pages can consume funding data without caring that it's
 * derived.
 *
 *   const funding = useFundingRates(['BTC-USD', 'ETH-USD']);
 *   const btc = funding['BTC-USD']; // { hourlyPct, eightHourPct, annualPct, ... }
 *
 * Unit semantics (verified against Bulk `/stats`, Jul 2026):
 *   Bulk publishes the current funding rate as a fractional hourly rate.
 *   Example: 0.0001 means 0.01% per hour. Converting:
 *     - hourlyPct    = rawValue × 100
 *     - eightHourPct = rawValue × 8 × 100
 *     - annualPct    = rawValue × 24 × 365 × 100
 *
 * Back-compat note: we still expose `rate` and `annualizedPct` for
 * consumers that haven't been updated. `rate` is now the hourly
 * percent (what it always actually was in the data, just mislabeled
 * as a fraction before). `annualizedPct` now uses the correct
 * 24 × 365 factor.
 */

export interface LiveFunding {
  readonly symbol: string;
  /** Hourly funding rate as a percent (e.g., 0.00024 means 0.00024%/h). */
  readonly hourlyPct: number;
  /** 8-hour funding rate as a percent. */
  readonly eightHourPct: number;
  /** Annualized funding rate as a percent (hourly × 24 × 365). */
  readonly annualPct: number;
  /**
   * @deprecated Use `hourlyPct`. Kept for back-compat; identical value.
   * Previously documented as "per-interval fraction"; that doc was wrong.
   */
  readonly rate: number;
  /**
   * @deprecated Use `annualPct`. Kept for back-compat; identical value.
   * Previously computed with the wrong 3 × 365 × 100 factor.
   */
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
  const hourlyPct = p.fundingRate * 100;
  const eightHourPct = hourlyPct * 8;
  const annualPct = hourlyPct * 24 * 365;
  return {
    symbol: p.symbol,
    hourlyPct,
    eightHourPct,
    annualPct,
    rate: hourlyPct,
    annualizedPct: annualPct,
    updatedAt: p.updatedAt,
  };
}
