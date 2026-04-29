'use client';

import Link from 'next/link';

import { NavDrawer } from '@/components/nav-drawer';
import { ToastProvider } from '@/components/toast';
import { WalletButton } from '@/components/wallet-button';

/**
 * Global chrome for the (app) route group.
 *
 * Renders three things in this order:
 *   1. <NavDrawer /> — hamburger button + sliding menu. Rendered on
 *      every in-app route, including /pro. /pro used to suppress this
 *      so it could own its own chrome, but that caused the wallet
 *      button to be missing on /pro, so it is now always rendered.
 *   2. Top-right strip — WalletButton + KLUB wordmark, fixed position.
 *      Renders on every route. Single source of truth: when the user
 *      connects a wallet, every WalletButton across the app reflects
 *      the connection via the shared Solana adapter context.
 *   3. The page content.
 */
export function LayoutShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <ToastProvider>
      <NavDrawer />

      {/* Top-right strip — fixed, global, always visible */}
      <div className="fixed right-4 top-4 z-50 flex items-center gap-3 md:right-6 md:top-6">
        <WalletButton variant="primary" size="sm" />
        <Link
          href="/cash"
          aria-label="KLUB home"
          className="flex items-center gap-2 font-semibold tracking-[-0.02em] text-fg-primary transition-opacity hover:opacity-70"
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_rgba(167,139,250,0.6)]"
          />
          klub
        </Link>
      </div>

      {children}
    </ToastProvider>
  );
}