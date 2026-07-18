import { useState } from "react";

import { useBulkCancel } from "@/hooks/use-bulk-cancel";
import { useBulkOrder } from "@/hooks/use-bulk-order";
import type { BulkOpenOrder, BulkPosition } from "@/hooks/use-bulk-account";
import type { SubmitOrderResult } from "@/lib/bulk/orders";

export function TradeCard({
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
    position.unrealizedPnlUsd ??
    position.sizeBase * (livePrice - position.entryPrice);
  const pnlPositive = pnl >= 0;
  const closing = state.status === "submitting";

  async function handleClose() {
    setConfirming(false);
    const result = await submit({
      symbol: position.symbol,
      side: isLong ? "short" : "long",
      orderType: "market",
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
                ? "bg-pnl-long/15 text-pnl-long"
                : "bg-pnl-short/15 text-pnl-short"
            }`}
          >
            {isLong ? "Long" : "Short"}
          </span>
          <span className="text-[14px] font-semibold text-fg-primary">
            {marketLabel(position.symbol)}
          </span>
        </div>
        <div
          className={`font-mono text-[15px] font-semibold ${
            pnlPositive ? "text-pnl-long" : "text-pnl-short"
          }`}
        >
          {pnlPositive ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <div className="font-mono text-[20px] font-semibold text-fg-primary">
          ${notionalUsd.toFixed(0)}
        </div>
        <div className="text-right text-[11px] leading-tight text-fg-muted">
          <div>
            Entered at{" "}
            <span className="font-mono text-fg-secondary">
              ${formatPositionPrice(position.entryPrice)}
            </span>
          </div>
          <div>
            Now{" "}
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
            {closing ? "Closing…" : "Close trade →"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-fg-secondary">
              Close this trade?
            </span>
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
export function WaitingOrderCard({
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
  const cancelling = state.status === "submitting";

  async function handleCancel() {
    setConfirming(false);
    // Defensive: if the order has no id, we can't cancel it on Bulk.
    // This is technically impossible if we got the order from /account
    // — Bulk always returns an id for resting orders — but we guard
    // anyway so a stale cache never triggers a bad submit.
    if (!order.orderId) {
      onResult({
        ok: false,
        reason: "rejected_invalid",
        message: "This order has no id — try refreshing.",
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
                ? "bg-pnl-long/15 text-pnl-long"
                : "bg-pnl-short/15 text-pnl-short"
            }`}
          >
            {order.isBuy ? "Buy" : "Sell"}
          </span>
          <span className="text-[14px] font-semibold text-fg-primary">
            {marketLabel(order.symbol)}
          </span>
        </div>
        <div className="text-[11px] text-fg-muted">waiting</div>
      </div>

      <div className="mt-3 text-[13px] text-fg-secondary">
        Waiting to {order.isBuy ? "buy" : "sell"} at{" "}
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
            {cancelling ? "Cancelling…" : "Cancel order →"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-fg-secondary">
              Cancel this order?
            </span>
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
  const dashIdx = symbol.indexOf("-");
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
