"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

import { PrivyTradingWalletProvider } from "@/lib/trading-wallet";
import {
  DEFAULT_PRIVY_APP_ID,
  getPrivyLogoUrl,
  PRIVY_LOGIN_METHODS,
  PRIVY_SOLANA_WALLETS,
} from "@/lib/privy-config";
import { getSolanaRpcEndpoints, SOLANA_DEVNET_CHAIN } from "@/lib/solana-rpc";

/**
 * App-wide providers.
 *
 * Privy is the sole authentication and Solana wallet gateway. Email
 * users receive an embedded Solana wallet; external Phantom, Solflare,
 * Backpack, and WalletConnect users enter through the same Privy modal.
 * No parallel wallet-adapter provider or connection state exists.
 */
export function Providers({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const privyAppId =
    process.env["NEXT_PUBLIC_PRIVY_APP_ID"] ?? DEFAULT_PRIVY_APP_ID;
  const siteUrl =
    process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://klubtrade.vercel.app";
  const solanaRpc = getSolanaRpcEndpoints({
    NEXT_PUBLIC_SOLANA_RPC_URL: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    NEXT_PUBLIC_SOLANA_WS_URL: process.env.NEXT_PUBLIC_SOLANA_WS_URL,
  });

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#E8B647",
          logo: getPrivyLogoUrl(siteUrl),
          showWalletLoginFirst: false,
          walletChainType: "solana-only",
          walletList: [...PRIVY_SOLANA_WALLETS],
        },
        loginMethods: [...PRIVY_LOGIN_METHODS],
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors({ shouldAutoConnect: false }),
          },
        },
        solana: {
          rpcs: {
            [SOLANA_DEVNET_CHAIN]: {
              rpc: createSolanaRpc(solanaRpc.httpUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(solanaRpc.wsUrl),
              blockExplorerUrl: "https://explorer.solana.com/?cluster=devnet",
            },
          },
        },
      }}
    >
      <PrivyTradingWalletProvider>{children}</PrivyTradingWalletProvider>
    </PrivyProvider>
  );
}
