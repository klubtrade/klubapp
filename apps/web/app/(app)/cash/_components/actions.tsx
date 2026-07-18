"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CandlestickChart,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";

// =============================================================================
// Action buttons - Revolut/Venmo-style icon circles
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
        className={`flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent transition-all sm:h-14 sm:w-14 ${
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
  return <ArrowUpRight size={22} strokeWidth={1.7} aria-hidden />;
}

export function IconReceive() {
  return <ArrowDownToLine size={22} strokeWidth={1.7} aria-hidden />;
}

export function IconAdd() {
  return <Plus size={22} strokeWidth={1.8} aria-hidden />;
}

export function IconTrade() {
  return <CandlestickChart size={22} strokeWidth={1.7} aria-hidden />;
}
