'use client';

import { calculate, type CalcInput, type CalcOutput, type Side } from '@klub/calc';
import { useMemo, useState } from 'react';

/**
 * /calculator - pre-trade math, minimalist.
 *
 * Single column. Direction toggle, four numeric inputs, plain-English
 * result. Warning surfaces inline when stop is past liquidation.
 *
 * Field-name notes: `@klub/calc`'s `CalcOutput` type uses
 * `requiredMargin`, `liquidationPrice`, and `rewardToRisk` - this page
 * previously referenced `initialMargin`, `liqPrice`, and `rrRatio`
 * respectively, which are undefined on the real output shape.
 * Calling `.toFixed(...)` on undefined was the runtime crash. Fixed.
 */

export default function CalculatorPage() {
  const [side, setSide] = useState<Side>('long');
  const [leverage, setLeverage] = useState(10);
  const [entryPrice, setEntryPrice] = useState(67_000);
  const [size, setSize] = useState(0.05);
  const [targetPrice, setTargetPrice] = useState<number | ''>(71_000);
  const [stopPrice, setStopPrice] = useState<number | ''>(64_500);

  const input: CalcInput = {
    side,
    leverage,
    entryPrice,
    size,
    ...(typeof targetPrice === 'number' ? { targetPrice } : {}),
    ...(typeof stopPrice === 'number' ? { stopPrice } : {}),
    maintenanceMarginFrac: 0.005,
    takerBps: 5,
    funding8hRate: 0.0001,
  };

  const result = useMemo<CalcOutput | null>(() => {
    try {
      return calculate(input);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, leverage, entryPrice, size, targetPrice, stopPrice]);

  // `stopBeyondLiq` - true when the chosen stop is worse than
  // liquidation, meaning the exchange liquidates before your stop
  // triggers. A common leverage-addled beginner mistake; we flag it
  // loudly with the red callout below.
  const stopBeyondLiq =
    result &&
    typeof stopPrice === 'number' &&
    ((side === 'long' && stopPrice < result.liquidationPrice) ||
      (side === 'short' && stopPrice > result.liquidationPrice));

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-md">
        <header>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            The Math
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Pre-trade sanity check - leverage, target, stop, liquidation.
          </p>
        </header>

        {/* Direction */}
        <div className="mt-8 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setSide('long');
            }}
            className={`rounded-klub border py-3 text-center text-[14px] font-medium transition-colors ${
              side === 'long'
                ? 'border-pnl-long bg-pnl-long/10 text-pnl-long'
                : 'border-border-subtle bg-bg-surface text-fg-secondary hover:border-border'
            }`}
          >
            Long
          </button>
          <button
            type="button"
            onClick={() => {
              setSide('short');
            }}
            className={`rounded-klub border py-3 text-center text-[14px] font-medium transition-colors ${
              side === 'short'
                ? 'border-pnl-short bg-pnl-short/10 text-pnl-short'
                : 'border-border-subtle bg-bg-surface text-fg-secondary hover:border-border'
            }`}
          >
            Short
          </button>
        </div>

        {/* Inputs */}
        <div className="mt-6 space-y-4">
          <Field label="Entry" value={entryPrice} onChange={setEntryPrice} step={10} />
          <Field label="Size" value={size} onChange={setSize} step={0.001} decimals={4} />
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                Leverage
              </span>
              <span className="font-mono text-[14px] text-accent">{leverage}×</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={0.5}
              value={leverage}
              onChange={(e) => {
                setLeverage(Number(e.target.value));
              }}
              className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
            />
          </div>
          <FieldOptional
            label="Target"
            value={targetPrice}
            onChange={setTargetPrice}
            step={10}
          />
          <FieldOptional label="Stop" value={stopPrice} onChange={setStopPrice} step={10} />
        </div>

        {/* Result */}
        {result && (
          <div className="mt-10 space-y-2.5 border-t border-border-subtle pt-6 font-mono text-[13px]">
            <Row label="Notional" value={`$${result.notional.toFixed(0)}`} />
            <Row label="Margin" value={`$${result.requiredMargin.toFixed(0)}`} />
            <Row
              label="Liquidation"
              value={`$${formatPrice(result.liquidationPrice)}`}
              tone="orange"
            />
            <Row
              label="Liq buffer"
              value={`${(result.liqBufferFrac * 100).toFixed(2)}%`}
              tone="orange"
            />
            {result.pnlAtTarget !== undefined && (
              <Row
                label="Target PnL"
                value={`${result.pnlAtTarget >= 0 ? '+' : '−'}$${Math.abs(result.pnlAtTarget).toFixed(2)}`}
                tone={result.pnlAtTarget >= 0 ? 'long' : 'short'}
              />
            )}
            {result.lossAtStop !== undefined && (
              <Row
                label="Stop loss"
                value={`−$${Math.abs(result.lossAtStop).toFixed(2)}`}
                tone="short"
              />
            )}
            {result.rewardToRisk !== undefined && (
              <Row label="R:R" value={`${result.rewardToRisk.toFixed(2)} : 1`} />
            )}
          </div>
        )}

        {stopBeyondLiq && (
          <div className="mt-6 rounded-klub border border-pnl-short/40 bg-pnl-short/5 p-4 text-[13px] leading-relaxed text-pnl-short">
            Your stop is past liquidation. The exchange liquidates you before the stop ever
            triggers. Tighten the stop or lower leverage.
          </div>
        )}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
  step,
  decimals,
}: {
  readonly label: string;
  readonly value: number;
  readonly onChange: (v: number) => void;
  readonly step?: number;
  readonly decimals?: number;
}) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step ?? 1}
        value={decimals !== undefined ? value.toFixed(decimals) : value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="mt-1.5 w-full rounded-klub border border-border bg-bg-surface px-3 py-2.5 font-mono text-[15px] text-fg-primary focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function FieldOptional({
  label,
  value,
  onChange,
  step,
}: {
  readonly label: string;
  readonly value: number | '';
  readonly onChange: (v: number | '') => void;
  readonly step?: number;
}) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
        {label} <span className="text-fg-dim">(optional)</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step ?? 1}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange('');
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="mt-1.5 w-full rounded-klub border border-border bg-bg-surface px-3 py-2.5 font-mono text-[15px] text-fg-primary focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'long' | 'short' | 'orange';
}) {
  const color =
    tone === 'long'
      ? 'text-pnl-long'
      : tone === 'short'
        ? 'text-pnl-short'
        : tone === 'orange'
          ? 'text-alert-orange'
          : 'text-fg-primary';
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-fg-muted">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}

function formatPrice(p: number): string {
  if (p < 1) return p.toFixed(4);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}