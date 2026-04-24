import type { Metadata } from 'next';

import { CopyTradeBanner } from '@/components/copy-trade-banner';
import { CopyTradeProvider } from '@/components/copy-trade-provider';
import { NavDrawer } from '@/components/nav-drawer';
import { ToastProvider } from '@/components/toast';
import { WalletButton } from '@/components/wallet-button';

/**
 * Layout for the (app) route group.
 *
 * Chrome elements pinned on every page:
 *   - Hamburger menu (NavDrawer) top-left
 *   - WalletButton top-right — always visible so the user can
 *     connect/disconnect without opening the menu
 *   - CopyTradeBanner — floating bottom-right mirror-signal prompt
 *
 * Global context providers mounted here:
 *   - ToastProvider: shared toast surface for every page
 *   - CopyTradeProvider: runs the copy-trade engine + watchers so
 *     that mirror signals surface regardless of which page the user
 *     is currently viewing.
 */

export const metadata: Metadata = {
  title: {
    template: '%s · KLUB',
    default: 'KLUB',
  },
};

export default function AppLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <CopyTradeProvider>
        <NavDrawer />
        <div className="pointer-events-none fixed right-4 top-4 z-30 md:right-6 md:top-6">
          <div className="pointer-events-auto">
            <WalletButton variant="secondary" size="sm" />
          </div>
        </div>
        {children}
        <CopyTradeBanner />
      </CopyTradeProvider>
    </ToastProvider>
  );
}