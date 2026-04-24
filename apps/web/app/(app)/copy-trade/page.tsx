'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useState } from 'react';

import { useCopyTrade } from '@/components/copy-trade-provider';
import { useWalletGate } from '@/hooks/use-wallet-gate';

/**
 * /copy-trade — MVP copy-trading control panel.
 *
 * Simple by design (Day 4):
 *   - Form at the top: paste a leader's Bulk pubkey, set allocation
 *     percentage (default 20%), optional nickname, click Follow.
 *   - Below: the list of active follows with an Unfollow button.
 *   - A banner (mounted globally in the layout) surfaces mirror
 *     signals as the leader opens new trades.
 *
 * No leaderboard, no filtering, no profile pages. That lives at
 * `/follow` and is currently mock-data driven; Day 5+ will integrate
 * the two surfaces.
 *
 * Follows persist in localStorage keyed by the follower's wallet
 * pubkey. A Day-5 swap replaces this with DB-backed state.
 */

export default function CopyTradePage() {
  const wallet = useWallet();
  const { promptConnect, mounted } = useWalletGate();
  const { follows, follow, unfollow } = useCopyTrade();

  const [leaderInput, setLeaderInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [allocationPct, setAllocationPct] = useState(20);
  const [formError, setFormError] = useState<string | null>(null);

  if (!wallet.connected) {
    return (
      <main className="min-h-screen">
        <section className="mx-auto max-w-md px-6 pt-28 md:pt-36">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Copy trade
          </div>
          <h1 className="mt-2 text-2xl font-medium text-fg-primary">Follow a trader</h1>
          <p className="mt-6 text-sm text-fg-muted">
            Connect a wallet to follow other traders and mirror their positions.
          </p>
          <button
            type="button"
            onClick={() => {
              promptConnect();
            }}
            disabled={!mounted}
            className="mt-6 w-full rounded-lg bg-fg-primary px-4 py-3 text-sm font-medium text-bg-base transition-colors hover:opacity-90 disabled:opacity-50"
          >
            Connect wallet
          </button>
        </section>
      </main>
    );
  }

  const followerPubkey = wallet.publicKey?.toBase58() ?? '';

  function onFollow(e: React.FormEvent): void {
    e.preventDefault();
    setFormError(null);
    const trimmed = leaderInput.trim();
    if (!isPlausiblePubkey(trimmed)) {
      setFormError('That doesn’t look like a valid wallet address. Paste a base58 address.');
      return;
    }
    if (trimmed === followerPubkey) {
      setFormError('You can’t follow yourself.');
      return;
    }
    if (allocationPct < 1 || allocationPct > 100) {
      setFormError('Allocation must be 1-100%.');
      return;
    }
    if (follows.some((f) => f.leaderPubkey === trimmed)) {
      setFormError('Already following that leader.');
      return;
    }
    follow({
      leaderPubkey: trimmed,
      ...(labelInput.trim() ? { label: labelInput.trim() } : {}),
      allocationPct,
    });
    setLeaderInput('');
    setLabelInput('');
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-md px-6 pb-12 pt-28 md:pt-36">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          Copy trade
        </div>
        <h1 className="mt-2 text-2xl font-medium text-fg-primary">Follow a trader</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Paste a trader’s wallet address. When they open a new position, you’ll get a
          prompt to mirror it at your chosen allocation.
        </p>

        <form onSubmit={onFollow} className="mt-8 space-y-4">
          <div>
            <label
              htmlFor="wallet-address"
              className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted"
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
              className="mt-2 w-full rounded-lg border border-border-subtle bg-white/[0.04] px-3 py-2.5 font-mono text-xs text-white placeholder:text-white/30 focus:border-accent focus:bg-white/[0.06] focus:outline-none"
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div>
            <label
              htmlFor="leader-label"
              className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted"
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
              className="mt-2 w-full rounded-lg border border-border-subtle bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-accent focus:bg-white/[0.06] focus:outline-none"
              autoComplete="off"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="allocation-pct"
                className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted"
              >
                Allocation per trade
              </label>
              <span className="text-sm font-medium text-fg-primary">{allocationPct}%</span>
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
              className="mt-3 w-full"
            />
            <p className="mt-2 text-[11px] text-fg-muted">
              {allocationPct}% of your equity goes into each mirrored trade.
            </p>
          </div>

          {formError && (
            <div className="rounded-lg border border-short/40 bg-short/10 p-3 text-[11px] text-short">
              {formError}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-fg-primary px-4 py-3 text-sm font-medium text-bg-base transition-colors hover:opacity-90"
          >
            Follow
          </button>
        </form>

        <div className="mt-12">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Following ({follows.length})
          </div>
          {follows.length === 0 ? (
            <p className="mt-4 text-sm text-fg-muted">Not following anyone yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {follows.map((f) => (
                <li
                  key={f.leaderPubkey}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-raised p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg-primary">
                      {f.label ?? shortenPubkey(f.leaderPubkey)}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-fg-muted">
                      {shortenPubkey(f.leaderPubkey)} · {f.allocationPct}% alloc
                      {f.baselineSymbols.length === 0 ? ' · syncing…' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      unfollow(f.leaderPubkey);
                    }}
                    className="rounded-md border border-border-subtle px-3 py-1.5 text-[11px] text-fg-secondary transition-colors hover:bg-bg-hover"
                  >
                    Unfollow
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
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