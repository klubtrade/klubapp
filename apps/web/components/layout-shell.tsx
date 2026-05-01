'use client';

import { DesktopNav } from '@/components/desktop-nav';
import { NavDrawer } from '@/components/nav-drawer';
import { ToastProvider } from '@/components/toast';
import { WalletButton } from '@/components/wallet-button';

/**
 * Global chrome for the (app) route group.
 *
 * Two layouts in one shell:
 *   - Desktop (md+): <DesktopNav /> renders a fixed top bar with
 *     brand · Home Cash Trade Follow Pro · Settings + Wallet. Reviewer
 *     ask — stop hiding CTAs behind a hamburger when there's screen
 *     real estate to spare. The hamburger drawer is suppressed via
 *     `md:hidden` inside NavDrawer.
 *   - Mobile (< md): NavDrawer's hamburger top-left + a top-right
 *     wallet pill. Drawer slides in for nav.
 *
 * /pro opts out of DesktopNav (it owns its own header) — see
 * desktop-nav.tsx.
 */
export function LayoutShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <ToastProvider>
      <DesktopNav />
      <NavDrawer />

      {/* Mobile-only top-right wallet pill. Desktop wallet lives
          inside DesktopNav so the bar is one cohesive row. */}
      <div className="fixed right-4 top-4 z-50 flex items-center gap-3 md:hidden">
        <WalletButton variant="primary" size="sm" />
      </div>

      {children}
    </ToastProvider>
  );
}