import type { SubmitOrderResult } from "@/lib/bulk/orders";

export function ResultModal({
  result,
  onClose,
}: {
  readonly result: SubmitOrderResult;
  readonly onClose: () => void;
}) {
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
        onClick={(e) => e.stopPropagation()}
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
              Bulk accepted your order. Fill status will appear in Positions.
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
