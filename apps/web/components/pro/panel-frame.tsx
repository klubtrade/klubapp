"use client";

import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";

/**
 * <PanelFrame />
 *
 * The visual chrome for a single Pro terminal panel. Renders a header
 * strip with the title + a drag handle, then the content area below.
 *
 * The `.pro-drag-handle` class is what react-grid-layout targets as the
 * grab area - so the body of a panel (orderbook rows, watchlist clicks,
 * form inputs) stays interactive while the header initiates drags.
 */
export function PanelFrame({
  title,
  actions,
  children,
}: {
  readonly title: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="absolute inset-0 flex flex-col overflow-hidden border border-border-subtle bg-bg-base">
      <div className="pro-drag-handle flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-fg-muted">
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical
            size={12}
            strokeWidth={1.8}
            aria-hidden
            className="flex-shrink-0 opacity-50"
          />
          <span className="truncate">{title}</span>
        </div>
        {actions && (
          <div
            className="flex flex-shrink-0 items-center gap-1"
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
          >
            {actions}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}
