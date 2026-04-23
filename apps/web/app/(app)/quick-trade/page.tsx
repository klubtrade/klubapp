'use client';

import { calculate, type Side } from '@klub/calc';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

import { useBulkAccount, type BulkPosition, type BulkOpenOrder } from '@/hooks/use-bulk-account';
import { useBulkCancel } from '@/hooks/use-bulk-cancel';
import { useBulkOrder } from '@/hooks/use-bulk-order';
import { useTickers } from '@/hooks/use-tickers';
import { useToast } from '@/components/toast';
import { useWalletGate } from '@/hooks/use-wallet-gate';
import { RISK_PRESETS, useUserPrefs } from '@/lib/user-prefs';
import type { SubmitOrderResult } from '@/lib/bulk/orders';
import { MARKETS } from '@/lib/markets';

/**
 * /quick-trade — minimalist 3-tap trade.
 *
 * Desktop (lg+):
 *   ┌──────────────┬──────────────────────┬──────────────────┐
 *   │   The Math   │  Direction (↗/↘)     │   Your trades    │
 *   │              │  Market picker       │   • BTC long +$12│
 *   │  Target PnL  │  Amount slider       │   • SOL long −$3 │
 *   │  Stop loss   │  Leverage slider     │                  │
 *   │  Liq move    │  Submit              │   Waiting orders │
 *   │  Leverage    │                      │   • ETH lim [x]  │
 *   │  Notional    │                      │                  │
 *   └──────────────┴──────────────────────┴──────────────────┘
 *
 * Mobile (<lg): single column, original stacked flow. Math stays
 * behind a "Show math" disclosure to save vertical space; on
 * desktop it's always visible since we have the horizontal room.
 *
 * Why the reshuffle:
 *   - On desktop, the old layout left ~60% of the viewport empty
 *     below the fold. Leverage was nowhere to be found (hardcoded
 *     from user prefs). Math required an extra click.
 *   - Now leverage is inline with the form, math is always visible
 *     as context, and positions/orders sit next to the form rather
 *     than scrolled off.
 *   - Mobile behavior is unchanged — this is a desktop-only
 *     enhancement that collapses cleanly on small screens.
 *
 * Max leverage is market-specific (pulled from the Market record).
 * Some markets cap at 10× (DOGE), others at 50× (BTC). The slider's
 * max updates when the user switches markets; if the current value
 * exceeds the new cap, we clamp it down.
 */

// Fallback when the wallet isn't connected or Bulk's /account hasn't
// returned yet. Real equity comes from the Bulk account snapshot below
// so size math reflects the user's actual deposited collateral.
const FALLBACK_EQUITY = 5_000;

