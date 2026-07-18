import type { Side } from "@klub/calc";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------

/**
 * <CollapseRow /> - a tappable row that reveals its content inline
 * below. Used for Math + My trades on /trade so they sit one
 * tap away from the trade panel without forcing a scroll.
 */
export function CollapseRow({
  label,
  hint,
  open,
  onToggle,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="rounded-klub border border-border-subtle bg-bg-surface/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-bg-surface"
      >
        <span className="text-[12px] font-medium text-fg-secondary">
          {label}
        </span>
        <span className="flex items-center gap-2 text-[10px] text-fg-muted">
          {hint && <span className="truncate">{hint}</span>}
          <span aria-hidden className="text-[10px]">
            {open ? "▲" : "▼"}
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-border-subtle px-3.5 py-3.5">
          {children}
        </div>
      )}
    </div>
  );
}

export function SafetyPreview({
  direction,
  marketLabel,
  maxLossUsd,
  targetPnlUsd,
  liqMovePct,
  stopPct,
  targetPct,
}: {
  readonly direction: Side;
  readonly marketLabel: string;
  readonly maxLossUsd: number;
  readonly targetPnlUsd: number;
  readonly liqMovePct: number;
  readonly stopPct: number;
  readonly targetPct: number;
}) {
  return (
    <div className="mt-3 rounded-klub-lg border border-border-subtle bg-bg-surface/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Safety check
          </div>
          <div className="mt-0.5 text-[12px] text-fg-secondary">
            {direction === "long" ? "Buying" : "Selling"} {marketLabel}
          </div>
        </div>
        <div className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[10px] text-accent">
          Review first
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-klub border border-border-subtle bg-bg-base/40 px-2 py-2">
          <div className="text-[10px] text-fg-muted">Max loss</div>
          <div className="mt-0.5 font-mono text-[13px] text-pnl-short">
            −${maxLossUsd.toFixed(0)}
          </div>
          <div className="mt-0.5 text-[9px] text-fg-muted">
            {stopPct.toFixed(1)}% stop
          </div>
        </div>
        <div className="rounded-klub border border-border-subtle bg-bg-base/40 px-2 py-2">
          <div className="text-[10px] text-fg-muted">Target</div>
          <div className="mt-0.5 font-mono text-[13px] text-pnl-long">
            +${targetPnlUsd.toFixed(0)}
          </div>
          <div className="mt-0.5 text-[9px] text-fg-muted">
            {targetPct.toFixed(1)}% take
          </div>
        </div>
        <div className="rounded-klub border border-border-subtle bg-bg-base/40 px-2 py-2">
          <div className="text-[10px] text-fg-muted">Liq. buffer</div>
          <div className="mt-0.5 font-mono text-[13px] text-alert-orange">
            {liqMovePct.toFixed(1)}%
          </div>
          <div className="mt-0.5 text-[9px] text-fg-muted">adverse move</div>
        </div>
      </div>
    </div>
  );
}

