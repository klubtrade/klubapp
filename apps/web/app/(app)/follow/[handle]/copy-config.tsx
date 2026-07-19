"use client";

import { useState } from "react";

import { useCopyTrade } from "@/components/copy-trade-provider";
import { useToast } from "@/components/toast";
import type { VerifiedLeader } from "@/lib/copy-trade/leaders";
import { RISK_PRESETS, useUserPrefs } from "@/lib/user-prefs";
import { useTradingWallet } from "@/lib/trading-wallet";

export function LeaderDetails({ leader }: { readonly leader: VerifiedLeader }) {
  const wallet = useTradingWallet();
  const toast = useToast();
  const { prefs } = useUserPrefs();
  const { follows, follow, unfollow } = useCopyTrade();
  const maxAllowed = RISK_PRESETS[prefs.riskProfile].maxCopyAllocPct;
  const [allocationPct, setAllocationPct] = useState(
    Math.min(prefs.defaultCopyAllocPct, maxAllowed),
  );
  const following = follows.some((item) => item.leaderPubkey === leader.pubkey);

  return (
    <>
      <div className="mt-8 grid grid-cols-3 gap-2 rounded-klub-lg border border-border-subtle bg-bg-surface p-4 text-center">
        <Metric label="Win rate" value={`${leader.winRate.toFixed(1)}%`} />
        <Metric label="Max DD" value={`${leader.maxDrawdownPct.toFixed(1)}%`} />
        <Metric label="Closed" value={leader.closedTradesCount.toString()} />
      </div>
      <div className="mt-4 rounded-klub-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-fg-muted">
          <span>Allocation limit</span>
          <span className="font-mono text-accent">{allocationPct}%</span>
        </div>
        <input
          type="range"
          min={5}
          max={maxAllowed}
          step={5}
          value={allocationPct}
          onChange={(event) => setAllocationPct(Number(event.target.value))}
          className="mt-4 w-full accent-accent"
        />
        <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
          New position signals are sized within this limit. You confirm
          execution unless Fast Trading is enabled.
        </p>
      </div>
      <button
        type="button"
        className={
          following
            ? "btn-secondary btn-block mt-4"
            : "btn-primary btn-block mt-4"
        }
        onClick={() => {
          if (!wallet.connected) {
            wallet.promptConnect();
            return;
          }
          if (following) {
            unfollow(leader.pubkey);
            toast.info(`Stopped copying ${leader.label}`);
          } else {
            void follow({
              leaderPubkey: leader.pubkey,
              label: leader.label,
              allocationPct,
            });
            toast.success(
              `Copying ${leader.label}`,
              `${allocationPct}% limit per trade.`,
            );
          }
        }}
      >
        {following ? "Stop copying" : "Start copying"}
      </button>
      <p className="mt-5 text-[10px] leading-relaxed text-fg-muted">
        Updated {new Date(leader.updatedAt).toLocaleString()}. Metrics are
        calculated by KLUB from Bulk public account records and can differ from
        venue equity.
      </p>
    </>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <div className="font-mono text-[14px] text-fg-primary">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-fg-muted">
        {label}
      </div>
    </div>
  );
}
