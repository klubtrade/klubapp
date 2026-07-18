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
  useRef,
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
  readonly connectionError: string | null;
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
  const creatingWalletRef = useRef(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const ensureEmbeddedSolanaWallet = useCallback(async () => {
    if (
      !privy.ready ||
      !privy.authenticated ||
      !solana.ready ||
      privyWallet ||
      creatingWalletRef.current
    ) {
      return;
    }

    creatingWalletRef.current = true;
    try {
      await createWallet();
      setConnectionError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create wallet";
      if (!/already/i.test(message)) {
        setConnectionError(message);
      }
    } finally {
      creatingWalletRef.current = false;
    }
  }, [
    createWallet,
    privy.authenticated,
    privy.ready,
    privyWallet,
    solana.ready,
  ]);

  useEffect(() => {
    void ensureEmbeddedSolanaWallet();
  }, [ensureEmbeddedSolanaWallet]);

  useEffect(() => {
    if (privyWallet) setConnectionError(null);
  }, [privyWallet]);

  const promptConnect = useCallback(() => {
    if (!privy.ready) return;

    setConnectionError(null);

    if (!privy.authenticated) {
      privy.connectOrCreateWallet();
      return;
    }

    if (privyWallet) return;

    void ensureEmbeddedSolanaWallet();
  }, [ensureEmbeddedSolanaWallet, privy, privyWallet]);

  const value = useMemo<TradingWalletSession>(
    () => ({
      ready: mounted && privy.ready,
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
      connectionError,
      promptConnect,
      disconnect: async () => privy.logout(),
    }),
    [
      connectionError,
      mounted,
      privy,
      privyWallet,
      promptConnect,
      signAndSendTransaction,
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
