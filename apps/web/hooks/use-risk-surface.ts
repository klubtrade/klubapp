'use client';

import type { RiskStream } from '@klub/api-client';
import { useEffect, useState } from 'react';

import { marketData } from '@/lib/market-data/client';

/**
 * useRiskSurface - subscribe to Bulk's `risk:{symbol}` WebSocket
 * stream for a single market.
 *
 * Bulk publishes the risk surface event-driven (not at a fixed
 * interval) - it updates when the underlying regime or lambda grid
 * changes. A quiet market can go minutes without an update. Our
 * consumer must be robust to "haven't received anything yet" as a
 * valid steady state.
 *
 * Returns null until the first update arrives. Consumers should
 * fall back to `@klub/calc`'s existing `maintenanceMarginFrac`
 * placeholder while `surface === null`. This mirrors the pattern
 * used by `useRecentTrades` (empty array until first batch).
 *
 * Example:
 *
 *   const surface = useRiskSurface('BTC-USD');
 *   if (surface) {
 *     // drive portfolio margin math from surface.buy / surface.sell
 *   } else {
 *     // render a waiting state or fall back to naive margin
 *   }
 *
 * Benefits from the Week-1 fan-out fix: multiple components can
 * subscribe to the same symbol's risk surface and all receive
 * updates. The server sees one subscription regardless of how many
 * local consumers.
 */
export function useRiskSurface(symbol: string | null): RiskStream | null {
  const [surface, setSurface] = useState<RiskStream | null>(null);

  useEffect(() => {
    // Reset on symbol change. Otherwise BTC's stale surface would
    // briefly render while switching to ETH before the first ETH
    // frame arrives. Same flush-on-symbol-change rule as
    // useRecentTrades.
    setSurface(null);

    if (!symbol) return undefined;

    const unsub = marketData.onRisk(symbol, (next) => {
      setSurface(next);
    });

    return () => {
      unsub();
    };
  }, [symbol]);

  return surface;
}

/**
 * useRiskSurfaces - convenience wrapper for subscribing to many
 * symbols at once. Returns a map keyed by symbol; values are null
 * until the respective symbol emits its first frame.
 *
 * Useful for portfolio-level views (/health, /pro) that need margin
 * math across every open position simultaneously. Each symbol opens
 * its own subscription; the fan-out fix in BulkWebSocket dedupes
 * server-side if multiple hooks request the same symbol.
 *
 * NOTE: we intentionally do NOT return "surface for every symbol
 * merged into one object" on every update. React's setState with
 * object identity matters - we replace the whole map on each
 * update so consumers can useMemo over it cleanly.
 */
export function useRiskSurfaces(
  symbols: readonly string[],
): Record<string, RiskStream | undefined> {
  const [surfaces, setSurfaces] = useState<Record<string, RiskStream | undefined>>({});

  useEffect(() => {
    if (symbols.length === 0) return undefined;

    const unsubs = symbols.map((sym) =>
      marketData.onRisk(sym, (next) => {
        setSurfaces((prev) => ({ ...prev, [sym]: next }));
      }),
    );

    return () => {
      for (const u of unsubs) u();
    };
    // Joined string = stable dep for readonly array inputs
  }, [symbols.join(',')]);

  return surfaces;
}
