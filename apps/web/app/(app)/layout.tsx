import type { Metadata } from "next";

import { AccountSwitcher } from "@/components/account-switcher";
import { CopyTradeBanner } from "@/components/copy-trade-banner";
import { CopyTradeProvider } from "@/components/copy-trade-provider";
import { NavDrawer } from "@/components/nav-drawer";
import { OnboardingGuard } from "@/components/onboarding-guard";
import { Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/toast";
import { WalletButton } from "@/components/wallet-button";
import { ActiveAccountProvider } from "@/hooks/use-active-account";

/**
 * Layout for the (app) route group.
 *
 * Chrome:
 *   - Desktop (md+): persistent <Sidebar /> on the left (fixed,
 *     w-20 = 80px, full-height) with Portfolio/Trade/Copy + More +
 *     Settings. Page content is wrapped in
 *     `md:pl-20` so it sits to the right of the rail.
 *   - Mobile (< md): hamburger drawer top-left (NavDrawer) +
 *     wallet pill top-right. The Sidebar is `hidden md:flex` so
 *     phones never see it.
 *   - Top-right strip (every viewport): AccountSwitcher +
 *     WalletButton, fixed-positioned. Sits to the right of the
 *     sidebar on desktop, paired with the hamburger on mobile.
 *   - CopyTradeBanner - floating bottom-right mirror-signal prompt.
 *
 * Global context providers:
 *   - ToastProvider, ActiveAccountProvider, CopyTradeProvider
 */

export const metadata: Metadata = {
  title: {
    template: "%s · KLUB",
    default: "KLUB",
  },
};

export default function AppLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ActiveAccountProvider>
        <CopyTradeProvider>
          <OnboardingGuard />
          <Sidebar />
          <div
            aria-hidden="true"
            className="fixed inset-x-0 top-0 z-20 h-16 border-b border-border-subtle bg-bg-base/95 backdrop-blur-xl md:hidden"
          />
          <NavDrawer />
          <div className="pointer-events-none fixed right-4 top-4 z-30 flex items-center gap-2 md:right-6 md:top-6">
            <div className="pointer-events-auto">
              <AccountSwitcher />
            </div>
            <div className="pointer-events-auto">
              <WalletButton variant="secondary" size="sm" />
            </div>
          </div>
          <div className="isolate md:pl-20">{children}</div>
          <CopyTradeBanner />
        </CopyTradeProvider>
      </ActiveAccountProvider>
    </ToastProvider>
  );
}
