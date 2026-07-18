import {
  useBulkAccount,
  type BulkOpenOrder,
  type BulkPosition,
} from "@/hooks/use-bulk-account";
import { useBulkCancel } from "@/hooks/use-bulk-cancel";
import { useBulkOrder } from "@/hooks/use-bulk-order";
import type { LivePrice } from "@/hooks/use-tickers";
import type { SubmitOrderResult } from "@/lib/bulk/orders";

import { formatPrice, PanelHead } from "./utils";

export function PanelPositions({
  positions,
  openOrders,
  livePrices,
  accountStatus,
  connected,
  onResult,
}: {
  readonly positions: readonly BulkPosition[];
  readonly openOrders: readonly BulkOpenOrder[];
  readonly livePrices: Record<string, LivePrice | undefined>;
  readonly accountStatus: ReturnType<typeof useBulkAccount>["state"]["status"];
  readonly connected: boolean;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  return (
    <section className="pro-panel flex flex-col overflow-hidden">
      <PanelHead>
        Positions · {positions.length} · Orders · {openOrders.length}
      </PanelHead>
      <div className="flex-1 overflow-auto p-3">
        {!connected ? (
          <PositionsEmpty message="Connect a wallet to see positions." />
        ) : accountStatus === "loading" && positions.length === 0 ? (
          <PositionsEmpty message="Loading positions…" />
        ) : positions.length === 0 && openOrders.length === 0 ? (
          <PositionsEmpty message="No positions or resting orders." />
        ) : (
          <div className="flex flex-col gap-2">
            {positions.map((p) => (
              <PositionRow
                key={`pos-${p.symbol}`}
                pos={p}
                live={livePrices[p.symbol]}
                onResult={onResult}
              />
            ))}
            {openOrders.map((o) => (
              <OpenOrderRow
                key={`ord-${o.orderId}`}
                order={o}
                onResult={onResult}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PositionsEmpty({ message }: { readonly message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-center font-mono text-[11px] text-fg-muted">
      {message}
    </div>
  );
}

function PositionRow({
  pos,
  live,
  onResult,
}: {
  readonly pos: BulkPosition;
  readonly live: LivePrice | undefined;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const { submit, state } = useBulkOrder();
  const isLong = pos.sizeBase > 0;
  const absSize = Math.abs(pos.sizeBase);
  const mark = live?.mark ?? pos.fairPrice;
  const pnl = pos.unrealizedPnlUsd ?? (mark - pos.entryPrice) * pos.sizeBase;
  const tone = pnl >= 0 ? "text-pnl-long" : "text-pnl-short";

  async function close() {
    if (state.status === "submitting") return;
    const r = await submit({
      symbol: pos.symbol,
      side: isLong ? "short" : "long",
      orderType: "market",
      size: absSize,
      reduceOnly: true,
    });
    onResult(r);
  }

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-klub border border-border-subtle bg-bg-surface p-3">
      <div className="font-mono text-[12px]">
        <div className="flex items-baseline gap-2">
          <span className={isLong ? "text-pnl-long" : "text-pnl-short"}>
            {isLong ? "LONG" : "SHORT"}
          </span>
          <span className="text-fg-primary">{pos.symbol}</span>
          <span className="text-fg-muted">{absSize.toFixed(4)}</span>
        </div>
        <div className="mt-1 text-fg-muted">
          Entry ${formatPrice(pos.entryPrice)} · Mark ${formatPrice(mark)}
        </div>
      </div>
      <div className="text-right">
        <div className={`font-mono text-[14px] ${tone}`}>
          {pnl >= 0 ? "+" : "-"}${Math.abs(pnl).toFixed(2)}
        </div>
        <button
          type="button"
          onClick={close}
          disabled={state.status === "submitting"}
          className="btn-ghost btn-sm mt-1 text-[11px] disabled:opacity-50"
        >
          {state.status === "submitting" ? "Closing…" : "Close"}
        </button>
      </div>
    </div>
  );
}

function OpenOrderRow({
  order,
  onResult,
}: {
  readonly order: BulkOpenOrder;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const { cancel, state } = useBulkCancel();

  async function doCancel() {
    if (state.status === "submitting") return;
    const r = await cancel({ symbol: order.symbol, orderId: order.orderId });
    onResult(r);
  }

  const sideTone = order.isBuy ? "text-pnl-long" : "text-pnl-short";
  const sideLabel = order.isBuy ? "BUY" : "SELL";

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-klub border border-border-subtle bg-bg-surface/60 p-3">
      <div className="font-mono text-[12px]">
        <div className="flex items-baseline gap-2">
          <span className={sideTone}>{sideLabel}</span>
          <span className="text-fg-primary">{order.symbol}</span>
          <span className="text-fg-muted">
            {Math.abs(order.sizeBase).toFixed(4)}
          </span>
          <span className="text-fg-muted">@ ${formatPrice(order.price)}</span>
        </div>
        {order.tif && <div className="mt-1 text-fg-muted">{order.tif}</div>}
      </div>
      <button
        type="button"
        onClick={doCancel}
        disabled={state.status === "submitting"}
        className="btn-ghost btn-sm text-[11px] disabled:opacity-50"
      >
        {state.status === "submitting" ? "Cancelling…" : "Cancel"}
      </button>
    </div>
  );
}
