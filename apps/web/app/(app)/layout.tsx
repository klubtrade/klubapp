import type { Metadata } from 'next';

import { LayoutShell } from '@/components/layout-shell';

/**
 * Layout for the (app) route group.
 *
 * Delegates to <LayoutShell />, a client component that decides whether
 * to render the global NavDrawer or step aside (on routes like /pro
 * that own their own chrome).
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
  return <LayoutShell>{children}</LayoutShell>;
}