'use client';

import { useEffect, useState } from 'react';

import { useToast } from '@/components/toast';
import { RISK_PRESETS, useUserPrefs } from '@/lib/user-prefs';
import type { MockLeader } from '@/lib/mock-data/leaders';






/**
 * LeaderDetails — minimalist client UI for the leader profile.
 *
 * Renders:
 *   - "Follow" button (primary) + ghost link back to leaders
 *   - Three disclosure toggles: About · Stats · Recent trades
 *   - A modal-style panel for configuring the follow when tapped
 *
 * All state is per-device. Phase 3.5 syncs to Postgres once the user
 * is signed in.
 */

interface FollowConfig {
  readonly handle: string;
  readonly maxAllocPct: number;
  readonly stopOverridePct: number | null;
  readonly copyAll: boolean;
  readonly startedAt: number;
}

const FOLLOWS_KEY = 'klub.follows.v1';

export function LeaderDetails({ leader }: { readonly leader: MockLeader }) {
  const toast = useToast();
  const { prefs } = useUserPrefs();
  const preset = RISK_PRESETS[prefs.riskProfile];

  

  const [maxAllocPct, setMaxAllocPct] = useState(prefs.defaultCopyAllocPct);

  
  const [stopOverridePct, setStopOverridePct] = useState<number | ''>('');
  const [copyAllSymbols, setCopyAllSymbols] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [following, setFollowing] = useState(false);

  const [showAbout, setShowAbout] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showTrades, setShowTrades] = useState(false);

  useEffect(() => {
    try {
      const existing = JSON.parse(localStorage.getItem(FOLLOWS_KEY) ?? '[]') as FollowConfig[];
      setFollowing(existing.some((f) => f.handle === leader.handle));
    } catch {
      /* ignore */
    }
  }, [leader.handle]);

  function handleStart() {
    try {
      const existing = JSON.parse(localStorage.getItem(FOLLOWS_KEY) ?? '[]') as FollowConfig[];
      const next: FollowConfig[] = [
        ...existing.filter((x) => x.handle !== leader.handle),
        {
          handle: leader.handle,
          maxAllocPct,
          stopOverridePct: typeof stopOverridePct === 'number' ? stopOverridePct : null,
          copyAll: copyAllSymbols,
          startedAt: Date.now(),
        },
      ];
      localStorage.setItem(FOLLOWS_KEY, JSON.stringify(next));
      setFollowing(true);
      setConfigOpen(false);
      toast.success(`Following @${leader.handle}`, `Cap ${maxAllocPct}% of account.`);
    } catch {
      toast.error('Could not save follow config');
    }
  }

  function handleUnfollow() {
    try {
      const existing = JSON.parse(localStorage.getItem(FOLLOWS_KEY) ?? '[]') as FollowConfig[];
      localStorage.setItem(
        FOLLOWS_KEY,
        JSON.stringify(existing.filter((x) => x.handle !== leader.handle)),
      );
      setFollowing(false);
      toast.info(`Unfollowed @${leader.handle}`);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {/* Primary action */}
      <div className="mt-8">
        {following ? (
          <button type="button" onClick={handleUnfollow} className="btn-secondary btn-compact">
            Unfollow
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfigOpen(true);
            }}
            className="btn-primary btn-compact btn-lg"
          >
            Follow @{leader.handle}
          </button>
        )}
      </div>

      {/* Disclosures */}
      <div className="mt-10 space-y-2">
        <Disclosure
          label={showAbout ? 'Hide about' : 'About'}
          open={showAbout}
          onToggle={() => {
            setShowAbout((v) => !v);
          }}
        >
          <p className="text-[13px] leading-relaxed text-fg-secondary">{leader.bio}</p>
          {leader.favoriteMarkets.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {leader.favoriteMarkets.map((m) => (
                <span
                  key={m}
                  className="rounded-md border border-border-subtle bg-bg-surface px-2 py-0.5 text-[11px] font-mono text-fg-secondary"
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </Disclosure>

        <Disclosure
          label={showStats ? 'Hide stats' : 'Stats'}
          open={showStats}
          onToggle={() => {
            setShowStats((v) => !v);
          }}
        >
          <dl className="space-y-2.5 text-[13px]">
            <Stat label="Win rate" value={`${leader.winRate}%`} />
            <Stat
              label="Max drawdown"
              value={`−${leader.maxDrawdownPct.toFixed(1)}%`}
              tone="short"
            />
            <Stat label="Followers" value={leader.followers.toLocaleString()} />
            <Stat label="Rank" value={`#${leader.rank}`} />
          </dl>
        </Disclosure>

        {leader.recentTrades.length > 0 && (
          <Disclosure
            label={showTrades ? 'Hide recent trades' : `Recent trades (${leader.recentTrades.length})`}
            open={showTrades}
            onToggle={() => {
              setShowTrades((v) => !v);
            }}
          >
            <ul className="divide-y divide-border-subtle">
              {leader.recentTrades.map((t) => (
                <li
                  key={t.ts}
                  className="flex items-baseline justify-between py-2.5 text-[12px]"
                >
                  <div>
                    <div className="text-fg-primary">
                      <span
                        className={t.side === 'long' ? 'text-pnl-long' : 'text-pnl-short'}
                      >
                        {t.side === 'long' ? 'Long' : 'Short'}
                      </span>{' '}
                      {t.symbol}
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-fg-muted">
                      ${t.entry.toLocaleString()} → ${t.exit.toLocaleString()}
                    </div>
                  </div>
                  <span
                    className={`font-mono ${t.pnlUsd >= 0 ? 'text-pnl-long' : 'text-pnl-short'}`}
                  >
                    {t.pnlUsd >= 0 ? '+' : '−'}${Math.abs(t.pnlUsd).toFixed(0)}
                  </span>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </div>

      {/* Follow config modal */}
      {configOpen && (
        <ConfigModal
          handle={leader.handle}
          maxAllocPct={maxAllocPct}
          setMaxAllocPct={setMaxAllocPct}
          stopOverridePct={stopOverridePct}
          setStopOverridePct={setStopOverridePct}
          copyAllSymbols={copyAllSymbols}
          setCopyAllSymbols={setCopyAllSymbols}
          maxAllowed={preset.maxCopyAllocPct}
          onConfirm={handleStart}
          onCancel={() => {
            setConfigOpen(false);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function Disclosure({
  label,
  open,
  onToggle,
  children,
}: {
  readonly label: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-subtle">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-left text-[14px] text-fg-secondary transition-colors hover:text-fg-primary"
      >
        <span>{label}</span>
        <span className={`text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: 'short' | 'long';
}) {
  const color =
    tone === 'short' ? 'text-pnl-short' : tone === 'long' ? 'text-pnl-long' : 'text-fg-primary';
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={`font-mono ${color}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ConfigModal({
  handle,
  maxAllocPct,
  setMaxAllocPct,
  stopOverridePct,
  setStopOverridePct,
  copyAllSymbols,
  setCopyAllSymbols,
  maxAllowed,
  onConfirm,
  onCancel,
}: {
  readonly handle: string;
  readonly maxAllocPct: number;
  readonly setMaxAllocPct: (v: number) => void;
  readonly stopOverridePct: number | '';
  readonly setStopOverridePct: (v: number | '') => void;
  readonly copyAllSymbols: boolean;
  readonly setCopyAllSymbols: (v: boolean) => void;
  readonly maxAllowed: number;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg-base/70 backdrop-blur-sm md:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-t-klub-lg border border-border bg-bg-surface p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)] md:rounded-klub-lg"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 className="text-[18px] font-semibold text-fg-primary">Follow @{handle}</h2>

        <div className="mt-6 space-y-5">
          {/* Allocation */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                Max allocation
              </span>
              <span className="font-mono text-[15px] text-accent">{maxAllocPct}%</span>
            </div>
            <input
              type="range"
              min={5}
              max={maxAllowed}
              step={5}
              value={Math.min(maxAllocPct, maxAllowed)}
              onChange={(e) => {
                setMaxAllocPct(Number(e.target.value));
              }}
              className="mt-2 h-1 w-full cursor-pointer appearance-none rounded-full bg-border [accent-color:#a78bfa]"
            />
            <div className="mt-1 text-[11px] text-fg-muted">
              Capped at {maxAllowed}% by your risk profile.
            </div>
          </div>

          {/* Stop override */}
          <div>
            <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
              Stop override · optional
            </span>
            <input
              type="number"
              step={0.5}
              min={0}
              value={stopOverridePct}
              placeholder="Use leader's stop"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setStopOverridePct('');
                } else {
                  const n = Number(raw);
                  if (Number.isFinite(n)) setStopOverridePct(n);
                }
              }}
              className="mt-1.5 w-full rounded-klub border border-border bg-bg-base px-3 py-2.5 font-mono text-[14px] focus:border-accent focus:outline-none"
            />
          </div>

          {/* Copy all markets */}
          <button
            type="button"
            onClick={() => {
              setCopyAllSymbols(!copyAllSymbols);
            }}
            className="flex w-full items-center justify-between rounded-klub border border-border-subtle bg-bg-base px-4 py-3 text-left transition-colors hover:border-border"
          >
            <span className="text-[13px] text-fg-primary">Copy all markets</span>
            <span
              className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
                copyAllSymbols ? 'bg-accent' : 'bg-border-default'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg-base transition-transform ${
                  copyAllSymbols ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </div>

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary btn-block">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary btn-block">
            Start following
          </button>
        </div>
      </div>
    </div>
  );
}
