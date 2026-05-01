'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { WalletButton } from '@/components/wallet-button';

/**
 * Desktop top-bar navigation.
 *
 * Shown only on `md+`. Mobile keeps the hamburger drawer (NavDrawer).
 *
 * Mirrors the Solflare-website layout: brand wordmark left, primary
 * routes inline center-left, account on the right. Reviewer ask: stop
 * burning desktop real estate hiding CTAs behind a hamburger.
 *
 * Pinned items are the five high-frequency routes (Home, Cash, Trade,
 * Follow, Pro). Less-common pages (Copy trade, Health, Basis, Desk,
 * Math, Practice, Ramp, Settings) remain accessible via direct URL
 * and via the mobile drawer; a "More ▾" dropdown can be added when
 * the secondary routes need surfacing.
 *
 * NOT rendered on `/pro` — that page owns its own chrome (symbol +
 * mark + command palette) and stacking another global bar above it
 * eats vertical space the terminal needs.
 */

const ITEMS = [
  { href: '/home', label: 'Home' },
  { href: '/cash', label: 'Cash' },
  { href: '/quick-trade', label: 'Trade' },
  { href: '/follow', label: 'Follow' },
  { href: '/pro', label: 'Pro' },
] as const;

const MORE_GROUPS = [
  {
    label: 'Trade',
    items: [
      { href: '/copy-trade', label: 'Copy trade' },
      { href: '/health', label: 'Portfolio health' },
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
    label: 'Tools',
    items: [
      { href: '/calculator', label: 'The Math' },
      { href: '/practice', label: 'Practice' },
      { href: '/ramp', label: 'Add funds' },
      { href: '/invite', label: 'Invite friends' },
      { href: '/onboarding', label: 'Onboarding' },
    ],
  },
] as const;

export function DesktopNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLLIElement>(null);

  // Click-outside dismisses the More dropdown.
  useEffect(() => {
    if (!moreOpen) return;
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [moreOpen]);

  // Close on route change so the dropdown doesn't linger after nav.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // /pro owns its own header — don't double-stack chrome.
  if (pathname?.startsWith('/pro')) return null;

  const moreActive = MORE_GROUPS.some((g) =>
    g.items.some((i) => pathname === i.href || pathname?.startsWith(i.href + '/')),
  );

  return (
    <nav className="fixed inset-x-0 top-0 z-40 hidden h-14 items-center justify-between gap-6 border-b border-border-subtle bg-bg-base/95 px-6 backdrop-blur-md md:flex">
      <div className="flex items-center gap-8">
        <Link
          href="/home"
          aria-label="KLUB home"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-fg-primary transition-opacity hover:opacity-70"
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_12px_rgba(232,182,71,0.6)]"
          />
          klub
        </Link>
        <ul className="flex items-center gap-1">
          {ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/home' && pathname?.startsWith(item.href + '/'));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? 'bg-bg-surface text-accent'
                      : 'text-fg-secondary hover:bg-bg-surface hover:text-fg-primary'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li ref={moreRef} className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                moreActive || moreOpen
                  ? 'bg-bg-surface text-accent'
                  : 'text-fg-secondary hover:bg-bg-surface hover:text-fg-primary'
              }`}
            >
              More
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path
                  d="M2 3.5l3 3 3-3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full z-50 mt-2 w-[260px] rounded-klub-lg border border-border-subtle bg-bg-elevated p-2 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
              >
                {MORE_GROUPS.map((group) => (
                  <div key={group.label} className="mb-2 last:mb-0">
                    <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
                      {group.label}
                    </div>
                    <ul>
                      {group.items.map((item) => {
                        const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={`block rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                                active
                                  ? 'bg-bg-surface text-accent'
                                  : 'text-fg-primary hover:bg-bg-surface'
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
              </div>
            )}
          </li>
        </ul>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          aria-label="Settings"
          className={`rounded-md p-1.5 text-[13px] transition-colors ${
            pathname?.startsWith('/settings')
              ? 'text-accent'
              : 'text-fg-muted hover:text-fg-primary'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M16.5 11.5v-3l-1.8-.7a5 5 0 0 0-.6-1.4l.8-1.7-2.1-2.1-1.7.8a5 5 0 0 0-1.4-.6L9 .5h-3l-.7 1.8a5 5 0 0 0-1.4.6l-1.7-.8L.1 4.2l.8 1.7a5 5 0 0 0-.6 1.4L-1.5 8v3l1.8.7a5 5 0 0 0 .6 1.4l-.8 1.7 2.1 2.1 1.7-.8a5 5 0 0 0 1.4.6l.7 1.8h3l.7-1.8a5 5 0 0 0 1.4-.6l1.7.8 2.1-2.1-.8-1.7a5 5 0 0 0 .6-1.4l1.8-.7Z"
              stroke="currentColor"
              strokeWidth="1.2"
              transform="translate(2 2) scale(0.8)"
            />
          </svg>
        </Link>
        <WalletButton variant="primary" size="sm" />
      </div>
    </nav>
  );
}
