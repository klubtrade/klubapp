'use client';

import { useTradingWallet } from '@/lib/trading-wallet';

/**
 * Single source of truth for "does this user have a wallet connected".
 *
 * Returns:
 *   - `connected`: true once hydrated AND a wallet is attached
 *   - `pubkey`: base58 address string, or null
 *   - `promptConnect()`: opens the wallet selection modal
 *   - `mounted`: guard for SSR — components should render a skeleton
 *                or disabled state until this is true
 *
 * Every user-action surface in the app that ships to Bulk (place order,
 * provision agent wallet, request faucet, follow a leader, etc.) should
 * check `connected` and call `promptConnect()` as the fallback path.
 */
export function useWalletGate(): {
  readonly connected: boolean;
  readonly pubkey: string | null;
  readonly mounted: boolean;
  readonly promptConnect: () => void;
} {
  const wallet = useTradingWallet();

  return {
    connected: wallet.connected,
    pubkey: wallet.publicKeyBase58,
    mounted: wallet.ready,
    promptConnect: wallet.promptConnect,
  };
}
