import type { ReactNode } from "react";

import { MARKETS } from "@/lib/markets";

export function maxLeverageFor(symbol: string): number {
  return MARKETS.find((m) => m.symbol === symbol)?.defaultLeverage ?? 10;
}

export function baseLabelFor(symbol: string): string {
  return (
    MARKETS.find((m) => m.symbol === symbol)?.label ??
    symbol.split("-")[0] ??
    symbol
  );
}

export function PanelHead({ children }: { readonly children: ReactNode }) {
  return (
    <div className="border-b border-white/[0.05] bg-white/[0.018] px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </div>
  );
}

export function formatPrice(p: number): string {
  if (!Number.isFinite(p) || p === 0) return "0.00";
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatUsd(n: number): string {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}
