'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useCallback, useEffect, useState } from 'react';

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
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const wallet = useWallet();
  const walletModal = useWalletModal();

  const promptConnect = useCallback(() => {
    walletModal.setVisible(true);
  }, [walletModal]);

  const pubkey = wallet.publicKey ? wallet.publicKey.toBase58() : null;

  return {
    connected: mounted && wallet.connected,
    pubkey,
    mounted,
    promptConnect,
  };
}