"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { WalletButton } from "@/components/wallet-button";
import {
  isNavigationItemActive,
  MORE_NAVIGATION,
  PRIMARY_NAVIGATION,
  type NavigationGroup,
} from "@/lib/navigation";

/**
 * <NavDrawer />
 *
 * One menu button (three horizontal bars) in the top-left of every
 * in-app page. Taps open a sliding panel with every navigable page
 * grouped using the same route model as the desktop sidebar.
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

const NAV_GROUPS = [
  {
    label: "Main",
    items: PRIMARY_NAVIGATION,
  },
  ...MORE_NAVIGATION,
  {
    label: "Account",
    items: [{ href: "/settings", label: "Settings" }],
  },
] satisfies readonly NavigationGroup[];

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
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [open]);

  return (
    <>
      {/* Hamburger + KLUB wordmark — mobile only. On md+ DesktopNav
          renders a pinned top bar with brand and primary routes
          inline, so the hamburger is redundant and the drawer is
          unreachable (which is intentional — desktop should not need
          a sliding panel for nav). */}
      <div className="fixed left-4 top-4 z-30 flex items-center gap-3 md:hidden">
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
        style={{ willChange: "transform" }}
        className={`fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-[360px] flex-col border-r border-border-subtle bg-bg-base transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
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
                  const active = isNavigationItemActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`block rounded-md px-3 py-2.5 text-[16px] transition-colors ${
                          active
                            ? "bg-bg-surface text-accent"
                            : "text-fg-primary hover:bg-bg-surface hover:text-fg-primary"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>
                            <span className="block">{item.label}</span>
                            {item.description && (
                              <span className="mt-0.5 block text-[11px] text-fg-muted">
                                {item.description}
                              </span>
                            )}
                          </span>
                          {item.badge && (
                            <span className="text-[9px] uppercase tracking-[0.08em] text-fg-muted">
                              {item.badge}
                            </span>
                          )}
                        </span>
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
