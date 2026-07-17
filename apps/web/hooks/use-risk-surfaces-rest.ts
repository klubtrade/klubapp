'use client';

import { useEffect, useRef, useState } from 'react';

import { normalizeBulkErrorMessage } from '@/lib/bulk/error-messages';

/**
 * useRiskSurfacesRest — fetch Bulk's risk-surface grid per market
 * on mount, refresh every 30s, return a map keyed by symbol.
 *
 * Day 3 change: each entry is now the FULL lambda grid (leverage
 * knots × notional knots × side), not just a single `mmFraction`.
 * Consumers use `lookupPositionMm` in `health-input.ts` to pick the
 * cell corresponding to a position's actual notional + side +
 * implicit leverage. `mmFraction` is retained as a back-compat
 * scalar fallback (the floor value, typically 2%).
 *
 * Bulk's streaming WS `risk:{symbol}` topic is monitored separately
 * in `use-risk-surface.ts` but testnet is silent on quiet markets,
 * so REST snapshot + 30s refresh is the authoritative source for
 * health math today.
 */

export interface RiskSurfaceParams {
  /** Conservative floor (buy[0][0] mmrO). Back-compat fallback. */
  readonly mmFraction: number;
  readonly imFraction: number;
  readonly adlRank: number;
  /** Leverage knot points, e.g. [1, 2, ..., 50]. */
  readonly leverageKnots: readonly number[] | null;
  /** Notional knot points, e.g. [50_000, ..., 100_000_000]. */
  readonly notionalKnots: readonly number[] | null;
  /** 2D grid [notional_idx][leverage_idx] of mmrO values for long side. */
  readonly buy: readonly (readonly number[])[] | null;
  /** Same shape for short side. */
  readonly sell: readonly (readonly number[])[] | null;
}

export interface UseRiskSurfacesRestResult {
  readonly params: Record<string, RiskSurfaceParams>;
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastFetchedAt: number | null;
}

const REFRESH_MS = 30_000;

export function useRiskSurfacesRest(): UseRiskSurfacesRestResult {
  const [params, setParams] = useState<Record<string, RiskSurfaceParams>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function fetchOnce(): Promise<void> {
      try {
        const res = await fetch('/api/risk-surfaces', { cache: 'no-store' });
        if (!res.ok) throw new Error(`risk-surfaces: HTTP ${res.status}`);
        const body = (await res.json()) as {
          surfaces?: ReadonlyArray<{
            s?: string;
            mmFraction?: number | null;
            imFraction?: number | null;
            adlRank?: number;
            leverageKnots?: readonly number[] | null;
            notionalKnots?: readonly number[] | null;
            buy?: readonly (readonly number[])[] | null;
            sell?: readonly (readonly number[])[] | null;
          }>;
        };
        if (cancelledRef.current) return;

        const next: Record<string, RiskSurfaceParams> = {};
        for (const row of body.surfaces ?? []) {
          if (!row.s) continue;
          const mm = Number(row.mmFraction);
          if (!Number.isFinite(mm)) continue;
          const imCandidate = typeof row.imFraction === 'number' ? row.imFraction : Number.NaN;
          const im = Number.isFinite(imCandidate) ? imCandidate : mm;
          next[row.s] = {
            mmFraction: mm,
            imFraction: im,
            adlRank: typeof row.adlRank === 'number' ? row.adlRank : 0,
            leverageKnots: row.leverageKnots ?? null,
            notionalKnots: row.notionalKnots ?? null,
            buy: row.buy ?? null,
            sell: row.sell ?? null,
          };
        }
        setParams(next);
        setError(null);
        setLastFetchedAt(Date.now());
      } catch (e) {
        if (cancelledRef.current) return;
        setError(normalizeBulkErrorMessage(e instanceof Error ? e.message : 'unknown'));
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    }

    void fetchOnce();
    const id = setInterval(() => {
      void fetchOnce();
    }, REFRESH_MS);

    return () => {
      cancelledRef.current = true;
      clearInterval(id);
    };
  }, []);

  return { params, loading, error, lastFetchedAt };
}
