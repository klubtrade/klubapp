"use client";

import Link from "next/link";
import { useState } from "react";

import { useCopyTrade } from "@/components/copy-trade-provider";
import { useWalletGate } from "@/hooks/use-wallet-gate";
import { useTradingWallet } from "@/lib/trading-wallet";

/**
 * Legacy copy-trading control panel. `/copy-trade` redirects to the
 * unified `/copy` center; this module remains temporarily for rollback.
 *
 * Simple by design (Day 4):
 *   - Form at the top: paste a leader's Bulk pubkey, set allocation
 *     percentage (default 20%), optional nickname, click Follow.
 *   - Below: the list of active follows with an Unfollow button.
 *   - A banner (mounted globally in the layout) surfaces mirror
 *     signals as the leader opens new trades.
 *
 * New work belongs in `/copy`.
 *
 * Follows persist in localStorage keyed by the follower's wallet
 * pubkey. A Day-5 swap replaces this with DB-backed state.
 */

export default function CopyTradePage() {
  const wallet = useTradingWallet();
  const { promptConnect, mounted } = useWalletGate();
  const { follows, follow, unfollow } = useCopyTrade();

  const [leaderInput, setLeaderInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [allocationPct, setAllocationPct] = useState(20);
  const [formError, setFormError] = useState<string | null>(null);

  if (!wallet.connected) {
    return (
      <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
        <section className="mx-auto w-full max-w-md">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            Copy trade
          </h1>
          <p className="mt-2 text-[13px] text-fg-muted">
            Mirror another trader&rsquo;s positions automatically.
          </p>
          <p className="mt-8 text-[14px] leading-relaxed text-fg-secondary">
            Connect a wallet to follow other traders and mirror their trades at
            your chosen allocation.
          </p>
          <button
            type="button"
            onClick={() => {
              promptConnect();
            }}
            disabled={!mounted}
            className="btn-primary btn-block btn-lg mt-8"
          >
            Connect wallet
          </button>
        </section>
      </main>
    );
  }

  const followerPubkey = wallet.publicKeyBase58 ?? "";

  function onFollow(e: React.FormEvent): void {
    e.preventDefault();
    setFormError(null);
    const trimmed = leaderInput.trim();
    if (!isPlausiblePubkey(trimmed)) {
      setFormError(
        "That doesn’t look like a valid wallet address. Paste a base58 address.",
      );
      return;
    }
    if (trimmed === followerPubkey) {
      setFormError("You can’t follow yourself.");
      return;
    }
    if (allocationPct < 1 || allocationPct > 100) {
      setFormError("Allocation must be 1-100%.");
      return;
    }
    if (follows.some((f) => f.leaderPubkey === trimmed)) {
      setFormError("Already following that leader.");
      return;
    }
    follow({
      leaderPubkey: trimmed,
      ...(labelInput.trim() ? { label: labelInput.trim() } : {}),
      allocationPct,
    });
    setLeaderInput("");
    setLabelInput("");
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-md">
        <header>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            Copy trade
          </h1>
          <p className="mt-2 text-[13px] text-fg-muted">
            Mirror another trader&apos;s positions at your own allocation.
          </p>
          <Link
            href="/copy"
            className="mt-3 inline-flex items-center gap-1 text-[13px] text-accent transition-colors hover:opacity-80"
          >
            Or browse the leaderboard →
          </Link>
        </header>

        <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
          <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Add a leader
          </div>

          <form onSubmit={onFollow} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="wallet-address"
                className="text-[11px] font-medium text-fg-secondary"
              >
                Wallet address
              </label>
              <input
                id="wallet-address"
                type="text"
                value={leaderInput}
                onChange={(e) => {
                  setLeaderInput(e.target.value);
                }}
                placeholder="83bVNm4HwHreYYm8x5HTANBZnaxrPhrf9SEnT5UTsEbj"
                className="mt-1.5 w-full rounded-klub border border-border-subtle bg-bg-base px-3 py-2.5 font-mono text-[12px] text-fg-primary placeholder:text-fg-muted/50 focus:border-accent focus:outline-none"
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            <div>
              <label
                htmlFor="leader-label"
                className="text-[11px] font-medium text-fg-secondary"
              >
                Nickname (optional)
              </label>
              <input
                id="leader-label"
                type="text"
                value={labelInput}
                onChange={(e) => {
                  setLabelInput(e.target.value);
                }}
                placeholder="e.g. Alpha Mamba"
                maxLength={32}
                className="mt-1.5 w-full rounded-klub border border-border-subtle bg-bg-base px-3 py-2.5 text-[13px] text-fg-primary placeholder:text-fg-muted/50 focus:border-accent focus:outline-none"
                autoComplete="off"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label
                  htmlFor="allocation-pct"
                  className="text-[11px] font-medium text-fg-secondary"
                >
                  Allocation per trade
                </label>
                <span className="font-mono text-[16px] font-semibold text-accent">
                  {allocationPct}%
                </span>
              </div>
              <input
                id="allocation-pct"
                type="range"
                min={1}
                max={100}
                step={1}
                value={allocationPct}
                onChange={(e) => {
                  setAllocationPct(Number.parseInt(e.target.value, 10));
                }}
                className="mt-3 w-full accent-accent"
              />
              <p className="mt-2 text-[11px] text-fg-muted">
                {allocationPct}% of your equity goes into each mirrored trade.
              </p>
            </div>

            {formError && (
              <div className="rounded-klub border border-pnl-short/40 bg-pnl-short/10 p-3 text-[11px] text-pnl-short">
                {formError}
              </div>
            )}

            <button type="submit" className="btn-primary btn-block">
              Follow
            </button>
          </form>
        </section>

        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight">
              Following
            </h2>
            <span className="text-[10px] uppercase tracking-[0.12em] text-fg-muted">
              {follows.length} {follows.length === 1 ? "leader" : "leaders"}
            </span>
          </div>

          {follows.length === 0 ? (
            <div className="mt-3 rounded-klub-lg border border-border-subtle bg-bg-surface/40 px-5 py-8 text-center">
              <div className="text-[13px] font-medium text-fg-secondary">
                Not following anyone yet
              </div>
              <div className="mt-1 text-[11px] text-fg-muted">
                Add a wallet above, or browse the leaderboard.
              </div>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {follows.map((f) => (
                <li
                  key={f.leaderPubkey}
                  className="flex items-center gap-3 rounded-klub-lg border border-border-subtle bg-bg-surface p-3"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-elevated font-mono text-[11px] font-semibold text-fg-secondary">
                    {(f.label ?? f.leaderPubkey).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-fg-primary">
                      {f.label ?? shortenPubkey(f.leaderPubkey)}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-fg-muted">
                      {shortenPubkey(f.leaderPubkey)} · {f.allocationPct}% alloc
                      {f.baselineSymbols.length === 0 ? " · syncing…" : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      unfollow(f.leaderPubkey);
                    }}
                    className="shrink-0 rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-fg-secondary transition-colors hover:bg-bg-elevated hover:text-fg-primary"
                  >
                    Unfollow
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function isPlausiblePubkey(s: string): boolean {
  // Solana base58 pubkeys are typically 32-44 chars. Reject obvious
  // junk without trying to fully validate — Bulk will reject invalid
  // keys when we actually try to subscribe.
  if (s.length < 32 || s.length > 48) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
}

function shortenPubkey(s: string): string {
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}
