'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { WalletButton } from '@/components/wallet-button';

/**
 * Shared top navigation for all in-app surfaces.
 *
 * Minimalist pass: sans-serif labels (not dense monospace smallcaps),
 * subtle purple underline for the active route, backdrop blur once the
 * user scrolls. Landing uses its own `LandingNav` in `app/page.tsx` —
 * this component is rendered only on in-app pages.
 */
export function TopNav({
  variant = 'app',
}: {
  readonly variant?: 'landing' | 'app';
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const primaryLinks = [
    { href: '/home' as const, label: 'Home' },
    { href: '/quick-trade' as const, label: 'Trade' },
    { href: '/follow' as const, label: 'Follow' },
    { href: '/basis' as const, label: 'Basis' },
  ];

  const moreLinks = [
    { href: '/pro' as const, label: 'KLUB Pro', hint: 'Terminal' },
    { href: '/desk' as const, label: 'The Desk', hint: 'Funding' },
    { href: '/calculator' as const, label: 'The Math', hint: 'Calculator' },
    { href: '/health' as const, label: 'Health', hint: 'Portfolio' },
    { href: '/practice' as const, label: 'Practice', hint: 'Testnet' },
    { href: '/ramp' as const, label: 'Add funds', hint: 'Deposit' },
  ];

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname?.startsWith(href));

  return (
    <nav
      className={`sticky top-0 z-40 border-b transition-colors duration-300 ${
        scrolled
          ? 'border-border-subtle bg-bg-base/70 backdrop-blur-xl backdrop-saturate-150'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
        <div className="flex items-center gap-10">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight text-fg-primary"
          >
            <span className="live-dot" aria-hidden />
            KLUB
          </Link>
          {variant === 'app' && (
            <div className="hidden items-center gap-1 md:flex">
              {primaryLinks.map((l) => {
                const active = isActive(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`relative rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors duration-200 ${
                      active
                        ? 'text-fg-primary'
                        : 'text-fg-secondary hover:text-fg-primary'
                    }`}
                  >
                    {l.label}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-accent"
                      />
                    )}
                  </Link>
                );
              })}
              <MoreMenu links={moreLinks} isActive={isActive} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            aria-label="Settings"
            className="hidden items-center justify-center rounded-klub border border-border-subtle p-2 text-fg-secondary transition-colors hover:border-border hover:text-fg-primary md:inline-flex"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </Link>
          <Link href="/invite/demo" className="btn-primary btn-sm md:hidden">
            Connect
          </Link>
          <div className="hidden md:block">
            <WalletButton size="sm" />
          </div>
        </div>
      </div>
    </nav>
  );
}

function MoreMenu({
  links,
  isActive,
}: {
  readonly links: readonly { readonly href: string; readonly label: string; readonly hint: string }[];
  readonly isActive: (href: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasActive = links.some((l) => isActive(l.href));

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-more-menu]')) setOpen(false);
    }
    if (open) {
      window.addEventListener('click', onClick);
      return () => {
        window.removeEventListener('click', onClick);
      };
    }
    return undefined;
  }, [open]);

  return (
    <div className="relative" data-more-menu>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className={`relative flex items-center gap-1 rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors duration-200 ${
          hasActive || open ? 'text-fg-primary' : 'text-fg-secondary hover:text-fg-primary'
        }`}
      >
        More
        <span
          className={`text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          ▾
        </span>
        {hasActive && (
          <span
            aria-hidden
            className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-accent"
          />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-elevated shadow-[0_12px_40px_rgba(0,0,0,0.4)]">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => {
                setOpen(false);
              }}
              className="flex items-baseline justify-between px-4 py-2.5 transition-colors hover:bg-bg-surface"
            >
              <span className="text-[14px] font-medium text-fg-primary">{l.label}</span>
              <span className="text-[11px] text-fg-muted">{l.hint}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
