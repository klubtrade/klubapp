"use client";

import Link from "next/link";
import type { ReactNode } from "react";

// =============================================================================
// Action buttons — Revolut/Venmo-style icon circles
// =============================================================================

/**
 * Icon-circle action button. Big tappable circle with the icon, label
 * underneath. Same visual whether it's a button (Send/Receive) or a
 * link (Add/Trade) so the action grid reads as one cohesive row.
 */
export function ActionCircle({
  label,
  icon,
  onClick,
  href,
  disabled,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly onClick?: () => void;
  readonly href?: string;
  readonly disabled?: boolean;
}) {
  const inner = (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent transition-all ${
          disabled
            ? "opacity-40"
            : "hover:bg-accent/25 hover:scale-[1.04] active:scale-95"
        }`}
      >
        {icon}
      </div>
      <span
        className={`text-[11px] font-medium ${
          disabled ? "text-fg-muted/60" : "text-fg-secondary"
        }`}
      >
        {label}
      </span>
    </div>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className="flex justify-center">
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex justify-center disabled:cursor-not-allowed"
    >
      {inner}
    </button>
  );
}

export function IconSend() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l14-7-7 14-2-5-5-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconReceive() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v13m0 0l-5-5m5 5l5-5M5 21h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconAdd() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconTrade() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7h13l-3-3m6 13H6l3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
