'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Persistent left-rail navigation for desktop.
 *
 * Per Jun's review (paraphrased): "menu icons aren't showing at the
 * left side of the app persistently. they should be visible by the
 * left side on their own panel vertically." This replaces the
 * previous top-bar DesktopNav with a Linear/Discord/Solflare-style
 * vertical icon rail.
 *
 *   ┌──┐
 *   │● │  ← brand
 *   │⌂ │  ← Home
 *   │$ │  ← Cash
 *   │↗ │  ← Trade
 *   │👥│  ← Follow
 *   │▣│  ← Pro
 *   │⋯ │  ← More (popover panel to the right)
 *   │  │
 *   │⚙ │  ← Settings
 *   └──┘
 *
 * w-14 (56px) — fits 5 icons + brand + cog comfortably without
 * stealing horizontal real estate from the page content. Mobile keeps
 * the existing NavDrawer (hamburger top-left); the sidebar is
 * `hidden md:flex` so phones never see it.
 */

const PRIMARY = [
  { href: '/home', label: 'Home', icon: <IconHome /> },
  { href: '/cash', label: 'Cash', icon: <IconWallet /> },
  { href: '/quick-trade', label: 'Trade', icon: <IconTrade /> },
  { href: '/follow', label: 'Follow', icon: <IconUsers /> },
  { href: '/pro', label: 'Pro', icon: <IconTerminal /> },
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
      { href: '/earn', label: 'Earn overview' },
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

export function Sidebar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const moreActive = MORE_GROUPS.some((g) =>
    g.items.some(
      (i) => pathname === i.href || pathname?.startsWith(i.href + '/'),
    ),
  );

  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden h-screen w-20 flex-col items-center justify-between border-r border-border-subtle bg-bg-surface/30 py-5 backdrop-blur-md md:flex"
      aria-label="Primary navigation"
    >
      <div className="flex flex-col items-center gap-2">
        <Link
          href="/home"
          aria-label="KLUB home"
          className="mb-4 flex h-12 w-12 items-center justify-center"
        >
          <span
            aria-hidden
            className="h-3 w-3 rounded-full bg-accent shadow-[0_0_14px_rgba(232,182,71,0.7)]"
          />
        </Link>
        {PRIMARY.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/home' && pathname?.startsWith(item.href + '/'));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              className={`flex h-12 w-12 items-center justify-center rounded-lg transition-colors ${
                active
                  ? 'bg-bg-surface text-accent'
                  : 'text-fg-muted hover:bg-bg-surface hover:text-fg-primary'
              }`}
            >
              {item.icon}
            </Link>
          );
        })}
        <div ref={moreRef} className="relative">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            title="More"
            aria-label="More"
            className={`flex h-12 w-12 items-center justify-center rounded-lg transition-colors ${
              moreActive || moreOpen
                ? 'bg-bg-surface text-accent'
                : 'text-fg-muted hover:bg-bg-surface hover:text-fg-primary'
            }`}
          >
            <IconMore />
          </button>
          {moreOpen && (
            <div
              role="menu"
              className="absolute left-full top-0 z-50 ml-2 w-[260px] rounded-klub-lg border border-border-subtle bg-bg-elevated p-2 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
            >
              {MORE_GROUPS.map((group) => (
                <div key={group.label} className="mb-2 last:mb-0">
                  <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
                    {group.label}
                  </div>
                  <ul>
                    {group.items.map((item) => {
                      const active =
                        pathname === item.href ||
                        pathname?.startsWith(item.href + '/');
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
        </div>
      </div>
      <Link
        href="/settings"
        title="Settings"
        aria-label="Settings"
        className={`flex h-12 w-12 items-center justify-center rounded-lg transition-colors ${
          pathname?.startsWith('/settings')
            ? 'bg-bg-surface text-accent'
            : 'text-fg-muted hover:bg-bg-surface hover:text-fg-primary'
        }`}
      >
        <IconCog />
      </Link>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconHome() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="16" cy="12" r="1" fill="currentColor" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconTrade() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 17l5-5 4 4 9-9m0 0v6m0-6h-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 6.5a3 3 0 1 1 3 5.2M21.5 20a5 5 0 0 0-4-4.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTerminal() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 9l3 3-3 3M13 15h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

function IconCog() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.5-2.4.9a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.4a7 7 0 0 0-2 1.2L5 5.7l-2 3.5 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.5 2.4-.9a7 7 0 0 0 2 1.2L10 21h4l.5-2.4a7 7 0 0 0 2-1.2l2.4.9 2-3.5-2-1.6a7 7 0 0 0 .1-1.2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
