'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { clusterApiUrl } from '@solana/web3.js';
import { useMemo } from 'react';

/**
 * App-wide providers.
 *
 * Backpack implements the Solana Wallet Standard directly, so it auto-detects
 * without an explicit adapter. Phantom + Solflare use explicit adapters.
 *
 * Privy is optional — wraps only when NEXT_PUBLIC_PRIVY_APP_ID is set. Without
 * it, the Solana wallet adapter alone handles Connect.
 */
export function Providers({ children }: { readonly children: React.ReactNode }) {
  const privyAppId = process.env['NEXT_PUBLIC_PRIVY_APP_ID'];
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

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