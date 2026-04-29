'use client';

import { BulkClient, getL2Book, type L2Book } from '@klub/api-client';
import { useEffect, useRef, useState } from 'react';

/**
 * useL2Book — REST polling for Bulk's `/l2Book` snapshot.
 *
 * /pro renders an L2 ladder per symbol. Bulk's WebSocket exposes
 * `l2Snapshot` and `l2Delta` streams that would be cheaper, but
 * REST polling at ~1Hz is enough fidelity for a Bloomberg-style
 * ladder and avoids a full WS-router build for the first pass.
 *
 * Symbol changes reset the buffer — bids/asks for BTC are
 * meaningless the moment the user switches to ETH.
 */

const POLL_MS = 1_000;
const DEFAULT_DEPTH = 25;

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
  const inFlightRef = useRef(false);
  const lastBookRef = useRef<L2Book | null>(null);

  const clientRef = useRef<BulkClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new BulkClient();
  }

  useEffect(() => {
    let cancelled = false;
    lastBookRef.current = null;
    setState({ status: 'loading', book: null });

    async function fetchBook() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const book = await getL2Book(clientRef.current!, { symbol, depth });
        if (cancelled) return;
        lastBookRef.current = book;
        setState({ status: 'ok', book });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch L2 book';
        setState({ status: 'error', book: lastBookRef.current, error: msg });
      } finally {
        inFlightRef.current = false;
      }
    }

    void fetchBook();
    const id = setInterval(() => {
      void fetchBook();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [symbol, depth]);

  function refresh() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    getL2Book(clientRef.current!, { symbol, depth })
      .then((book) => {
        lastBookRef.current = book;
        setState({ status: 'ok', book });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to fetch L2 book';
        setState({ status: 'error', book: lastBookRef.current, error: msg });
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }

  return { state, refresh };
}
