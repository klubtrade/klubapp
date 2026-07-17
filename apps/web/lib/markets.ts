/**
 * Markets — single source of truth for the set of markets we trade on
 * Bulk Exchange.
 *
 * Why a shared module:
 *   - `/trade`, `/quick-trade`, and `/home` all used to hardcode the
 *     same 10-entry list. Adding a market meant three file edits and
 *     inevitable drift. Now: one list, three imports.
 *   - Leverage caps need to come from Bulk's `leverageSettings` when
 *     the user is connected; the static list provides a sensible
 *     default when disconnected.
 *   - Seed prices (used for the first frame before the WS ticker
 *     arrives) are co-located with the symbol so adding a market is
 *     a single edit rather than scattered across pages.
 *
 * Day 4.5+ TODO:
 *   - Fetch this list from Bulk's `/exchangeInfo` at app startup so
 *     new listings appear without a redeploy. The static list below
 *     becomes a fallback for network/offline scenarios.
 *   - Add tick-size + lot-size for each market so inputs can
 *     auto-snap to valid increments. Currently we stringify prices
 *     to dodge the serde "integer vs float" issue, but don't enforce
 *     tick compliance — Bulk will reject orders that violate ticks
 *     with a different error message and we should surface that.
 */

'use client';

import { useMemo } from 'react';

import { useBulkAccount } from '@/hooks/use-bulk-account';
import { useTradingWallet } from '@/lib/trading-wallet';

// -------------------------------------------------------------------------
// Canonical list
// -------------------------------------------------------------------------

/**
 * The full set of markets we render UIs for. Order matters — this is
 * also the order that appears in dropdowns and lists (BTC first for
 * priority, alts after).
 *
 * Verified against Bulk testnet's `leverageSettings` response
 * (Apr 20 2026). HYPE-USD is NOT listed on Bulk. If Bulk adds it,
 * append here.
 */
export const MARKETS = [
  { symbol: 'BTC-USD', label: 'BTC', seedPrice: 63_980, defaultLeverage: 40 },
  { symbol: 'ETH-USD', label: 'ETH', seedPrice: 1_840, defaultLeverage: 25 },
  { symbol: 'SOL-USD', label: 'SOL', seedPrice: 74.8, defaultLeverage: 10 },
  { symbol: 'BNB-USD', label: 'BNB', seedPrice: 568, defaultLeverage: 10 },
  { symbol: 'XRP-USD', label: 'XRP', seedPrice: 1.09, defaultLeverage: 10 },
  { symbol: 'DOGE-USD', label: 'DOGE', seedPrice: 0.0725, defaultLeverage: 10 },
  { symbol: 'SUI-USD', label: 'SUI', seedPrice: 0.737, defaultLeverage: 10 },
  { symbol: 'ZEC-USD', label: 'ZEC', seedPrice: 34.5, defaultLeverage: 10 },
  { symbol: 'FARTCOIN-USD', label: 'FART', seedPrice: 0.133, defaultLeverage: 10 },
  { symbol: 'MINIMAX-USD', label: 'MINIMAX', seedPrice: 0.02, defaultLeverage: 10 },
  { symbol: 'MU-USD', label: 'MU', seedPrice: 0.02, defaultLeverage: 10 },
] as const;

/**
 * Type of a single market entry. Keep narrow so consumers can't add
 * ad-hoc fields and drift from the canonical shape.
 */
export interface Market {
  readonly symbol: string;
  readonly label: string;
  readonly seedPrice: number;
  readonly defaultLeverage: number;
}

/**
 * Literal-typed union of every symbol we support. Useful for callers
 * that want compile-time exhaustiveness (e.g. `/trade`'s `Sym`).
 */
export type MarketSymbol = (typeof MARKETS)[number]['symbol'];

/** All symbols, in canonical order. */
export const SYMBOLS: readonly MarketSymbol[] = MARKETS.map((m) => m.symbol) as readonly MarketSymbol[];

/** Seed prices as a record keyed by symbol — ergonomic for lookups. */
export const SEED_PRICES: Record<MarketSymbol, number> = MARKETS.reduce(
  (acc, m) => {
    acc[m.symbol as MarketSymbol] = m.seedPrice;
    return acc;
  },
  {} as Record<MarketSymbol, number>,
);

/** Find a market by symbol. Returns undefined for unknown symbols. */
export function findMarket(symbol: string): Market | undefined {
  return MARKETS.find((m) => m.symbol === symbol);
}

// -------------------------------------------------------------------------
// Live-leverage overlay
// -------------------------------------------------------------------------

/**
 * <useMarkets /> — returns the canonical markets list with leverage
 * caps overridden by the user's current `leverageSettings` from Bulk
 * when connected.
 *
 * Why overlay rather than replace: when disconnected (or on first
 * paint before /account returns), the hardcoded defaults still let
 * the UI render meaningful leverage sliders. Once /account arrives,
 * any per-user overrides — including cases where Bulk has adjusted
 * a symbol's cap globally — flow through transparently.
 *
 * The hook doesn't fetch on its own; it subscribes to whatever the
 * page's existing `useBulkAccount` call provides. Safe to call
 * multiple times — React caches the hook result via useMemo below.
 */
export function useMarkets(): readonly Market[] {
  const wallet = useTradingWallet();
  const pubkey = wallet.publicKeyBase58;
  const { state } = useBulkAccount(pubkey);

  // Live leverage map: symbol → cap. Pulled from the raw /account
  // response; `leverageSettings` isn't on BulkAccountSnapshot yet so
  // we reach into `raw` directly. If Bulk's response shape changes
  // this falls through to the static defaults silently.
  const liveLeverages = useMemo(
    () => readLeverageSettings(state.data?.raw),
    [state.data?.raw],
  );

  return useMemo(
    () =>
      MARKETS.map((m) => ({
        ...m,
        defaultLeverage: liveLeverages[m.symbol] ?? m.defaultLeverage,
      })),
    [liveLeverages],
  );
}

/**
 * Extract `leverageSettings` from the /account response. Handles the
 * same unwrap hierarchy as useBulkAccount:
 *   [{fullAccount: {leverageSettings: [...]}}]
 */
function readLeverageSettings(raw: unknown): Record<string, number> {
  if (!raw) return {};
  let cursor: unknown = raw;
  if (Array.isArray(cursor) && cursor.length >= 1) cursor = cursor[0];
  if (cursor && typeof cursor === 'object' && 'fullAccount' in cursor) {
    cursor = (cursor as Record<string, unknown>)['fullAccount'];
  }
  if (!cursor || typeof cursor !== 'object') return {};
  const settings = (cursor as Record<string, unknown>)['leverageSettings'];
  if (!Array.isArray(settings)) return {};

  const out: Record<string, number> = {};
  for (const entry of settings) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const symbol = e['symbol'];
    const lev = e['leverage'];
    if (typeof symbol === 'string' && typeof lev === 'number' && Number.isFinite(lev)) {
      out[symbol] = lev;
    }
  }
  return out;
}
