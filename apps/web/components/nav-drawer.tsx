'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { WalletButton } from '@/components/wallet-button';

/**
 * <NavDrawer />
 *
 * One menu button (three horizontal bars) in the top-left of every
 * in-app page. Taps open a sliding panel with every navigable page
 * grouped minimally: Trade · Earn · More.
 *
 * Same component, same interaction, web and mobile. No separate
 * bottom nav, no dropdown, no breadcrumbs — one place for navigation.
 * Information is hidden until the user asks for it.
 *
 * Behavior:
 *   - ESC dismisses the drawer
 *   - Click outside dismisses
 *   - Route change auto-dismisses (handled by useEffect on pathname)
 *   - Menu button fixed position; top-left; always clickable
 */

const NAV_GROUPS: readonly {
  readonly label: string;
  readonly items: readonly { readonly href: string; readonly label: string }[];
}[] = [
  {
    label: 'Account',
    items: [
      { href: '/home', label: 'Home' },
      { href: '/cash', label: 'Cash' },
    ],
  },
  {
    label: 'Trade',
    items: [
      { href: '/quick-trade', label: 'Quick trade' },
      { href: '/trade', label: 'Expert trade' },
      { href: '/follow', label: 'Follow leaders' },
      { href: '/copy-trade', label: 'Copy trade' },
      { href: '/health', label: 'Portfolio health' },
      { href: '/pro', label: 'Pro terminal' },
    ],
  },
  {
    label: 'Earn',
    items: [
      { href: '/basis', label: 'Basis vault' },
      { href: '/desk', label: 'Funding desk' },
    ],
  },
  {
    label: 'More',
    items: [
      { href: '/calculator', label: 'The Math' },
      { href: '/practice', label: 'Practice' },
      { href: '/ramp', label: 'Add funds' },
      { href: '/invite', label: 'Invite friends' },
      { href: '/onboarding', label: 'Onboarding' },
      { href: '/settings', label: 'Settings' },
    ],
  },
];

export function NavDrawer() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [open]);

  return (
    <>
      {/* Hamburger + KLUB wordmark — grouped top-left so the
          top-right stays clear for the account pill added in Week 1. */}
      <div className="fixed left-4 top-4 z-30 flex items-center gap-3 md:left-6 md:top-6">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => {
            setOpen(true);
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-klub border border-border-subtle bg-bg-base text-fg-primary transition-colors hover:bg-bg-elevated"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden
          >
            <path
              d="M3 6h14M3 10h14M3 14h14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <Link
          href="/home"
          aria-label="KLUB home"
          className="flex items-center gap-2 font-semibold tracking-[-0.02em] text-fg-primary transition-opacity hover:opacity-70"
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_rgba(232,182,71,0.6)]"
          />
          klub
        </Link>
      </div>

      {/* Backdrop */}
      {/* Backdrop. Pure opacity fade — no blur. backdrop-blur on a
          full-viewport overlay forces a per-frame resample of the
          entire page behind it, which combined with the drawer's
          transform animation ground the menu open to ~10fps on
          mid-tier mobile. Plain dark overlay reads cleanly and
          stays at 60fps. */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-bg-base/70 animate-fade-in"
          onClick={() => {
            setOpen(false);
          }}
          aria-hidden
        />
      )}

      {/* Drawer. `will-change: transform` promotes this element to
          its own GPU layer so the slide-in animates smoothly without
          repainting the parent. */}
      <aside
        style={{ willChange: 'transform' }}
        className={`fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[360px] flex-col border-r border-border-subtle bg-bg-base transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between px-6 pb-6 pt-5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Menu
          </span>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => {
              setOpen(false);
            }}
            className="text-xl text-fg-muted transition-colors hover:text-fg-primary"
          >
            ×
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-6 pb-8">
          {NAV_GROUPS.map((g) => (
            <div key={g.label} className="mb-8 last:mb-0">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
                {g.label}
              </div>
              <ul className="space-y-1">
                {g.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block rounded-md px-3 py-2.5 text-[16px] transition-colors ${
                          active
                            ? 'bg-bg-surface text-accent'
                            : 'text-fg-primary hover:bg-bg-surface hover:text-fg-primary'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Wallet footer — pinned to bottom */}
        <div className="border-t border-border-subtle px-6 py-5">
          <WalletButton variant="secondary" size="md" />
        </div>
      </aside>
    </>
  );
}
