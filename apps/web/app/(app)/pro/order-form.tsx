import Link from "next/link";
import { useEffect, useState } from "react";

import { useBulkOrder } from "@/hooks/use-bulk-order";
import type { SubmitOrderResult } from "@/lib/bulk/orders";

import { baseLabelFor, formatPrice, maxLeverageFor, PanelHead } from "./utils";

export function PanelOrderForm({
  symbol,
  mark,
  connected,
  onResult,
}: {
  readonly symbol: string;
  readonly mark: number;
  readonly connected: boolean;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [type, setType] = useState<"limit" | "market">("limit");
  const [tif, setTif] = useState<"GTC" | "IOC" | "ALO">("GTC");
  const [price, setPrice] = useState(mark > 0 ? mark : 0);
  const [size, setSize] = useState(0.01);
  const [lev, setLev] = useState(5);
  const [reduceOnly, setReduceOnly] = useState(false);
  // TP/SL price targets. Optional — when 0/undefined the order ships
  // without bracket legs. UI shows them as preview today; auto-
  // execution as reduce-only follow-up orders is wired separately
  // (the user can also Close manually from the Positions panel).
  const [tpPrice, setTpPrice] = useState(0);
  const [slPrice, setSlPrice] = useState(0);

  const { submit, state, usingAgent } = useBulkOrder();

  const maxLev = maxLeverageFor(symbol);

  // Reset price + clamp leverage when the symbol changes. Also reset
  // TP/SL since their numeric values are tied to the prior symbol's
  // price scale.
  useEffect(() => {
    if (mark > 0) setPrice(mark);
    setLev((cur) => Math.min(cur, maxLeverageFor(symbol)));
    setTpPrice(0);
    setSlPrice(0);
  }, [symbol, mark]);

  const refPx = type === "limit" ? price : mark;
  const notional = size * refPx;
  const margin = lev > 0 ? notional / lev : 0;
  const hasMarketPrice = mark > 0 && Number.isFinite(mark);

  async function onSubmit() {
    if (!connected) {
      onResult({
        ok: false,
        reason: "rejected_invalid",
        message: "Connect a wallet first.",
      });
      return;
    }
    if (!hasMarketPrice || refPx <= 0) {
      onResult({
        ok: false,
        reason: "rejected_invalid",
        message: "Waiting for a live Bulk price before submitting.",
      });
      return;
    }
    if (state.status === "submitting") return;
    const req = {
      symbol,
      side,
      orderType: type,
      size,
      ...(type === "limit" ? { price, timeInForce: tif } : {}),
      ...(reduceOnly ? { reduceOnly: true } : {}),
    };
    const r = await submit(req);
    onResult(r);

    // Bracket legs — fire native TP + SL conditionals after the main fills.
    // Failures don't unwind the main; user gets a separate result for
    // each leg via the same modal pipe.
    if (!r.ok) return;
    const closeSide: "long" | "short" = side === "long" ? "short" : "long";
    if (tpPrice > 0 && Number.isFinite(tpPrice)) {
      const tp = await submit({
        symbol,
        side: closeSide,
        orderType: "trigger",
        size,
        triggerPrice: tpPrice,
        tpSl: "tp",
        reduceOnly: true,
      });
      if (!tp.ok) onResult(tp);
    }
    if (slPrice > 0 && Number.isFinite(slPrice)) {
      const sl = await submit({
        symbol,
        side: closeSide,
        orderType: "trigger",
        size,
        triggerPrice: slPrice,
        tpSl: "sl",
        reduceOnly: true,
      });
      if (!sl.ok) onResult(sl);
    }
  }

  const submitting = state.status === "submitting";
  const buttonLabel = !connected
    ? "Connect wallet"
    : !hasMarketPrice
      ? "Waiting for Bulk price"
      : submitting
        ? usingAgent
          ? "Submitting…"
          : "Sign in wallet…"
        : `${side === "long" ? "Buy" : "Sell"} ${baseLabelFor(symbol)} · ${type}`;

  return (
    <section className="pro-panel flex flex-col overflow-hidden">
      <PanelHead>
        <div className="flex items-center justify-between">
          <span>Order · {symbol}</span>
          {usingAgent && <span className="text-accent">Agent · silent</span>}
        </div>
      </PanelHead>
      <div className="flex-1 space-y-2 overflow-auto p-3">
        <div className="rounded-klub border border-accent/20 bg-accent/5 px-3 py-2 text-[11px] leading-relaxed text-fg-secondary">
          Advanced entry. Newer users should use{" "}
          <Link href="/trade" className="text-accent hover:text-accent-strong">
            Simple Trade
          </Link>
          .
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-klub border border-border">
          <button
            onClick={() => setSide("long")}
            className={`py-2 text-[12px] font-medium transition-colors ${
              side === "long"
                ? "bg-pnl-long/15 text-pnl-long"
                : "text-fg-secondary hover:text-fg-primary"
            }`}
          >
            Long
          </button>
          <button
            onClick={() => setSide("short")}
            className={`border-l border-border py-2 text-[12px] font-medium transition-colors ${
              side === "short"
                ? "bg-pnl-short/15 text-pnl-short"
                : "text-fg-secondary hover:text-fg-primary"
            }`}
          >
            Short
          </button>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-klub border border-border">
          {(["limit", "market"] as const).map((t, i) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`${i === 1 ? "border-l border-border" : ""} py-1.5 text-[11px] font-medium transition-colors ${
                type === t
                  ? "bg-accent/15 text-accent"
                  : "text-fg-secondary hover:text-fg-primary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {type === "limit" && (
          <ProField
            label="Price"
            value={price}
            onChange={setPrice}
            suffix="USD"
            decimals={2}
          />
        )}
        <ProField
          label="Size"
          value={size}
          onChange={setSize}
          suffix={baseLabelFor(symbol)}
          step={0.001}
          decimals={4}
        />

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
              Leverage · max {maxLev}×
            </span>
            <span className="font-mono text-[14px] text-accent">{lev}×</span>
          </div>
          <input
            type="range"
            min={1}
            max={maxLev}
            step={0.5}
            value={lev}
            onChange={(e) => setLev(Number(e.target.value))}
            className="mt-1.5 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#f3ba2f]"
          />
        </div>

        {type === "limit" && (
          <div className="grid grid-cols-3 overflow-hidden rounded-klub border border-border-subtle">
            {(["GTC", "IOC", "ALO"] as const).map((t, i) => (
              <button
                key={t}
                type="button"
                onClick={() => setTif(t)}
                className={`${i > 0 ? "border-l border-border-subtle" : ""} py-1 text-[10px] font-medium transition-colors ${
                  tif === t
                    ? "bg-bg-elevated text-fg-primary"
                    : "text-fg-muted hover:text-fg-primary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Optional bracket — TP / SL prices. Display only for now;
            auto-execution as reduce-only follow-up orders is a
            separate slice. The user can Close manually from the
            Positions panel until then. */}
        <div className="grid grid-cols-2 gap-2">
          <ProField
            label="Take profit"
            value={tpPrice}
            onChange={setTpPrice}
            suffix="USD"
            decimals={2}
          />
          <ProField
            label="Stop loss"
            value={slPrice}
            onChange={setSlPrice}
            suffix="USD"
            decimals={2}
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-fg-secondary">
          <input
            type="checkbox"
            checked={reduceOnly}
            onChange={(e) => setReduceOnly(e.target.checked)}
            className="h-3.5 w-3.5 cursor-pointer accent-accent"
          />
          Reduce only
        </label>

        {/* Notional / margin readout — promoted above the submit so
            the user sees the live numbers WHILE adjusting size and
            leverage. Notional is what the position controls; margin
            is what the user actually puts up; these update on every
            input change. */}
        <div className="rounded-klub border border-accent/30 bg-accent/5 px-3 py-2">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 font-mono text-[12px]">
            <span className="text-fg-muted">Notional</span>
            <span className="truncate text-right text-[13px] font-semibold text-fg-primary">
              ${notional.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 font-mono text-[12px]">
            <span className="text-fg-muted">Margin</span>
            <span className="truncate text-right text-[13px] font-semibold text-accent">
              ${margin.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 font-mono text-[11px] text-fg-muted">
            <span>Mark</span>
            <span className="truncate text-right">
              {hasMarketPrice ? `$${formatPrice(mark)}` : "waiting"}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !hasMarketPrice}
          className={`btn-block py-2.5 text-[13px] font-medium disabled:opacity-50 ${
            side === "long" ? "btn-primary" : "btn-danger"
          }`}
        >
          {buttonLabel}
        </button>

        {(tpPrice > 0 || slPrice > 0) && (
          <p className="text-[10px] leading-relaxed text-fg-muted">
            TP/SL fire as reduce-only legs after the main order fills. Stop-loss
            uses Bulk&rsquo;s trigger order; if Bulk rejects the shape, the
            toast shows the reason and you can close manually from the Positions
            panel.
          </p>
        )}
      </div>
    </section>
  );
}

function ProField({
  label,
  value,
  onChange,
  suffix,
  step = 0.01,
  decimals,
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly suffix?: string;
  readonly step?: number;
  readonly decimals?: number;
}) {
  // Mirrors the /trade NumField pattern: while focused, show the user's
  // raw text via `draft` state so toFixed() doesn't append zeros and
  // fight keystrokes. On blur, reformat to canonical form.
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const display = focused
    ? draft
    : decimals !== undefined
      ? value.toFixed(decimals)
      : String(value);

  return (
    <div>
      <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
        {label}
      </span>
      <div className="relative mt-1">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={display}
          onFocus={(e) => {
            setFocused(true);
            setDraft(e.target.value);
            requestAnimationFrame(() => e.target.select());
          }}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-full rounded-klub border border-border bg-bg-surface px-2.5 py-1.5 pr-12 font-mono text-[12px] text-fg-primary focus:border-accent focus:outline-none"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
