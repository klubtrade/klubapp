'use client';

import { NavDrawer } from '@/components/nav-drawer';
import { Sidebar } from '@/components/sidebar';
import { ToastProvider } from '@/components/toast';
import { WalletButton } from '@/components/wallet-button';

/**
 * Global chrome for the (app) route group.
 *
 * Layout split:
 *
 *   - Desktop (md+): persistent left-rail <Sidebar /> with the brand,
 *     primary nav icons (Home / Cash / Trade / Follow / Pro), a "More"
 *     popover, and a bottom Settings cog. WalletButton lives in the
 *     fixed top-right strip — outside the sidebar so the rail stays
 *     icon-only and the wallet keeps its full pill width. Page content
 *     is offset by `md:pl-14` (sidebar width = 56px) so it doesn't
 *     hide under the rail.
 *
 *   - Mobile (< md): NavDrawer's hamburger top-left + drawer for nav,
 *     wallet pill top-right. Sidebar is `hidden md:flex` so phones
 *     never see it.
 */
export function LayoutShell({ children }: { readonly children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Sidebar />
      <NavDrawer />

      {/* Top-right wallet pill — visible on every viewport. On desktop
          it sits to the right of the sidebar; on mobile it pairs with
          the hamburger top-left. */}
      <div className="fixed right-4 top-4 z-50 flex items-center gap-3 md:right-6 md:top-6">
        <WalletButton variant="primary" size="sm" />
      </div>

      {/* Page content — offset right of the sidebar on md+. Pages keep
          their own px / pt; this wrapper only handles sidebar
          clearance. */}
      <div className="md:pl-14">{children}</div>
    </ToastProvider>
  );
}
