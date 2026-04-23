'use client';

import { useBulkAccount, type BulkPosition } from '@/hooks/use-bulk-account';

/**
 * usePositions — typed access to the user's open positions on Bulk.
 *
 * Thin wrapper over `useBulkAccount` so the `/trade` and `/home`
 * positions tables don't have to reach into `state.data?.positions`.
 * Polling + caching are owned by `useBulkAccount`; multiple callers
 * to `usePositions(pubkey)` with the same pubkey share a single
 * upstream fetch via React's hook state (one `useBulkAccount` call
 * per component, but all observing the same /account response).
 *
 * Refresh semantics:
 *   - `refresh()` forces an immediate re-fetch of /account
 *   - Automatically re-fetches every 15s while `pubkey` is non-null
 *   - On fetch failure we return `{ positions: [], loading, error }`
 *     with the last good positions preserved in `positions` if any
 */
export function usePositions(pubkey: string | null): {
  readonly positions: readonly BulkPosition[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
} {
  const { state, refresh } = useBulkAccount(pubkey);

  const positions = state.data?.positions ?? [];
  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.error : null;

  return { positions, loading, error, refresh };
}