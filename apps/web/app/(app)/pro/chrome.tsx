import { useEffect, useMemo, useRef, useState } from "react";

import { useBulkAccount } from "@/hooks/use-bulk-account";
import { useConnectionState } from "@/hooks/use-connection-state";
import type { LivePrice } from "@/hooks/use-tickers";
import { MARKETS } from "@/lib/markets";

import { formatPrice, formatUsd } from "./utils";

export function ProHeader({
  symbol,
  mark,
  onOpenPalette,
}: {
  readonly symbol: string;
  readonly mark: number;
  readonly onOpenPalette: () => void;
}) {
  // The desktop sidebar handles left-side clearance via the
  // (app)/layout.tsx `md:pl-20` wrapper, so this header only needs to
  // reserve room on the right for the layout-shell wallet pill (the
  // WalletButton). px-6 / md:pr-[20rem] does that.
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] bg-bg-base/90 pl-5 pr-72 backdrop-blur md:pr-[20rem]">
      <div className="flex min-w-0 items-center gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
            Advanced · Klub Pro
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 font-mono">
            <span className="text-[14px] text-fg-primary">{symbol}</span>
            <span className="text-[13px] text-fg-muted">
              {mark > 0 ? `$${formatPrice(mark)}` : "waiting for Bulk"}
            </span>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex shrink-0 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-[12px] text-fg-muted transition-colors hover:border-white/15 hover:bg-white/[0.07] hover:text-fg-primary"
      >
        <span>Search markets</span>
        <kbd className="rounded-full border border-white/[0.08] bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>
    </header>
  );
}

export function ProMarketStrip({
  symbol,
  onSelect,
  livePrices,
}: {
  readonly symbol: string;
  readonly onSelect: (s: string) => void;
  readonly livePrices: Record<string, LivePrice | undefined>;
}) {
  return (
    <div className="grid h-[58px] shrink-0 grid-cols-5 gap-2 overflow-hidden border-b border-white/[0.04] bg-bg-base px-2 py-1.5">
      {MARKETS.slice(0, 5).map((market) => {
        const live = livePrices[market.symbol];
        const mark = live?.mark ?? null;
        const change = live?.change24hPct;
        const active = market.symbol === symbol;
        const tone =
          change === undefined
            ? "text-fg-muted"
            : change >= 0
              ? "text-pnl-long"
              : "text-pnl-short";
        return (
          <button
            key={market.symbol}
            type="button"
            onClick={() => onSelect(market.symbol)}
            className={`min-w-0 overflow-hidden rounded-xl border px-3 text-left transition-colors ${
              active
                ? "border-accent/50 bg-accent/10"
                : "border-white/[0.06] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]"
            }`}
          >
            <div className="flex items-baseline justify-between gap-3 font-mono">
              <span
                className={
                  active
                    ? "text-[12px] text-accent"
                    : "text-[12px] text-fg-primary"
                }
              >
                {market.label}
              </span>
              <span className={`text-[11px] ${tone}`}>
                {change === undefined
                  ? "-"
                  : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-[13px] text-fg-secondary">
              {mark === null ? "-" : `$${formatPrice(mark)}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ProStatusBar({
  accountState,
  connected,
  onOpenPalette,
}: {
  readonly accountState: ReturnType<typeof useBulkAccount>["state"];
  readonly connected: boolean;
  readonly onOpenPalette: () => void;
}) {
  const { isLive, isDemo, isReconnecting } = useConnectionState();

  const equity = accountState.data?.equityUsd ?? null;
  const free = accountState.data?.freeMarginUsd ?? null;
  const used =
    equity !== null && free !== null ? Math.max(equity - free, 0) : null;

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-4 overflow-hidden border-t border-white/[0.06] bg-bg-base px-3 font-mono text-[10px] text-fg-muted">
      <div className="flex min-w-0 items-center gap-4 overflow-hidden whitespace-nowrap">
        {isReconnecting ? (
          <span className="flex items-center gap-2 text-alert-orange">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-alert-orange" />
            Reconnecting
          </span>
        ) : isLive ? (
          <span className="flex items-center gap-2 text-pnl-long">
            <span className="h-1.5 w-1.5 animate-pulse-accent rounded-full bg-pnl-long" />
            Live
          </span>
        ) : isDemo ? (
          <span
            className="flex items-center gap-2"
            title="REST ticker snapshots active; Bulk WS is not configured."
          >
            <span className="h-1.5 w-1.5 rounded-full bg-fg-muted" />
            REST only
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-fg-muted" />
            Idle
          </span>
        )}
        <span>{connected ? "Wallet connected" : "Wallet disconnected"}</span>
        <span>Equity {equity !== null ? `$${formatUsd(equity)}` : "-"}</span>
        <span>Used {used !== null ? `$${formatUsd(used)}` : "-"}</span>
        <span>Free {free !== null ? `$${formatUsd(free)}` : "-"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button type="button" onClick={onOpenPalette} className="text-accent">
          ⌘K
        </button>
        <span>v0.2.0</span>
      </div>
    </footer>
  );
}

export function CommandPalette({
  livePrices,
  onClose,
  onSymbol,
}: {
  readonly livePrices: Record<string, LivePrice | undefined>;
  readonly onClose: () => void;
  readonly onSymbol: (s: string) => void;
}) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo(
    () => [
      ...MARKETS.map((m) => {
        const live = livePrices[m.symbol]?.mark ?? null;
        return {
          id: `sym-${m.symbol}`,
          label: `Go to ${m.symbol}`,
          hint: live === null ? "waiting" : `$${formatPrice(live)}`,
          run: () => onSymbol(m.symbol),
        };
      }),
      {
        id: "nav-quick",
        label: "Open Trade",
        hint: "/trade",
        run: () => {
          window.location.href = "/trade";
        },
      },
      {
        id: "nav-home",
        label: "Go to Portfolio",
        hint: "/portfolio",
        run: () => {
          window.location.href = "/portfolio";
        },
      },
      {
        id: "nav-follow",
        label: "Browse leaders",
        hint: "/copy",
        run: () => {
          window.location.href = "/copy";
        },
      },
      {
        id: "nav-health",
        label: "Account health",
        hint: "/health",
        run: () => {
          window.location.href = "/health";
        },
      },
      {
        id: "nav-ramp",
        label: "Add funds",
        hint: "/cash/add",
        run: () => {
          window.location.href = "/cash/add";
        },
      },
    ],
    [livePrices, onSymbol],
  );

  const filtered = q
    ? commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()))
    : commands.slice(0, 12);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-bg-base/70 p-4 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-klub-lg border border-border bg-bg-surface shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={q}
          placeholder="Search markets, run commands…"
          onChange={(e) => setQ(e.target.value)}
          className="w-full border-b border-border-subtle bg-transparent px-4 py-4 text-[15px] text-fg-primary outline-none placeholder:text-fg-muted"
        />
        <div className="max-h-[50vh] overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-fg-muted">
              No matches.
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => c.run()}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left font-mono text-[13px] transition-colors hover:bg-bg-elevated"
              >
                <span className="text-fg-primary">{c.label}</span>
                <span className="text-[11px] text-fg-muted">{c.hint}</span>
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2 font-mono text-[10px] text-fg-muted">
          <span>↵ run · esc close</span>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  );
}
