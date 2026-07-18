'use client';

import {
  BulkClient,
  queryUserFills,
  type UserFill,
} from '@klub/api-client';
import { useEffect, useRef, useState } from 'react';

/**
 * useUserFills - poll the user's recent fills from Bulk.
 *
 * Mirrors the polling pattern of `useBulkAccount`: a 10s interval,
 * cancellable on unmount, idempotent (won't fan out duplicate
 * requests). Fills are passed-through unchanged from Bulk's response;
 * we filter by symbol on the consumer side rather than baking that
 * into the hook so the same fetch can serve multiple panels (per-
 * symbol "recent trades" on /trade, full "activity" on /home, etc).
 *
 * The endpoint is unsigned - fills are public on-chain history. So
 * no signer plumbing here; just a plain GET-equivalent against
 * Bulk's `/account` POST API with `{ type: 'fills', user }`.
 *
 * Returns a small state machine:
 *   - 'idle'      - no pubkey yet (wallet not connected)
 *   - 'loading'   - first fetch in flight
 *   - 'ok'        - fills array available; may also be polling another fetch
 *   - 'error'     - last fetch failed; we expose the error and keep showing
 *                   the last good fills if we had any (graceful degradation)
 *
 * Bulk currently returns up to 5000 fills with no pagination - fine
 * for retail-volume accounts but a future TODO for the heaviest
 * leaders.
 */

const POLL_INTERVAL_MS = 10_000;

export type UserFillsState =
  | { readonly status: 'idle'; readonly fills: readonly UserFill[] }
  | { readonly status: 'loading'; readonly fills: readonly UserFill[] }
  | { readonly status: 'ok'; readonly fills: readonly UserFill[] }
  | {
      readonly status: 'error';
      readonly fills: readonly UserFill[];
      readonly error: string;
    };

export function useUserFills(pubkey: string | null): {
  readonly state: UserFillsState;
  readonly refresh: () => void;
} {
  const [state, setState] = useState<UserFillsState>({
    status: 'idle',
    fills: [],
  });
  const inFlightRef = useRef(false);
  const lastFillsRef = useRef<readonly UserFill[]>([]);

  // We hold a single BulkClient per hook instance. The HTTP base
  // URL can come from env; falling back to the default is fine
  // because BulkClient does the same thing internally.
  const clientRef = useRef<BulkClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new BulkClient();
  }

  useEffect(() => {
    if (!pubkey) {
      setState({ status: 'idle', fills: [] });
      lastFillsRef.current = [];
      return;
    }

    let cancelled = false;

    async function fetchFills() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setState((prev) => ({ status: 'loading', fills: prev.fills }));
      try {
        const fills = await queryUserFills(clientRef.current!, pubkey!);
        if (cancelled) return;
        lastFillsRef.current = fills;
        setState({ status: 'ok', fills });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch fills';
        setState({
          status: 'error',
          fills: lastFillsRef.current,
          error: msg,
        });
      } finally {
        inFlightRef.current = false;
      }
    }

    void fetchFills();
    const interval = setInterval(() => {
      void fetchFills();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pubkey]);

  function refresh() {
    if (!pubkey || inFlightRef.current) return;
    // Force-reset by toggling status; the effect's fetchFills will
    // pick it up immediately. Cheaper than restarting the interval.
    inFlightRef.current = true;
    setState((prev) => ({ status: 'loading', fills: prev.fills }));
    queryUserFills(clientRef.current!, pubkey)
      .then((fills) => {
        lastFillsRef.current = fills;
        setState({ status: 'ok', fills });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to fetch fills';
        setState({
          status: 'error',
          fills: lastFillsRef.current,
          error: msg,
        });
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }

  return { state, refresh };
}