export function TradeMath({
  targetPct,
  stopPct,
  targetUsd,
  lossUsd,
  liqMovePct,
  notional,
  leverage,
}: {
  readonly targetPct: number;
  readonly stopPct: number;
  readonly targetUsd: number;
  readonly lossUsd: number;
  readonly liqMovePct: number;
  readonly notional: number;
  readonly leverage: number;
}) {
  const rows = [
    [
      "Target",
      `+${targetPct.toFixed(1)}%`,
      `+$${Math.abs(targetUsd).toFixed(0)}`,
      "text-pnl-long",
    ],
    [
      "Stop",
      `−${stopPct.toFixed(1)}%`,
      `−$${lossUsd.toFixed(0)}`,
      "text-pnl-short",
    ],
    [
      "Liquidation",
      "",
      `${liqMovePct.toFixed(1)}% adverse`,
      "text-alert-orange",
    ],
    ["Notional", "", `$${notional.toFixed(0)}`, "text-fg-primary"],
    ["Leverage", "", `${leverage}×`, "text-accent"],
  ] as const;
  return (
    <div className="space-y-3 text-[13px] leading-relaxed">
      {rows.map(([label, detail, value, tone]) => (
        <div key={label} className="flex items-baseline justify-between">
          <span className="text-fg-muted">
            {label}
            {detail ? ` (${detail})` : ""}
          </span>
          <span className={`font-mono ${tone}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * <PercentField /> - labeled percent input for take-profit / stop-loss.
 * Tone tints the value column green (long-side gain) or red (loss).
 * Suffix shows the live dollar P/L derived from the percent so the
 * user sees what each notch actually means in cash.
 */
export function PercentField({
  label,
  value,
  onChange,
  tone,
  suffix,
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly tone: "long" | "short";
  readonly suffix: string;
}) {
  const ringTone =
    tone === "long"
      ? "border-pnl-long/30 focus-within:border-pnl-long"
      : "border-pnl-short/30 focus-within:border-pnl-short";
  const valueTone = tone === "long" ? "text-pnl-long" : "text-pnl-short";
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
        {label}
      </span>
      <div
        className={`mt-1 flex items-center rounded-klub border bg-bg-surface px-3 py-2.5 ${ringTone}`}
      >
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.5}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 0) onChange(n);
          }}
          className={`w-full bg-transparent font-mono text-[18px] font-semibold outline-none ${valueTone}`}
        />
        <span className={`ml-1 font-mono text-[14px] ${valueTone}`}>%</span>
      </div>
      <div className={`mt-1 text-right font-mono text-[11px] ${valueTone}`}>
        {suffix}
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------

/**
 * <MarketPicker /> - compact dropdown for selecting the market.
 *
 * Closed state: a single button showing the current market's ticker
 * label + live price, plus a chevron indicating it's expandable.
 *
 * Open state: panel below the button with every market in the list,
 * each row showing label + live price. Clicking a row selects and
 * closes.
 *
 * Dismisses on outside click, Escape key, or selection. The panel is
 * positioned absolute so it overlays whatever's below without
 * reflowing the form - important because the Amount slider sits
 * immediately below this picker and we don't want it jumping on open.
 *
 * Scrolls internally (`max-h-64 overflow-y-auto`) so it works for
 * future lists of 20+ markets without pushing the form offscreen.
 */
export function MarketPicker<
  T extends {
    readonly symbol: string;
    readonly label: string;
    readonly seedPrice: number;
  },
>({
  markets,
  selected,
  onSelect,
  livePrices,
}: {
  readonly markets: readonly T[];
  readonly selected: T;
  readonly onSelect: (m: T) => void;
  readonly livePrices: Record<string, { readonly mark: number } | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouse(e: MouseEvent) {
      if (!rootRef.current) return;
      if (e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDocMouse);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDocMouse);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selectedPrice = livePrices[selected.symbol]?.mark ?? selected.seedPrice;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between rounded-klub border border-border-subtle bg-bg-surface px-4 py-3 text-left transition-colors hover:border-border"
      >
        <div className="flex items-baseline gap-3">
          <span className="text-[15px] font-semibold text-fg-primary">
            {selected.label}
          </span>
          <span className="font-mono text-[12px] text-fg-muted">
            ${formatMarketPrice(selectedPrice, selected.seedPrice)}
          </span>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`text-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path
            d="M2 4l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-klub border border-border bg-bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        >
          {markets.map((m) => {
            const active = m.symbol === selected.symbol;
            const price = livePrices[m.symbol]?.mark ?? m.seedPrice;
            return (
              <button
                key={m.symbol}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onSelect(m);
                  setOpen(false);
                }}
                className={`flex w-full items-baseline justify-between px-4 py-2.5 text-left transition-colors ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-fg-primary hover:bg-bg-base"
                }`}
              >
                <span
                  className={`text-[14px] font-medium ${active ? "text-accent" : ""}`}
                >
                  {m.label}
                </span>
                <span className="font-mono text-[11px] text-fg-muted">
                  ${formatMarketPrice(price, m.seedPrice)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Price formatting rule: more decimal precision for low-priced assets
 * (FARTCOIN, DOGE) so a 4-cent move on a $1 asset shows up; fewer
 * decimals for BTC/GOLD where 4 digits past the decimal would be
 * noise. We key off the seed price because the live price can briefly
 * flip around during thin periods.
 */
function formatMarketPrice(live: number, seed: number): string {
  const max = seed < 10 ? 4 : 2;
  return live.toLocaleString(undefined, { maximumFractionDigits: max });
}

// ---------------------------------------------------------------------------