export default function QuickTradePage() {
  const { prefs, ready } = useUserPrefs();
  const toast = useToast();
  const riskPreset = RISK_PRESETS[prefs.riskProfile];

  // Wallet + account context.
  const wallet = useWallet();
  const { connected, mounted, promptConnect } = useWalletGate();
  const { state: accountState, refresh: refreshAccount } = useBulkAccount(
    connected && wallet.publicKey ? wallet.publicKey.toBase58() : null,
  );
  const equityUsd = accountState.data?.equityUsd ?? FALLBACK_EQUITY;
  const positions = accountState.data?.positions ?? [];
  const openOrders = accountState.data?.openOrders ?? [];

  // Order submission hook — same as /trade.
  const { state: orderState, submit } = useBulkOrder();

  const [direction, setDirection] = useState<Side>('long');
  const [market, setMarket] = useState<(typeof MARKETS)[number]>(MARKETS[0]);
  const [amountPct, setAmountPct] = useState(10);
  const [confirming, setConfirming] = useState(false);
  const [leverage, setLeverage] = useState(5);
  const [showMath, setShowMath] = useState(false);
  const [resultModal, setResultModal] = useState<SubmitOrderResult | null>(null);

  const allSymbols = useMemo(() => MARKETS.map((m) => m.symbol), []);
  const livePrices = useTickers(allSymbols);
  const livePrice = livePrices[market.symbol]?.mark ?? market.seedPrice;

  useEffect(() => {
    if (ready) setLeverage(riskPreset.defaultLeverage);
  }, [ready, riskPreset.defaultLeverage]);

  // Clamp leverage to the selected market's cap. If the user had
  // 50× on BTC and switched to DOGE (10× cap), the slider would
  // otherwise stay at 50 and send an invalid order.
  //
  // Field-naming note: `markets.ts` calls this `defaultLeverage` but
  // in practice we use it as the per-market cap (BTC/ETH/SOL = 50,
  // DOGE = 10, etc). This matches Bulk's testnet max-leverage caps
  // so it's numerically correct; the field should probably be
  // renamed to `maxLeverage` in a Week-2 cleanup pass for clarity.
  useEffect(() => {
    if (leverage > market.defaultLeverage) {
      setLeverage(market.defaultLeverage);
    }
    // Intentionally only re-runs when market changes — if the user
    // explicitly sets a higher leverage on the same market, we
    // respect that (the slider's `max` prop already prevents it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market.symbol, market.defaultLeverage]);

  // `amountUsd` is the user's collateral risked (amountPct of real
  // equity). Notional = amountUsd × leverage. Base size = notional ÷
  // live price. Bulk expects base-asset size on the wire; we submit
  // sizeBase below.
  const amountUsd = (equityUsd * amountPct) / 100;
  const notional = amountUsd * leverage;
  const sizeBase = livePrice > 0 ? notional / livePrice : 0;
  const stopDistancePct = riskPreset.defaultStopDistancePct;
  const stopPrice =
    direction === 'long'
      ? livePrice * (1 - stopDistancePct / 100)
      : livePrice * (1 + stopDistancePct / 100);
  const targetPrice =
    direction === 'long'
      ? livePrice * (1 + (stopDistancePct * 2) / 100)
      : livePrice * (1 - (stopDistancePct * 2) / 100);

  const result = useMemo(() => {
    try {
      return calculate({
        side: direction,
        leverage,
        entryPrice: livePrice,
        size: sizeBase,
        targetPrice,
        stopPrice,
        maintenanceMarginFrac: 0.005,
        takerBps: 5,
        funding8hRate: 0.0001,
      });
    } catch {
      return null;
    }
  }, [direction, leverage, livePrice, sizeBase, targetPrice, stopPrice]);

  const liqMovePct = result ? result.liqBufferFrac * 100 : 0;
  const wouldMake = result?.pnlAtTarget ?? 0;
  const couldLose = Math.abs(result?.lossAtStop ?? 0);

  // Submit uses `market` order type. Quick Trade's philosophy is
  // "just take the price now" — limit pricing is an advanced concern
  // surfaced on /trade. TP/SL are shown in the confirm modal so the
  // user understands where risk caps are, but they are NOT sent to
  // Bulk yet — bracket orders require the `range` action type
  // (Week 2 per bulk-integration-notes).
  async function handleConfirm() {
    setConfirming(false);

    if (!mounted) return;
    if (!connected) {
      promptConnect();
      return;
    }
    if (sizeBase <= 0 || !Number.isFinite(sizeBase)) {
      toast.error('Invalid size');
      return;
    }

    const outcome = await submit({
      symbol: market.symbol,
      side: direction,
      orderType: 'market',
      size: sizeBase,
    });
    setResultModal(outcome);
  }

  if (!ready) {
    return (
      <main className="min-h-screen px-6 pt-28">
        <div className="mx-auto max-w-md text-fg-muted">Loading…</div>
      </main>
    );
  }

  // Math panel content — rendered in two places: always-visible in
  // the left column on desktop, and behind a "Show math" disclosure
  // on mobile. Extracted so the two sites stay in sync automatically.
  const mathContent = (
    <div className="space-y-3 text-[13px] leading-relaxed">
      <div className="flex items-baseline justify-between">
        <span className="text-fg-muted">Target (+{(stopDistancePct * 2).toFixed(0)}%)</span>
        <span className="font-mono text-pnl-long">+${Math.abs(wouldMake).toFixed(0)}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-fg-muted">Stop (−{stopDistancePct.toFixed(0)}%)</span>
        <span className="font-mono text-pnl-short">−${couldLose.toFixed(0)}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-fg-muted">Liquidation at</span>
        <span className="font-mono text-alert-orange">{liqMovePct.toFixed(1)}% adverse</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-fg-muted">Notional</span>
        <span className="font-mono text-fg-primary">${notional.toFixed(0)}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-fg-muted">Leverage</span>
        <span className="font-mono text-accent">{leverage}×</span>
      </div>
    </div>
  );

  // "Your trades" + "Waiting orders" — extracted to a fragment so it
  // can render in the right column on desktop and below the form on
  // mobile, without duplicating the logic.
  const tradesContent = (
    <>
      {positions.length > 0 && (
        <div>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-fg-muted">
            Your trades
          </h2>
          <div className="space-y-2">
            {positions.map((p) => (
              <TradeCard
                key={p.symbol}
                position={p}
                livePrice={livePrices[p.symbol]?.mark ?? p.fairPrice}
                onAfterClose={refreshAccount}
                onResult={setResultModal}
              />
            ))}
          </div>
        </div>
      )}

      {openOrders.length > 0 && (
        <div className={positions.length > 0 ? 'mt-6' : ''}>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-fg-muted">
            Waiting orders
          </h2>
          <div className="space-y-2">
            {openOrders.map((o) => (
              <WaitingOrderCard
                key={o.orderId || `${o.symbol}-${o.price}-${o.sizeBase}`}
                order={o}
                onAfterCancel={refreshAccount}
                onResult={setResultModal}
              />
            ))}
          </div>
        </div>
      )}

      {positions.length === 0 && openOrders.length === 0 && (
        <div className="rounded-klub border border-dashed border-border-subtle p-6 text-center text-[12px] text-fg-muted">
          No open trades yet.
          <br />
          Your positions will show up here.
        </div>
      )}
    </>
  );

  return (
    <main className="min-h-screen">
      {/* Desktop: 3-column grid at lg+. Mobile: single column.
          max-w-6xl gives each column ~360-380px of breathing room
          at the lg breakpoint. Padding-top clears the global chrome
          (wallet button top-right, hamburger top-left). */}
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-28 md:pt-32">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(360px,420px)_1fr] lg:gap-8">
          {/* LEFT COLUMN (desktop only) — The Math, always visible.
              Hidden on mobile since the disclosure below renders
              the same content on small screens. */}
          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
              <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
                The Math
              </div>
              {mathContent}
            </div>
          </aside>

          {/* CENTER COLUMN — the trade form. Same content as before
              plus a new leverage slider under the amount input. */}
          <section>
            {/* Direction */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDirection('long');
                }}
                className={`rounded-klub-lg border px-4 py-6 text-center transition-colors ${
                  direction === 'long'
                    ? 'border-pnl-long bg-pnl-long/10 text-pnl-long'
                    : 'border-border-subtle bg-bg-surface text-fg-secondary hover:border-border'
                }`}
              >
                <div className="text-2xl leading-none">↗</div>
                <div className="mt-2 text-[15px] font-semibold">Up</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirection('short');
                }}
                className={`rounded-klub-lg border px-4 py-6 text-center transition-colors ${
                  direction === 'short'
                    ? 'border-pnl-short bg-pnl-short/10 text-pnl-short'
                    : 'border-border-subtle bg-bg-surface text-fg-secondary hover:border-border'
                }`}
              >
                <div className="text-2xl leading-none">↘</div>
                <div className="mt-2 text-[15px] font-semibold">Down</div>
              </button>
            </div>

            {/* Market picker */}
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                Select asset
              </div>
              <MarketPicker
                markets={MARKETS}
                selected={market}
                onSelect={(m) => {
                  setMarket(m);
                }}
                livePrices={livePrices}
              />
            </div>

            {/* Amount */}
            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[32px] font-semibold text-accent">
                  ${amountUsd.toFixed(0)}
                </span>
                <span className="text-[12px] text-fg-muted">{amountPct}% of account</span>
              </div>
              <input
                type="range"
                min={1}
                max={50}
                step={1}
                value={amountPct}
                onChange={(e) => {
                  setAmountPct(Number(e.target.value));
                }}
                className="mt-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
              />
            </div>

            {/* Leverage — new slider, matches /trade's style.
                `max` reflects the selected market's cap (BTC 50×,
                DOGE 10×, etc), so the slider can never pick a
                leverage Bulk would reject. The clamp effect above
                handles market switches. */}
            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                  Leverage
                </span>
                <span className="font-mono text-[15px] text-accent">{leverage}×</span>
              </div>
              <input
                type="range"
                min={1}
                max={market.defaultLeverage}
                step={0.5}
                value={leverage}
                onChange={(e) => {
                  setLeverage(Number(e.target.value));
                }}
                className="mt-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
              />
              <div className="mt-1.5 flex justify-between text-[10px] text-fg-muted">
                <span>1×</span>
                <span>{market.defaultLeverage}× max · {market.label}</span>
              </div>
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={() => {
                if (!mounted) return;
                if (!connected) {
                  promptConnect();
                  return;
                }
                setConfirming(true);
              }}
              disabled={orderState.status === 'submitting' || !mounted}
              className="btn-primary btn-block btn-lg mt-8 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!mounted
                ? '…'
                : !connected
                  ? 'Connect wallet to trade'
                  : orderState.status === 'submitting'
                    ? 'Submitting…'
                    : `${direction === 'long' ? 'Buy' : 'Sell'} ${market.label}`}
            </button>

            {/* Mobile-only math disclosure. On desktop the math is
                always visible in the left column, so we hide the
                disclosure there with `lg:hidden`. */}
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => {
                  setShowMath((v) => !v);
                }}
                aria-expanded={showMath}
                className="mt-6 self-start text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
              >
                {showMath ? 'Hide math' : 'Show math'}
              </button>

              {showMath && (
                <div className="mt-4 border-t border-border-subtle pt-5">{mathContent}</div>
              )}
            </div>
          </section>

          {/* RIGHT COLUMN (desktop only) — Your trades + Waiting
              orders. Sticky so scrolling a long trade history
              doesn't leave the left-column math behind. */}
          <aside className="hidden lg:block">
            <div className="sticky top-28 space-y-6">{tradesContent}</div>
          </aside>
        </div>

        {/* Mobile-only: Your trades + Waiting orders, below the form.
            Desktop renders these in the right column above. */}
        <div className="mt-10 space-y-6 lg:hidden">{tradesContent}</div>

        <div className="mt-6 pb-6 text-center">
          <Link
            href="/trade"
            className="text-[12px] text-fg-muted transition-colors hover:text-fg-primary"
          >
            Expert view →
          </Link>
        </div>
      </div>

      {confirming && (
        <ConfirmModal
          title={`${direction === 'long' ? 'Buy' : 'Sell'} ${market.label}?`}
          body={
            <div className="space-y-2 text-[14px] leading-relaxed text-fg-secondary">
              <div className="flex items-baseline justify-between">
                <span>Amount</span>
                <span className="font-mono text-fg-primary">${amountUsd.toFixed(0)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span>Leverage</span>
                <span className="font-mono text-fg-primary">{leverage}×</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span>Max loss</span>
                <span className="font-mono text-pnl-short">−${couldLose.toFixed(0)}</span>
              </div>
            </div>
          }
          confirmLabel={direction === 'long' ? 'Buy' : 'Sell'}
          onConfirm={handleConfirm}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      )}

      {resultModal && (
        <ResultModal
          result={resultModal}
          onClose={() => {
            setResultModal(null);
          }}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

/**
 * <MarketPicker /> — compact dropdown for selecting the market.
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
 * reflowing the form — important because the Amount slider sits
 * immediately below this picker and we don't want it jumping on open.
 *
 * Scrolls internally (`max-h-64 overflow-y-auto`) so it works for
 * future lists of 20+ markets without pushing the form offscreen.
 */
function MarketPicker<T extends { readonly symbol: string; readonly label: string; readonly seedPrice: number }>({
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
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDocMouse);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDocMouse);
      window.removeEventListener('keydown', onKey);
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
          className={`text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
                    ? 'bg-accent/10 text-accent'
                    : 'text-fg-primary hover:bg-bg-base'
                }`}
              >
                <span className={`text-[14px] font-medium ${active ? 'text-accent' : ''}`}>
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

function ConfirmModal({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  readonly title: string;
  readonly body: React.ReactNode;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-klub-lg border border-border bg-bg-surface p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 className="text-lg font-semibold text-fg-primary">{title}</h2>
        <div className="mt-4">{body}</div>
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary btn-block">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary btn-block">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Result modal after a Quick Trade submission.
 *
 * Retail tone — shorter copy than /trade's expert modal. Shows the
 * same fundamental info (submitted vs rejected, reason, order id)
 * but uses plain language rather than Bulk-native error categories.
 */
function ResultModal({
  result,
  onClose,
}: {
  readonly result: SubmitOrderResult;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const testnetUrl = process.env['NEXT_PUBLIC_BULK_TESTNET_APP_URL'] ?? 'https://early.bulk.trade';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-klub-lg border border-border bg-bg-surface p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {result.ok ? (
          <>
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-pnl-long">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pnl-long" />
              Order placed
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-fg-primary">
              You&rsquo;re in the trade.
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-secondary">
              Your order was accepted by Bulk. Fill status will show up in your
              positions once it matches.
            </p>
            {result.orderId && (
              <div className="mt-5 rounded-klub border border-border-subtle bg-bg-base p-2.5">
                <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
                  Order ID
                </div>
                <div className="mt-1 break-all font-mono text-[11px] text-fg-primary">
                  {result.orderId}
                </div>
              </div>
            )}
            <div className="mt-6 flex gap-2">
              <a
                href={testnetUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-secondary btn-block"
              >
                View on Bulk ↗
              </a>
              <button type="button" onClick={onClose} className="btn-primary btn-block">
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-pnl-short">
              <span className="h-1.5 w-1.5 rounded-full bg-pnl-short" />
              Not placed
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-tight text-fg-primary">
              {titleForReason(result.reason)}
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-secondary">
              {humanizeReason(result.reason, result.message)}
            </p>
            <div className="mt-4 rounded-klub border border-border-subtle bg-bg-base p-2.5">
              <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
                Details
              </div>
              <div className="mt-1 break-words font-mono text-[11px] text-fg-muted">
                {result.message}
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button type="button" onClick={onClose} className="btn-primary btn-block">
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function titleForReason(reason: Extract<SubmitOrderResult, { ok: false }>['reason']): string {
  switch (reason) {
    case 'rejected_risk_limit':
      return 'Too much risk for your account';
    case 'rejected_crossing':
      return 'Price moved too far';
    case 'user_rejected':
      return 'You cancelled the signature';
    case 'network_error':
      return 'Network error';
    case 'rejected_invalid':
    default:
      return 'Order was rejected';
  }
}

function humanizeReason(
  reason: Extract<SubmitOrderResult, { ok: false }>['reason'],
  raw: string,
): string {
  switch (reason) {
    case 'rejected_risk_limit':
      return 'This trade is larger than your account can back. Lower the amount or reduce leverage.';
    case 'rejected_crossing':
      return 'The market moved between preview and submit. Try again.';
    case 'user_rejected':
      return 'No order was submitted.';
    case 'network_error':
      return 'We could not reach the exchange. Check your connection.';
    case 'rejected_invalid':
    default:
      return raw || 'Bulk rejected this order. See details below.';
  }
}

// ---------------------------------------------------------------------------

/**
 * <TradeCard /> — one open position rendered in retail tone.
 *
 * Layout, top-to-bottom:
 *   Row 1: [Long/Short chip] Market        ProfitLoss
 *   Row 2: $Amount                         Entered at $X · now $Y
 *   Row 3:                                 [Close →]
 *
 * The "Close" button opens an inline confirm, then submits an
 * offsetting market order via the shared `useBulkOrder` hook. After
 * success we call `onAfterClose` so the parent can refresh /account
 * — the card disappears once the position is gone from the next
 * snapshot.
 *
 * We deliberately don't show liquidation price, notional, or margin
 * used here — those live on the expert /trade page. Retail view
 * answers one question: "am I up or down and how much?"
 */
function TradeCard({
  position,
  livePrice,
  onAfterClose,
  onResult,
}: {
  readonly position: BulkPosition;
  readonly livePrice: number;
  readonly onAfterClose: () => void;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const { submit, state } = useBulkOrder();
  const [confirming, setConfirming] = useState(false);
  const isLong = position.sizeBase > 0;
  const absSize = Math.abs(position.sizeBase);
  const notionalUsd = Math.abs(position.notionalUsd);
  // Prefer Bulk's own unrealized if present; fall back to local calc
  // against the live mark (keeps PnL ticking between /account polls).
  const pnl =
    position.unrealizedPnlUsd ?? position.sizeBase * (livePrice - position.entryPrice);
  const pnlPositive = pnl >= 0;
  const closing = state.status === 'submitting';

  async function handleClose() {
    setConfirming(false);
    const result = await submit({
      symbol: position.symbol,
      side: isLong ? 'short' : 'long',
      orderType: 'market',
      size: absSize,
    });
    onResult(result);
    if (result.ok) {
      // Give Bulk a beat to update /account before refresh, else the
      // next poll fires before the close is reflected and the card
      // briefly reappears.
      setTimeout(onAfterClose, 800);
    }
  }

  return (
    <div className="rounded-klub border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
              isLong
                ? 'bg-pnl-long/15 text-pnl-long'
                : 'bg-pnl-short/15 text-pnl-short'
            }`}
          >
            {isLong ? 'Long' : 'Short'}
          </span>
          <span className="text-[14px] font-semibold text-fg-primary">
            {marketLabel(position.symbol)}
          </span>
        </div>
        <div
          className={`font-mono text-[15px] font-semibold ${
            pnlPositive ? 'text-pnl-long' : 'text-pnl-short'
          }`}
        >
          {pnlPositive ? '+' : '−'}${Math.abs(pnl).toFixed(2)}
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <div className="font-mono text-[20px] font-semibold text-fg-primary">
          ${notionalUsd.toFixed(0)}
        </div>
        <div className="text-right text-[11px] leading-tight text-fg-muted">
          <div>
            Entered at{' '}
            <span className="font-mono text-fg-secondary">
              ${formatPositionPrice(position.entryPrice)}
            </span>
          </div>
          <div>
            Now{' '}
            <span className="font-mono text-fg-secondary">
              ${formatPositionPrice(livePrice)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        {!confirming ? (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
            }}
            disabled={closing}
            className="text-[12px] text-fg-muted transition-colors hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {closing ? 'Closing…' : 'Close trade →'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-fg-secondary">Close this trade?</span>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
              }}
              className="rounded-klub border border-border-subtle px-2.5 py-1 text-[11px] text-fg-secondary transition-colors hover:border-border"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-klub bg-pnl-short/20 px-2.5 py-1 text-[11px] font-medium text-pnl-short transition-colors hover:bg-pnl-short/30"
            >
              Yes, close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * <WaitingOrderCard /> — a resting limit order awaiting fill.
 *
 * Retail-tone reframe: "waiting to buy at $X" / "waiting to sell at
 * $X" instead of "GTC BUY LIMIT @ $X". Cancel button submits a `cx`
 * cancel action against the `orderId`.
 *
 * Open-order field names aren't fully locked in yet (we haven't
 * tested against resting orders in production); fields absent from
 * the response render as "—" and cancel still works as long as
 * `orderId` is present.
 */
function WaitingOrderCard({
  order,
  onAfterCancel,
  onResult,
}: {
  readonly order: BulkOpenOrder;
  readonly onAfterCancel: () => void;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const { cancel, state } = useBulkCancel();
  const [confirming, setConfirming] = useState(false);
  const cancelling = state.status === 'submitting';

  async function handleCancel() {
    setConfirming(false);
    // Defensive: if the order has no id, we can't cancel it on Bulk.
    // This is technically impossible if we got the order from /account
    // — Bulk always returns an id for resting orders — but we guard
    // anyway so a stale cache never triggers a bad submit.
    if (!order.orderId) {
      onResult({
        ok: false,
        reason: 'rejected_invalid',
        message: 'This order has no id — try refreshing.',
      });
      return;
    }
    const result = await cancel({
      symbol: order.symbol,
      orderId: order.orderId,
    });
    onResult(result);
    if (result.ok) {
      // Match the close-position pattern — wait a beat for Bulk's
      // /account to reflect the cancel, then refresh so the card
      // disappears.
      setTimeout(onAfterCancel, 800);
    }
  }

  return (
    <div className="rounded-klub border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${
              order.isBuy
                ? 'bg-pnl-long/15 text-pnl-long'
                : 'bg-pnl-short/15 text-pnl-short'
            }`}
          >
            {order.isBuy ? 'Buy' : 'Sell'}
          </span>
          <span className="text-[14px] font-semibold text-fg-primary">
            {marketLabel(order.symbol)}
          </span>
        </div>
        <div className="text-[11px] text-fg-muted">waiting</div>
      </div>

      <div className="mt-3 text-[13px] text-fg-secondary">
        Waiting to {order.isBuy ? 'buy' : 'sell'} at{' '}
        <span className="font-mono text-fg-primary">
          ${formatPositionPrice(order.price)}
        </span>
      </div>

      <div className="mt-4 flex justify-end">
        {!confirming ? (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
            }}
            disabled={cancelling}
            className="text-[12px] text-fg-muted transition-colors hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelling ? 'Cancelling…' : 'Cancel order →'}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-fg-secondary">Cancel this order?</span>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
              }}
              className="rounded-klub border border-border-subtle px-2.5 py-1 text-[11px] text-fg-secondary transition-colors hover:border-border"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-klub bg-pnl-short/20 px-2.5 py-1 text-[11px] font-medium text-pnl-short transition-colors hover:bg-pnl-short/30"
            >
              Yes, cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Pretty symbol → display label ("BTC-USD" → "BTC"). Falls back to
 * the raw symbol if the format is unexpected.
 */
function marketLabel(symbol: string): string {
  const dashIdx = symbol.indexOf('-');
  if (dashIdx <= 0) return symbol;
  return symbol.slice(0, dashIdx);
}

/**
 * Price formatting matching MarketPicker's logic: low-priced assets
 * get more decimal places so a 4-cent move on a $1 asset is visible.
 * Mirrored here to avoid cross-module coupling; small duplication
 * is worth the component's independence.
 */
function formatPositionPrice(price: number): string {
  const max = price < 10 ? 4 : 2;
  return price.toLocaleString(undefined, { maximumFractionDigits: max });
}