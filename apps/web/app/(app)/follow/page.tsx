'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useCopyTrade } from '@/components/copy-trade-provider';
import { useToast } from '@/components/toast';
import { MOCK_LEADERS, type MockLeader, type TraderStyle } from '@/lib/mock-data/leaders';
import { useUserPrefs } from '@/lib/user-prefs';

/**
 * /follow — minimalist leaderboard.
 *
 * Visible by default:
 *   - Small label ("Leaders")
 *   - Vertical list: handle, style tag, 30d PnL (+%)
 *
 * Behind "Filter":
 *   - Style filter (All/Trend/Swing/Scalp/Basis)
 *   - Sort dropdown (PnL/Win/DD/Followers)
 *
 * Every row taps through to the leader profile.
 */

type SortBy = 'pnl30d' | 'winRate' | 'drawdown' | 'followers';

const STYLES: readonly { readonly id: TraderStyle | 'all'; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'trend', label: 'Trend' },
  { id: 'swing', label: 'Swing' },
  { id: 'scalper', label: 'Scalp' },
  { id: 'basis', label: 'Basis' },
];

const SORT_LABELS: Record<SortBy, string> = {
  pnl30d: 'PnL · 30d',
  winRate: 'Win rate',
  drawdown: 'Drawdown',
  followers: 'Followers',
};

export default function FollowPage() {
  const [styleFilter, setStyleFilter] = useState<TraderStyle | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortBy>('pnl30d');
  const { follows } = useCopyTrade();

  const filtered = useMemo(() => {
    const list = MOCK_LEADERS.filter(
      (l) => styleFilter === 'all' || l.style === styleFilter,
    );
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'pnl30d':
          return b.pnl30dUsd - a.pnl30dUsd;
        case 'winRate':
          return b.winRate - a.winRate;
        case 'drawdown':
          return a.maxDrawdownPct - b.maxDrawdownPct;
        case 'followers':
          return b.followers - a.followers;
      }
    });
  }, [styleFilter, sortBy]);

  // Set lookup so Copy buttons can tell which leaders are already
  // in the user's copy-trade list (renders "Copying" badge instead
  // of the action). Keyed by walletPubkey.
  const followingSet = useMemo(
    () => new Set(follows.map((f) => f.leaderPubkey)),
    [follows],
  );

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-xl">
        {/* Hero — title + subtitle, plus a "Copying N" pill on the right
            when relevant. Same typography rhythm as /cash. */}
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
              Leaders
            </h1>
            <p className="mt-1 text-[13px] text-fg-muted">
              Copy the winners. Sleep through the liquidations.
            </p>
          </div>
          {follows.length > 0 && (
            <Link
              href="/copy-trade"
              className="shrink-0 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Copying {follows.length} →
            </Link>
          )}
        </header>

        {/* Filter row — quick chips inline, sort as a select. The "All"
            chip stays first so the default state is one tap from any
            other filter. */}
        <div className="mt-6 flex items-center gap-3">
          <div className="flex flex-1 flex-wrap gap-1.5 overflow-hidden">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setStyleFilter(s.id);
                }}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  styleFilter === s.id
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-border-subtle bg-bg-surface text-fg-secondary hover:border-border hover:text-fg-primary'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortBy);
              }}
              aria-label="Sort by"
              className="appearance-none rounded-full border border-border-subtle bg-bg-surface px-3 py-1.5 pr-7 text-[12px] font-medium text-fg-secondary transition-colors hover:border-border focus:border-accent focus:outline-none"
            >
              {(Object.keys(SORT_LABELS) as SortBy[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-fg-muted"
            >
              ▼
            </span>
          </div>
        </div>

        {/* Leader cards — Revolut-style list, each row a tappable card
            with circular avatar + handle + meta + 30d PnL on the right.
            Card padding makes the touch target feel deliberate; hover
            lifts the surface tone. */}
        <ul className="mt-6 space-y-2">
          {filtered.map((l) => (
            <li key={l.handle}>
              <div className="flex items-center gap-3 rounded-klub-lg border border-border-subtle bg-bg-surface p-3 transition-colors hover:bg-bg-elevated">
                <Link
                  href={`/follow/${l.handle}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold uppercase text-bg-base"
                    style={{ backgroundColor: `hsl(${l.avatarHue}, 62%, 70%)` }}
                  >
                    {l.handle.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-fg-primary">
                        @{l.handle}
                      </span>
                      <span className="rounded-full bg-bg-elevated px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.06em] text-fg-muted">
                        {l.style}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
                      {l.winRate}% win · −{l.maxDrawdownPct.toFixed(1)}% max DD
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-mono text-[14px] font-semibold ${l.pnl30dUsd >= 0 ? 'text-pnl-long' : 'text-pnl-short'}`}
                    >
                      {l.pnl30dUsd >= 0 ? '+' : '−'}$
                      {Math.abs(l.pnl30dUsd).toLocaleString()}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
                      30d
                    </div>
                  </div>
                </Link>
                <RowCopyAction
                  leader={l}
                  isCopying={followingSet.has(l.walletPubkey)}
                />
              </div>
            </li>
          ))}
        </ul>

        {filtered.length === 0 && (
          <div className="mt-10 rounded-klub-lg border border-border-subtle bg-bg-surface/40 px-5 py-10 text-center">
            <div className="text-[13px] font-medium text-fg-secondary">
              No leaders match that filter.
            </div>
            <div className="mt-1 text-[11px] text-fg-muted">
              Try widening the style or switching the sort.
            </div>
          </div>
        )}

      </div>
    </main>
  );
}

/**
 * RowCopyAction — inline Copy button on a leaderboard row.
 *
 * One-tap: copies with the user's default allocation from prefs.
 * If the user is already copying this leader, renders an inert
 * "Copying" badge instead — to adjust allocation or unfollow, they
 * tap through to the profile page.
 */
function RowCopyAction({
  leader,
  isCopying,
}: {
  readonly leader: MockLeader;
  readonly isCopying: boolean;
}) {
  const { follow } = useCopyTrade();
  const toast = useToast();
  const { prefs } = useUserPrefs();

  if (isCopying) {
    return (
      <span className="shrink-0 rounded-md border border-border-subtle bg-bg-surface px-2.5 py-1 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
        Copying
      </span>
    );
  }

  function onCopy(e: React.MouseEvent<HTMLButtonElement>) {
    // stopPropagation so the row's <Link> click doesn't also fire.
    e.stopPropagation();
    e.preventDefault();
    follow({
      leaderPubkey: leader.walletPubkey,
      label: leader.handle,
      allocationPct: prefs.defaultCopyAllocPct,
    });
    toast.success(`Copying @${leader.handle}`, `${prefs.defaultCopyAllocPct}% per trade.`);
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className="shrink-0 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
    >
      Copy
    </button>
  );
}
