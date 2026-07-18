'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useSubAccounts } from '@/hooks/use-sub-accounts';
import { useTradingWallet } from '@/lib/trading-wallet';

/**
 * Active account context - which on-chain account is the user
 * currently "in"?
 *
 * The wallet's master EOA is the default. Switching to a sub-account
 * ("pot") changes the context the entire app trades / queries / sends
 * from. The signer remains the wallet (or its agent) - only the
 * `account` field on Bulk transactions changes.
 *
 * Persistence: the choice is held in `localStorage` keyed by master
 * pubkey, so a user who picked a pot stays in it across reloads.
 *
 * Auto-reset: if the wallet disconnects, or if the chosen pot is no
 * longer in the master's `subAccounts` list (deleted on-chain), we
 * fall back to the master.
 */

interface ActiveAccountValue {
  /** The pubkey we should use as `account` on signed transactions. */
  readonly pubkey: string | null;
  /** Display name - 'Master' or the pot name. */
  readonly name: string;
  /** True if the active account IS the master EOA. */
  readonly isMaster: boolean;
  /** The wallet's master pubkey, regardless of override. */
  readonly masterPubkey: string | null;
  /** All available accounts the user could switch into. */
  readonly accounts: readonly { readonly pubkey: string; readonly name: string }[];
  /** Set the override. Pass null (or master pubkey) to reset to master. */
  readonly setActivePubkey: (pubkey: string | null) => void;
}

const Ctx = createContext<ActiveAccountValue | null>(null);

const STORAGE_PREFIX = 'klub.activeAccount.';

export function ActiveAccountProvider({ children }: { readonly children: ReactNode }) {
  const wallet = useTradingWallet();
  const masterPubkey = wallet.connected ? wallet.publicKeyBase58 : null;

  // Sub-accounts are queried for the master pubkey only. The hook
  // reuses `useBulkAccount`'s polling so this doesn't add a new fetch.
  const { subAccounts } = useSubAccounts(masterPubkey);

  const [override, setOverride] = useState<string | null>(null);

  // Hydrate from localStorage when the wallet connects.
  useEffect(() => {
    if (!masterPubkey) {
      setOverride(null);
      return;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_PREFIX + masterPubkey);
      setOverride(stored && stored !== masterPubkey ? stored : null);
    } catch {
      setOverride(null);
    }
  }, [masterPubkey]);

  // Drop the override if the chosen pot disappeared (on-chain remove,
  // wallet swap, etc).
  useEffect(() => {
    if (override && !subAccounts.some((s) => s.pubkey === override)) {
      // Don't clear immediately on first load - sub-accounts is empty
      // until the first /account fetch resolves. Only clear when we
      // have a non-empty list that doesn't include the override.
      if (subAccounts.length > 0) setOverride(null);
    }
  }, [override, subAccounts]);

  const setActivePubkey = useCallback(
    (pk: string | null) => {
      const next = pk && pk !== masterPubkey ? pk : null;
      setOverride(next);
      if (!masterPubkey) return;
      try {
        if (next === null) {
          window.localStorage.removeItem(STORAGE_PREFIX + masterPubkey);
        } else {
          window.localStorage.setItem(STORAGE_PREFIX + masterPubkey, next);
        }
      } catch {
        // Storage unavailable; the override still works in-memory.
      }
    },
    [masterPubkey],
  );

  const value = useMemo<ActiveAccountValue>(() => {
    const pubkey = override ?? masterPubkey;
    const isMaster = override === null;
    const matched = override ? subAccounts.find((s) => s.pubkey === override) : null;
    const name = isMaster
      ? 'Master'
      : (matched?.name ?? 'Untitled pot');

    const accounts: { readonly pubkey: string; readonly name: string }[] = [];
    if (masterPubkey) accounts.push({ pubkey: masterPubkey, name: 'Master' });
    for (const sa of subAccounts) {
      accounts.push({ pubkey: sa.pubkey, name: sa.name ?? 'Untitled pot' });
    }

    return {
      pubkey,
      name,
      isMaster,
      masterPubkey,
      accounts,
      setActivePubkey,
    };
  }, [override, masterPubkey, subAccounts, setActivePubkey]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveAccount(): ActiveAccountValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useActiveAccount must be used inside <ActiveAccountProvider />');
  }
  return ctx;
}
