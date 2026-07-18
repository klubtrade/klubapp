'use client';

import type { L2Book, L2Level } from '@klub/api-client';
import { useEffect, useRef, useState } from 'react';

import { marketData } from '@/lib/market-data/client';

/**
 * useL2Book - subscribe to Bulk's WebSocket `l2Snapshot` stream.
 *
 * Bulk re-broadcasts a full snapshot every ~100ms while subscribed,
 * so each emit is the authoritative book - no client-side delta
 * merging needed. The previous incarnation polled REST `/l2Book`
 * which Bulk has since removed (HTTP 404 on every call); this
 * version uses the same WS plumbing the watchlist and ticker
 * already ride.
 *
 * The hook keeps the same return shape (`{state, refresh}`) so
 * /pro's PanelOrderbook didn't have to change. `refresh` is a
 * no-op in WS mode - there's nothing to re-fetch when we already
 * have a live stream.
 *
 * Symbol changes reset the buffer; the previous symbol's book is
 * meaningless once the user pivots.
 */

const DEFAULT_DEPTH = 25;
// How long to wait before declaring "no data" - covers Bulk being
// silent on a market with no makers, or the WS connection still in
// reconnect.
const STALE_TIMEOUT_MS = 5_000;

export type L2BookState =
  | { readonly status: 'idle'; readonly book: L2Book | null }
  | { readonly status: 'loading'; readonly book: L2Book | null }
  | { readonly status: 'ok'; readonly book: L2Book }
  | { readonly status: 'error'; readonly book: L2Book | null; readonly error: string };

export function useL2Book(
  symbol: string,
  opts: { readonly depth?: number } = {},
): { readonly state: L2BookState; readonly refresh: () => void } {
  const depth = opts.depth ?? DEFAULT_DEPTH;
  const [state, setState] = useState<L2BookState>({ status: 'idle', book: null });
  const lastBookRef = useRef<L2Book | null>(null);

  useEffect(() => {
    lastBookRef.current = null;
    setState({ status: 'loading', book: null });

    if (!marketData.hasConfiguredWs()) {
      setState({
        status: 'error',
        book: null,
        error: 'Bulk WebSocket is not configured. Live order book is unavailable.',
      });
      return undefined;
    }

    const staleTimer = setTimeout(() => {
      setState((s) =>
        s.status === 'loading'
          ? {
              status: 'error',
              book: null,
              error: `No L2 snapshot received in ${STALE_TIMEOUT_MS / 1000}s - Bulk may not be streaming this market.`,
            }
          : s,
      );
    }, STALE_TIMEOUT_MS);

    const unsub = marketData.onL2Snapshot(
      symbol,
      { nlevels: depth },
      (snap) => {
        clearTimeout(staleTimer);
        // Bulk gives us numeric prices/sizes; downstream `buildLadder`
        // already does `Number(pxStr)` on string inputs, so we serialize
        // here to keep the L2Book contract (DecimalString tuples).
        const bids = snap.levels[0]
          .slice(0, depth)
          .map((lvl: L2Level) => [String(lvl.px), String(lvl.sz)] as [string, string]);
        const asks = snap.levels[1]
          .slice(0, depth)
          .map((lvl: L2Level) => [String(lvl.px), String(lvl.sz)] as [string, string]);
        const book: L2Book = { s: symbol, ts: snap.ts, bids, asks };
        lastBookRef.current = book;
        setState({ status: 'ok', book });
      },
    );

    return () => {
      clearTimeout(staleTimer);
      unsub();
    };
  }, [symbol, depth]);

  // Refresh is a no-op in WS mode - the stream is the source of truth.
  // Kept on the return shape to match the previous polling-based API.
  function refresh() {
    // intentionally empty
  }

  return { state, refresh };
}
