"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { useActiveAccount } from "@/hooks/use-active-account";

/**
 * <AccountSwitcher /> - pill button + dropdown for switching between
 * the master account and any pots the user has created.
 *
 * Sized for inline use in page headers. The active account name is
 * always visible; the dropdown only opens on click. When the user has
 * no pots, the pill collapses to a static "Master" label (no menu)
 * so the multi-account UX doesn't bleed in until it's relevant.
 */
export function AccountSwitcher() {
  const { name, pubkey, accounts, setActivePubkey } = useActiveAccount();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Empty state: no wallet connected
  if (!pubkey) {
    return (
      <span className="rounded-full border border-border-subtle bg-bg-elevated px-2.5 py-1 font-mono text-[10px] text-fg-muted">
        Not connected
      </span>
    );
  }

  // Static label when only the master account exists - no need to show
  // a switcher with one item.
  if (accounts.length <= 1) {
    return (
      <span className="rounded-full border border-border-subtle bg-bg-elevated px-2.5 py-1 font-mono text-[10px] text-fg-muted">
        Master
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-bg-elevated px-2.5 py-1 font-mono text-[11px] text-fg-primary transition-colors hover:border-accent"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="max-w-[120px] truncate">{name}</span>
        <ChevronDown
          size={12}
          strokeWidth={1.8}
          aria-hidden
          className={`text-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-56 overflow-hidden rounded-klub border border-border bg-bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
          <div className="border-b border-border-subtle px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-fg-muted">
            Switch account
          </div>
          {accounts.map((acc) => {
            const active = acc.pubkey === pubkey;
            return (
              <button
                key={acc.pubkey}
                type="button"
                onClick={() => {
                  setActivePubkey(acc.pubkey);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                  active ? "bg-accent/10" : "hover:bg-bg-elevated"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[12px] ${active ? "font-semibold text-accent" : "text-fg-primary"}`}
                  >
                    {acc.name}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-fg-muted">
                    {acc.pubkey.slice(0, 6)}…{acc.pubkey.slice(-4)}
                  </span>
                </span>
                {active && (
                  <span className="shrink-0 text-[9px] uppercase tracking-[0.1em] text-accent">
                    active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
