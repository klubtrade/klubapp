'use client';

import {
  useBulkAccount,
  type BulkSubAccount,
} from '@/hooks/use-bulk-account';

/**
 * useSubAccounts — typed access to the user's Bulk sub-accounts.
 *
 * Bulk v1.0.14 (28 Apr 2026) added native sub-accounts as a first-class
 * primitive: a master account can hold N named children (`{pubkey, name}`).
 * KLUB models its Cash / Trading / per-leader copy-trade pools as
 * sub-accounts so each pool's risk is isolated on-chain rather than
 * tracked client-side in localStorage.
 *
 * This hook wraps `useBulkAccount` so callers don't have to reach into
 * `state.data?.subAccounts`. Loading + polling are owned upstream.
 */
export function useSubAccounts(pubkey: string | null): {
  readonly subAccounts: readonly BulkSubAccount[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => void;
} {
  const { state, refresh } = useBulkAccount(pubkey);

  const subAccounts = state.data?.subAccounts ?? [];
  const loading = state.status === 'loading';
  const error = state.status === 'error' ? state.error : null;

  return { subAccounts, loading, error, refresh };
}
