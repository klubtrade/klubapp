"use client";

import { RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useCopyTrade } from "@/components/copy-trade-provider";
import { useToast } from "@/components/toast";
import type { VerifiedLeader } from "@/lib/copy-trade/leaders";
import { useUserPrefs } from "@/lib/user-prefs";

export default function FollowPage() {
  const [leaders, setLeaders] = useState<readonly VerifiedLeader[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const { follows, follow, unfollow } = useCopyTrade();
  const toast = useToast();
  const { prefs } = useUserPrefs();
  const following = useMemo(
    () => new Set(follows.map((item) => item.leaderPubkey)),
    [follows],
  );

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/leaders", { cache: "no-store" });
      if (!response.ok) throw new Error("leader query failed");
      const payload = (await response.json()) as {
        readonly leaders?: readonly VerifiedLeader[];
      };
      setLeaders(payload.leaders ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-fg-primary md:text-[40px]">
              Copy trading
            </h1>
            <p className="mt-2 text-[13px] text-fg-muted">
              Verified Bulk testnet activity, ranked by calculated 30-day net
              PnL.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh traders"
            className="rounded-klub border border-border-subtle p-2.5 text-fg-muted hover:text-fg-primary"
          >
            <RefreshCw
              className={`h-4 w-4 ${status === "loading" ? "animate-spin" : ""}`}
            />
          </button>
        </header>

        <div className="mt-6 flex items-start gap-3 rounded-klub border border-border-subtle bg-bg-surface p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pnl-long" />
          <p className="text-[11px] leading-relaxed text-fg-secondary">
            Results come from public Bulk fills and funding records for accounts
            observed in the live trade stream. Ranking is KLUB-calculated, not
            an official Bulk leaderboard.
          </p>
        </div>

        {status === "error" ? (
          <EmptyState
            title="Trader data is temporarily unavailable"
            detail="Refresh to try again."
          />
        ) : status === "ready" && leaders.length === 0 ? (
          <EmptyState
            title="Indexing live traders"
            detail="Verified accounts will appear after the worker observes and scores live testnet activity."
          />
        ) : (
          <ol className="mt-6 grid gap-3 md:grid-cols-2">
            {leaders.map((leader, index) => {
              const isFollowing = following.has(leader.pubkey);
              return (
                <li
                  key={leader.pubkey}
                  className="rounded-klub-lg border border-border-subtle bg-bg-surface p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 font-mono text-[12px] text-accent">
                      #{index + 1}
                    </span>
                    <Link
                      href={`/copy/${leader.pubkey}`}
                      className="min-w-0 flex-1"
                    >
                      <div className="truncate text-[14px] font-semibold text-fg-primary">
                        {leader.label}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-fg-muted">
                        {leader.fillsLast30d} fills · {leader.closedTradesCount}{" "}
                        closed
                      </div>
                    </Link>
                    <div
                      className={`font-mono text-[14px] font-semibold ${leader.netPnl30dUsd >= 0 ? "text-pnl-long" : "text-pnl-short"}`}
                    >
                      {formatPnl(leader.netPnl30dUsd)}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border-subtle pt-3 text-center">
                    <Metric
                      label="Win"
                      value={`${leader.winRate.toFixed(1)}%`}
                    />
                    <Metric
                      label="Max DD"
                      value={`${leader.maxDrawdownPct.toFixed(1)}%`}
                    />
                    <Metric
                      label="Sharpe"
                      value={leader.sharpeRatio.toFixed(2)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (isFollowing) {
                        unfollow(leader.pubkey);
                        toast.info(`Stopped copying ${leader.label}`);
                      } else {
                        void follow({
                          leaderPubkey: leader.pubkey,
                          label: leader.label,
                          allocationPct: prefs.defaultCopyAllocPct,
                        });
                        toast.success(
                          `Copying ${leader.label}`,
                          `${prefs.defaultCopyAllocPct}% limit per trade.`,
                        );
                      }
                    }}
                    className={
                      isFollowing
                        ? "btn-secondary btn-block mt-4"
                        : "btn-primary btn-block mt-4"
                    }
                  >
                    {isFollowing ? "Stop copying" : "Copy trader"}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
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
      <div className="font-mono text-[12px] text-fg-primary">{value}</div>
      <div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-fg-muted">
        {label}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  detail,
}: {
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <div className="mt-6 rounded-klub-lg border border-dashed border-border-subtle p-10 text-center">
      <div className="text-[14px] text-fg-primary">{title}</div>
      <p className="mt-2 text-[12px] text-fg-muted">{detail}</p>
    </div>
  );
}

function formatPnl(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
