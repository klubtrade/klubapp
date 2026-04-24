'use client';

import { useState } from 'react';

import { useCopyTrade } from '@/components/copy-trade-provider';
import { useBulkOrder } from '@/hooks/use-bulk-order';
import type { MirrorSignal } from '@/lib/copy-trade/engine';

/**
 * CopyTradeBanner — surfaces queued mirror signals as a floating
 * bottom-right card with [Mirror] and [Skip] actions.
 *
 * Shows ONE card at a time (the oldest pending signal); subsequent
 * signals stack behind it and surface after the current one is
 * dismissed. Keeping the surface single-card avoids a notification
 * avalanche if a leader opens several trades at once.
 *
 * [Mirror] places a market order on the follower's account via the
 * standard `useBulkOrder` flow — the same path /quick-trade and
 * /trade use. Success or failure is surfaced inline on the card
 * rather than in a global toast so the user has context about which
 * mirror it refers to.
 */

export function CopyTradeBanner() {
  const { pendingMirrors, dismissMirror } = useCopyTrade();
  if (pendingMirrors.length === 0) return null;
  const signal = pendingMirrors[0];
  if (!signal) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 max-w-sm md:bottom-6 md:right-6">
      <MirrorCard
        key={signal.id}
        signal={signal}
        onDismiss={() => dismissMirror(signal.id)}
      />
    </div>
  );
}

function MirrorCard({
  signal,
  onDismiss,
}: {
  readonly signal: MirrorSignal;
  readonly onDismiss: () => void;
}) {
  const { submit, state } = useBulkOrder();
  const { notePositionChange } = useCopyTrade();
  const [localError, setLocalError] = useState<string | null>(null);

  // Translate signal.action into the actual order side we must send.
  //
  //   OPEN long          → buy
  //   OPEN short         → sell
  //   CLOSE long-mirror  → sell
  //   CLOSE short-mirror → buy
  //   INCREASE long      → buy  (same as open)
  //   INCREASE short     → sell
  //   DECREASE long      → sell (same as close)
  //   DECREASE short     → buy
  //
  // `signal.side` is the side of the follower's mirror (or would-be
  // mirror). For opens/increases we trade WITH it; for
  // closes/decreases we trade AGAINST it.
  const orderSide: 'long' | 'short' =
    signal.action === 'close' || signal.action === 'decrease'
      ? signal.side === 'long'
        ? 'short'
        : 'long'
      : signal.side;

  async function onMirror(): Promise<void> {
    setLocalError(null);
    const result = await submit({
      symbol: signal.symbol,
      side: orderSide,
      orderType: 'market',
      size: signal.mirrorSizeBase,
    });
    if (result.ok) {
      // Tell the engine what happened so future diffs can size
      // closes + decreases correctly. Signed delta: acquiring long
      // = positive; acquiring short OR unwinding long = negative.
      const signedDelta =
        orderSide === 'long' ? signal.mirrorSizeBase : -signal.mirrorSizeBase;
      // For close/decrease we're unwinding — apply the opposite
      // sign of what we'd apply for an acquisition, which happens
      // to be exactly the same formula (unwinding a long = sell =
      // negative delta). The branching here exists because of how
      // `orderSide` is already inverted for those actions above.
      notePositionChange(signal.leaderPubkey, signal.symbol, signedDelta);
      setTimeout(onDismiss, 900);
    } else {
      setLocalError(result.message ?? 'Order failed');
    }
  }

  const submitting = state.status === 'submitting';
  const succeeded = state.status === 'success';

  const leaderName =
    signal.leaderLabel ??
    `${signal.leaderPubkey.slice(0, 4)}…${signal.leaderPubkey.slice(-4)}`;

  const actionVerb: Record<typeof signal.action, string> = {
    open: 'opened',
    close: 'closed',
    increase: 'added to',
    decrease: 'reduced',
  };
  const sideBadge = signal.side === 'long' ? 'LONG' : 'SHORT';
  const sideClass = signal.side === 'long' ? 'text-long' : 'text-short';
  const primaryCtaLabel =
    signal.action === 'close' || signal.action === 'decrease' ? 'Unwind' : 'Mirror';
  const primaryCtaVerb =
    signal.action === 'close' || signal.action === 'decrease' ? 'Unwinding…' : 'Submitting…';

  return (
    <div className="pointer-events-auto rounded-2xl border border-border-subtle bg-bg-raised p-4 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Copy trade signal
          </div>
          <div className="mt-1 truncate text-sm font-medium text-fg-primary">
            {leaderName} {actionVerb[signal.action]}{' '}
            <span className={sideClass}>{sideBadge}</span> {signal.symbol}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-muted">
            Leader: {Math.abs(signal.leaderSizeBase).toFixed(4)}
            {signal.leaderEntryPrice > 0
              ? ` @ $${formatPrice(signal.leaderEntryPrice)}`
              : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          disabled={submitting}
          className="rounded-md px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg-primary disabled:opacity-50"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-border-subtle bg-bg-base p-3">
        <div className="flex items-center justify-between gap-3 text-[11px] text-fg-muted">
          <span>
            {signal.action === 'close' || signal.action === 'decrease'
              ? 'Your unwind'
              : 'Your mirror'}
          </span>
          <span>
            {signal.mirrorNotionalUsd > 0
              ? `$${formatUsd(signal.mirrorNotionalUsd)} `
              : ''}
            ({signal.mirrorSizeBase.toFixed(4)} {baseAsset(signal.symbol)})
          </span>
        </div>
        {signal.allocatedUsd > 0 && (
          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-fg-muted">
            <span>Allocated</span>
            <span>${formatUsd(signal.allocatedUsd)}</span>
          </div>
        )}
      </div>

      {localError && (
        <div className="mt-3 rounded-lg border border-short/40 bg-short/10 p-2 text-[11px] text-short">
          {localError}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onDismiss}
          disabled={submitting}
          className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium text-fg-secondary transition-colors hover:bg-bg-hover disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => {
            void onMirror();
          }}
          disabled={submitting || succeeded}
          className="flex-1 rounded-lg bg-fg-primary px-3 py-2 text-sm font-medium text-bg-base transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? primaryCtaVerb : succeeded ? 'Submitted ✓' : primaryCtaLabel}
        </button>
      </div>
    </div>
  );
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function baseAsset(symbol: string): string {
  const dash = symbol.indexOf('-');
  return dash > 0 ? symbol.slice(0, dash) : symbol;
}
