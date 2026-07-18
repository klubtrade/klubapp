"use client";

import { usePrivy } from "@privy-io/react-auth";
import {
  useCreateWallet,
  useSignAndSendTransaction,
  useWallets,
} from "@privy-io/react-auth/solana";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface TradingWalletSession {
  readonly ready: boolean;
  readonly connected: boolean;
  readonly publicKeyBase58: string | null;
  readonly signMessage: ((bytes: Uint8Array) => Promise<Uint8Array>) | null;
  readonly signAndSendTransaction:
    | ((transaction: Uint8Array) => Promise<Uint8Array>)
    | null;
  readonly source: "privy" | null;
  readonly promptConnect: () => void;
  readonly disconnect: () => Promise<void>;
}

const TradingWalletContext = createContext<TradingWalletSession | null>(null);

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * The one wallet session consumed by every account and signing feature.
 * Privy's Solana hook returns both embedded and linked external wallets.
 */
export function PrivyTradingWalletProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const mounted = useMounted();
  const privy = usePrivy();
  const solana = useWallets();
  const { createWallet } = useCreateWallet();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const privyWallet = solana.wallets[0] ?? null;

  const promptConnect = useCallback(() => {
    if (!privy.ready) return;

    if (!privy.authenticated) {
      privy.connectOrCreateWallet();
      return;
    }

    if (privyWallet) {
      privy.linkWallet({ walletChainType: "solana-only" });
      return;
    }

    void createWallet().catch(() => {
      privy.linkWallet({ walletChainType: "solana-only" });
    });
  }, [createWallet, privy, privyWallet]);

  const value = useMemo<TradingWalletSession>(
    () => ({
      ready: mounted && privy.ready && solana.ready,
      connected: mounted && privy.authenticated && privyWallet !== null,
      publicKeyBase58: privyWallet?.address ?? null,
      signMessage: privyWallet
        ? async (bytes) => {
            const result = await privyWallet.signMessage({ message: bytes });
            return result.signature;
          }
        : null,
      signAndSendTransaction: privyWallet
        ? async (transaction) => {
            const result = await signAndSendTransaction({
              transaction,
              wallet: privyWallet,
              chain: "solana:devnet",
              options: { optimisticBroadcast: true },
            });
            return result.signature;
          }
        : null,
      source: privyWallet ? "privy" : null,
      promptConnect,
      disconnect: async () => privy.logout(),
    }),
    [
      mounted,
      privy,
      privyWallet,
      promptConnect,
      signAndSendTransaction,
      solana.ready,
    ],
  );

  return (
    <TradingWalletContext.Provider value={value}>
      {children}
    </TradingWalletContext.Provider>
  );
}

export function useTradingWallet(): TradingWalletSession {
  const session = useContext(TradingWalletContext);
  if (!session)
    throw new Error(
      "useTradingWallet must be used inside a trading wallet provider",
    );
  return session;
}
