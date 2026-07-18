import { useEffect } from "react";
import type { Side } from "@klub/calc";

import type { SubmitOrderResult } from "@/lib/bulk/orders";
import { MARKETS } from "@/lib/markets";

type Market = (typeof MARKETS)[number];

export function QuickTradeOverlays({
  confirming,
  direction,
  market,
  amountUsd,
  leverage,
  couldLose,
  result,
  onConfirm,
  onCancelConfirm,
  onCloseResult,
}: {
  readonly confirming: boolean;
  readonly direction: Side;
  readonly market: Market;
  readonly amountUsd: number;
  readonly leverage: number;
  readonly couldLose: number;
  readonly result: SubmitOrderResult | null;
  readonly onConfirm: () => void;
  readonly onCancelConfirm: () => void;
  readonly onCloseResult: () => void;
}) {
  return (
    <>
      {confirming && (
        <ConfirmModal
          title={`${direction === "long" ? "Buy" : "Sell"} ${market.label}?`}
          body={
            <div className="space-y-2 text-[14px] leading-relaxed text-fg-secondary">
              <div className="flex items-baseline justify-between">
                <span>Amount</span>
                <span className="font-mono text-fg-primary">
                  ${amountUsd.toFixed(0)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span>Leverage</span>
                <span className="font-mono text-fg-primary">{leverage}×</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span>Max loss</span>
                <span className="font-mono text-pnl-short">
                  −${couldLose.toFixed(0)}
                </span>
              </div>
            </div>
          }
          confirmLabel={direction === "long" ? "Buy" : "Sell"}
          onConfirm={onConfirm}
          onCancel={onCancelConfirm}
        />
      )}

      {result && <ResultModal result={result} onClose={onCloseResult} />}
    </>
  );
}

export function ConfirmModal({
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
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
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
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary btn-block"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary btn-block"
          >
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
export function ResultModal({
  result,
  onClose,
}: {
  readonly result: SubmitOrderResult;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const testnetUrl =
    process.env["NEXT_PUBLIC_BULK_TESTNET_APP_URL"] ??
    "https://early.bulk.trade";

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
              <button
                type="button"
                onClick={onClose}
                className="btn-primary btn-block"
              >
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
              <button
                type="button"
                onClick={onClose}
                className="btn-primary btn-block"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function titleForReason(
  reason: Extract<SubmitOrderResult, { ok: false }>["reason"],
): string {
  switch (reason) {
    case "rejected_risk_limit":
      return "Too much risk for your account";
    case "rejected_crossing":
      return "Price moved too far";
    case "user_rejected":
      return "You cancelled the signature";
    case "network_error":
      return "Network error";
    case "rejected_invalid":
    default:
      return "Order was rejected";
  }
}

function humanizeReason(
  reason: Extract<SubmitOrderResult, { ok: false }>["reason"],
  raw: string,
): string {
  switch (reason) {
    case "rejected_risk_limit":
      return "This trade is larger than your account can back. Lower the amount or reduce leverage.";
    case "rejected_crossing":
      return "The market moved between preview and submit. Try again.";
    case "user_rejected":
      return "No order was submitted.";
    case "network_error":
      return "We could not reach the exchange. Check your connection.";
    case "rejected_invalid":
    default:
      return raw || "Bulk rejected this order. See details below.";
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
