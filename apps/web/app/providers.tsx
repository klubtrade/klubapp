'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { useMemo } from 'react';

/**
 * App-wide providers.
 *
 * Wallet wiring: we pass an EMPTY wallets array and rely on the Solana
 * Wallet Standard's auto-discovery. Phantom, Solflare, and Backpack
 * (and every modern wallet) register themselves as Standard Wallets,
 * so wallet-adapter-react picks them up without an explicit adapter.
 *
 * Why not the legacy {Phantom,Solflare}WalletAdapter?
 *
 * Both packages used to be required for desktop extension support.
 * Today every modern wallet exposes both interfaces. Registering the
 * legacy adapter alongside the Standard Wallet causes the React
 * wallet-modal to list each wallet twice (and produces the well-
 * known "X was registered as a Standard Wallet. The Wallet Adapter
 * for X can be removed from your app." warning in the console).
 *
 * Worse, the two adapters can disagree on signMessage behavior:
 *   - desktop extension typically routes through the legacy adapter
 *     (it wins the discovery race), which signs raw bytes
 *   - mobile in-app browsers typically route through the Standard
 *     Wallet adapter (the legacy one's environment check fails
 *     outside a desktop extension), which goes through a different
 *     SDK path and may transform the message before signing
 *
 * Result: the SAME wallet, on the SAME code path, produces signatures
 * that verify on desktop and fail on mobile with "unauthorized
 * signer". Removing the legacy adapter forces both desktop and mobile
 * through the SAME Standard Wallet code path — uniform behavior, the
 * desktop fix becomes the mobile fix automatically.
 *
 * Privy stays as an optional wrapper for embedded-wallet flows.
 */
export function Providers({ children }: { readonly children: React.ReactNode }) {
  const privyAppId = process.env['NEXT_PUBLIC_PRIVY_APP_ID'];
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), []);

  // Empty array — Standard Wallet auto-discovery handles every wallet
  // that exposes itself via the @wallet-standard interface.
  const wallets = useMemo(() => [], []);

  const walletStack = (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );

  if (!privyAppId) {
    return walletStack;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#A78BFA',
          logo: '/logo.svg',
          showWalletLoginFirst: false,
        },
        loginMethods: ['email', 'wallet', 'google', 'apple'],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      {walletStack}
    </PrivyProvider>
  );
}