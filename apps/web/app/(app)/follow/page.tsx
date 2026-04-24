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
  const [filterOpen, setFilterOpen] = useState(false);
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
    <main className="min-h-screen">
      <section className="mx-auto max-w-xl px-6 pb-20 pt-28 md:pt-32">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
            Leaders
          </div>
          <div className="flex items-center gap-4">
            {follows.length > 0 && (
              <Link
                href="/copy-trade"
                className="text-[12px] text-fg-muted transition-colors hover:text-fg-primary"
              >
                Copying {follows.length} →
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setFilterOpen((v) => !v);
              }}
              aria-expanded={filterOpen}
              className="text-[12px] text-fg-muted transition-colors hover:text-fg-primary"
            >
              {filterOpen ? 'Close' : 'Filter'}
            </button>
          </div>
        </div>

        {filterOpen && (
          <div className="mt-4 space-y-4 rounded-klub border border-border-subtle bg-bg-surface p-4">
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                Style
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setStyleFilter(s.id);
                    }}
                    className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                      styleFilter === s.id
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border-subtle text-fg-secondary hover:border-border'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                Sort
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(SORT_LABELS) as SortBy[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setSortBy(k);
                    }}
                    className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                      sortBy === k
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border-subtle text-fg-secondary hover:border-border'
                    }`}
                  >
                    {SORT_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <ul className="mt-6 divide-y divide-border-subtle">
          {filtered.map((l) => (
            <li
              key={l.handle}
              className="flex items-center gap-2 px-1 py-4 transition-colors hover:bg-bg-surface"
            >
              <Link
                href={`/follow/${l.handle}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[12px] font-medium uppercase text-bg-base"
                  style={{ backgroundColor: `hsl(${l.avatarHue}, 62%, 70%)` }}
                >
                  {l.handle.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-fg-primary">
                      @{l.handle}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                      {l.style}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
                    {l.winRate}% win · −{l.maxDrawdownPct.toFixed(1)}% max DD
                  </div>
                </div>
                <div
                  className={`text-right font-mono text-[14px] ${l.pnl30dUsd >= 0 ? 'text-pnl-long' : 'text-pnl-short'}`}
                >
                  {l.pnl30dUsd >= 0 ? '+' : '−'}${Math.abs(l.pnl30dUsd).toLocaleString()}
                </div>
              </Link>
              <RowCopyAction
                leader={l}
                isCopying={followingSet.has(l.walletPubkey)}
              />
            </li>
          ))}
        </ul>

        {filtered.length === 0 && (
          <div className="mt-8 text-center text-[13px] text-fg-muted">
            No leaders match that filter.
          </div>
        )}
      </section>
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
