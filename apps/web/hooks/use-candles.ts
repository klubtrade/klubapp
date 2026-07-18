'use client';

import {
  BulkClient,
  getCandles,
  type Candle,
  type CandleInterval,
} from '@klub/api-client';
import { useEffect, useRef, useState } from 'react';

/**
 * useCandles - fetch + poll OHLCV candles from Bulk's `/klines`.
 *
 * Polling cadence is interval-aware: 1m candles refresh every 5s
 * (Bulk's tick is sub-second, but flooding our backend at 1Hz
 * for a chart UI is wasteful), 1d candles every 60s. Real-time
 * tick-by-tick updates would use Bulk's WebSocket `candle` stream
 * - that's a follow-up. For the first chart pass, REST polling
 * is the simplest path that reliably renders correct data.
 *
 * The hook returns:
 *   - state.status: 'idle' | 'loading' | 'ok' | 'error'
 *   - state.candles: readonly Candle[] (always populated; empty
 *     until first successful fetch)
 *   - refresh(): force an immediate refetch
 *
 * Candles come back in Bulk's compact `{t,o,h,l,c,v,n}` shape with
 * `o/h/l/c/v` as DecimalString. Conversion to numbers happens at
 * the chart layer where it's needed - keeping this hook pure
 * means /pro and other surfaces can consume the same data.
 */

const DEFAULT_LIMIT = 200;

export type CandlesState =
  | { readonly status: 'idle'; readonly candles: readonly Candle[] }
  | { readonly status: 'loading'; readonly candles: readonly Candle[] }
  | { readonly status: 'ok'; readonly candles: readonly Candle[] }
  | {
      readonly status: 'error';
      readonly candles: readonly Candle[];
      readonly error: string;
    };

function pollIntervalMs(interval: CandleInterval): number {
  // For sub-hour intervals, 5s feels live without hammering the API.
  // For longer intervals (1h+) the chart only needs an update when a
  // new bar opens, so we slow down significantly.
  switch (interval) {
    case '1m':
    case '5m':
    case '15m':
      return 5_000;
    case '1h':
      return 30_000;
    case '4h':
    case '1d':
      return 60_000;
  }
}

export function useCandles(
  symbol: string,
  interval: CandleInterval,
): {
  readonly state: CandlesState;
  readonly refresh: () => void;
} {
  const [state, setState] = useState<CandlesState>({
    status: 'idle',
    candles: [],
  });
  const inFlightRef = useRef(false);
  const lastCandlesRef = useRef<readonly Candle[]>([]);

  const clientRef = useRef<BulkClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new BulkClient();
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchCandles() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setState((prev) => ({ status: 'loading', candles: prev.candles }));
      try {
        const candles = await getCandles(clientRef.current!, {
          symbol,
          interval,
          limit: DEFAULT_LIMIT,
        });
        if (cancelled) return;
        lastCandlesRef.current = candles;
        setState({ status: 'ok', candles });
      }  catch (err) {
        if (cancelled) return;
        console.error('[useCandles] fetch failed:', err);
        const msg =
          err instanceof Error ? err.message : 'Failed to fetch candles';
        setState({
          status: 'error',
          candles: lastCandlesRef.current,
          error: msg,
        });
      } finally {
        inFlightRef.current = false;
      }
    }

    void fetchCandles();
    const intervalId = setInterval(() => {
      void fetchCandles();
    }, pollIntervalMs(interval));

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [symbol, interval]);

  function refresh() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setState((prev) => ({ status: 'loading', candles: prev.candles }));
    getCandles(clientRef.current!, { symbol, interval, limit: DEFAULT_LIMIT })
      .then((candles) => {
        lastCandlesRef.current = candles;
        setState({ status: 'ok', candles });
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : 'Failed to fetch candles';
        setState({
          status: 'error',
          candles: lastCandlesRef.current,
          error: msg,
        });
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }

  return { state, refresh };
}
