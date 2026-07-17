'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface TradingWalletSession {
  readonly ready: boolean;
  readonly connected: boolean;
  readonly publicKeyBase58: string | null;
  readonly signMessage: ((bytes: Uint8Array) => Promise<Uint8Array>) | null;
  readonly source: 'privy' | 'wallet-adapter' | null;
  readonly promptConnect: () => void;
  readonly disconnect: () => Promise<void>;
}

const TradingWalletContext = createContext<TradingWalletSession | null>(null);

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Wallet-adapter session used when Privy is not configured. */
export function WalletAdapterTradingWalletProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const mounted = useMounted();
  const wallet = useWallet();
  const walletModal = useWalletModal();
  const value = useMemo<TradingWalletSession>(
    () => ({
      ready: mounted,
      connected: mounted && wallet.connected && wallet.publicKey !== null,
      publicKeyBase58: wallet.publicKey?.toBase58() ?? null,
      signMessage: wallet.signMessage ?? null,
      source: wallet.connected ? 'wallet-adapter' : null,
      promptConnect: () => walletModal.setVisible(true),
      disconnect: async () => wallet.disconnect(),
    }),
    [mounted, wallet, walletModal],
  );
  return <TradingWalletContext.Provider value={value}>{children}</TradingWalletContext.Provider>;
}

/**
 * Privy-first session with wallet-adapter as a fallback for an already
 * connected extension. Downstream features consume one identity regardless
 * of whether the user chose email/social or Phantom/Backpack.
 */
export function PrivyTradingWalletProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const mounted = useMounted();
  const privy = usePrivy();
  const solana = useSolanaWallets();
  const adapter = useWallet();
  const walletModal = useWalletModal();
  const privyWallet = solana.wallets[0] ?? null;
  const usePrivyWallet = privy.authenticated && privyWallet !== null;

  const value = useMemo<TradingWalletSession>(() => {
    if (usePrivyWallet) {
      return {
        ready: mounted && privy.ready && solana.ready,
        connected: true,
        publicKeyBase58: privyWallet.address,
        signMessage: async (bytes) => privyWallet.signMessage(bytes),
        source: 'privy',
        promptConnect: () => privy.login(),
        disconnect: async () => privy.logout(),
      };
    }
    return {
      ready: mounted && privy.ready,
      connected: mounted && adapter.connected && adapter.publicKey !== null,
      publicKeyBase58: adapter.publicKey?.toBase58() ?? null,
      signMessage: adapter.signMessage ?? null,
      source: adapter.connected ? 'wallet-adapter' : null,
      promptConnect: () => {
        if (!privy.authenticated) privy.login();
        else walletModal.setVisible(true);
      },
      disconnect: async () => {
        if (adapter.connected) await adapter.disconnect();
        if (privy.authenticated) await privy.logout();
      },
    };
  }, [
    adapter,
    mounted,
    privy,
    privyWallet,
    solana.ready,
    usePrivyWallet,
    walletModal,
  ]);

  return <TradingWalletContext.Provider value={value}>{children}</TradingWalletContext.Provider>;
}

export function useTradingWallet(): TradingWalletSession {
  const session = useContext(TradingWalletContext);
  if (!session) throw new Error('useTradingWallet must be used inside a trading wallet provider');
  return session;
}
