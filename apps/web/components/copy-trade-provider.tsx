'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useBulkAccount } from '@/hooks/use-bulk-account';
import { detectSignals, type Follow, type MirrorSignal } from '@/lib/copy-trade/engine';
import {
  addFollow as storeAddFollow,
  listFollows as storeListFollows,
  markSymbolMirrored as storeMarkSymbolMirrored,
  patchMirrorPosition as storePatchMirrorPosition,
  removeFollow as storeRemoveFollow,
  setLastKnownPositions as storeSetLastKnownPositions,
} from '@/lib/copy-trade/store';
import { useTradingWallet } from '@/lib/trading-wallet';

/**
 * CopyTradeProvider — runs the live engine and exposes signals.
 *
 * Mounted once at the (app) layout level so it persists across
 * navigation. Responsibilities:
 *
 *   1. Read the current user's follows from localStorage on mount
 *      and on pubkey change.
 *   2. For each active follow, mount a <LeaderWatcher/> that polls
 *      the leader's account (via `useBulkAccount`) and diffs against
 *      the follow's baseline to detect new trades.
 *   3. Maintain a queue of `pendingMirrors` — detected trades the
 *      user hasn't yet acted on. The banner reads from this queue.
 *   4. Expose `follow/unfollow` mutators so the /copy-trade page can
 *      manage the list without touching the store directly.
 *   5. Expose `dismissMirror` so the banner can remove a signal once
 *      the user has Mirrored or Skipped it.
 *
 * Design note — why a subcomponent per-follow:
 *   React's rules of hooks forbid calling `useBulkAccount` in a loop.
 *   We instead render one `<LeaderWatcher/>` per follow, each of
 *   which owns a single `useBulkAccount` subscription. Adding /
 *   removing a follow mounts / unmounts its watcher cleanly.
 */

interface CopyTradeContextValue {
  readonly follows: readonly Follow[];
  readonly pendingMirrors: readonly MirrorSignal[];
  readonly follow: (input: {
    readonly leaderPubkey: string;
    readonly label?: string;
    readonly allocationPct: number;
  }) => void;
  readonly unfollow: (leaderPubkey: string) => void;
  readonly dismissMirror: (id: string) => void;
  /**
   * Called by the banner after a mirror order fires successfully,
   * so the engine remembers how much of each symbol the follower
   * actually mirrored. Signed delta — positive for longs acquired,
   * negative for shorts acquired or longs unwound.
   */
  readonly notePositionChange: (
    leaderPubkey: string,
    symbol: string,
    signedDelta: number,
  ) => void;
}

const Ctx = createContext<CopyTradeContextValue | null>(null);

export function CopyTradeProvider({ children }: { readonly children: ReactNode }) {
  const wallet = useTradingWallet();
  const followerPubkey = wallet.publicKeyBase58;

  const [follows, setFollows] = useState<readonly Follow[]>([]);
  const [pendingMirrors, setPendingMirrors] = useState<readonly MirrorSignal[]>([]);

  // Load follows when pubkey becomes available or changes.
  useEffect(() => {
    setFollows(storeListFollows(followerPubkey));
  }, [followerPubkey]);

  const emitSignals = useCallback((sigs: readonly MirrorSignal[]) => {
    if (sigs.length === 0) return;
    setPendingMirrors((prev) => {
      // De-dupe by id — a watcher re-polling shouldn't add a second
      // banner card for the same symbol.
      const existing = new Set(prev.map((s) => s.id));
      const fresh = sigs.filter((s) => !existing.has(s.id));
      if (fresh.length === 0) return prev;
      return [...prev, ...fresh];
    });
  }, []);

  const follow = useCallback(
    (input: {
      readonly leaderPubkey: string;
      readonly label?: string;
      readonly allocationPct: number;
    }) => {
      if (!followerPubkey) return;
      // New follow starts with empty baseline — the watcher's first
      // non-empty snapshot will populate it. Until baseline is set,
      // the follow is in "learning" mode and emits no signals.
      const record: Follow = {
        leaderPubkey: input.leaderPubkey,
        ...(input.label !== undefined ? { label: input.label } : {}),
        allocationPct: input.allocationPct,
        createdAt: Date.now(),
        baselineSymbols: [],
        mirroredSymbols: [],
      };
      const next = storeAddFollow(followerPubkey, record);
      setFollows(next);
    },
    [followerPubkey],
  );

  const unfollow = useCallback(
    (leaderPubkey: string) => {
      if (!followerPubkey) return;
      const next = storeRemoveFollow(followerPubkey, leaderPubkey);
      setFollows(next);
      // Drop any pending mirrors from this leader.
      setPendingMirrors((prev) => prev.filter((s) => s.leaderPubkey !== leaderPubkey));
    },
    [followerPubkey],
  );

  const dismissMirror = useCallback(
    (id: string) => {
      setPendingMirrors((prev) => {
        const target = prev.find((s) => s.id === id);
        if (target && followerPubkey) {
          // Mark as mirrored in the follow so we don't re-surface
          // this same symbol on the next poll tick.
          const next = storeMarkSymbolMirrored(
            followerPubkey,
            target.leaderPubkey,
            target.symbol,
          );
          setFollows(next);
        }
        return prev.filter((s) => s.id !== id);
      });
    },
    [followerPubkey],
  );

  const setBaselineForFollow = useCallback(
    (leaderPubkey: string, symbols: readonly string[]) => {
      if (!followerPubkey) return;
      // One-time baseline write. Uses the store's updateFollow so
      // we stay consistent with localStorage. Re-setting would erase
      // progress; we only set when baseline is currently empty.
      setFollows((prev) => {
        const target = prev.find((f) => f.leaderPubkey === leaderPubkey);
        if (!target || target.baselineSymbols.length > 0) return prev;
        const updated: Follow = { ...target, baselineSymbols: symbols };
        // Write through to storage.
        storeAddFollow(followerPubkey, updated);
        return prev.map((f) => (f.leaderPubkey === leaderPubkey ? updated : f));
      });
    },
    [followerPubkey],
  );

  // Day 5: called by the LeaderWatcher after every processed tick so
  // the next tick can diff. Separate from baseline because baseline
  // is write-once while lastKnown changes every tick.
  const persistLastKnown = useCallback(
    (leaderPubkey: string, positions: Readonly<Record<string, number>>) => {
      if (!followerPubkey) return;
      const next = storeSetLastKnownPositions(followerPubkey, leaderPubkey, positions);
      setFollows(next);
    },
    [followerPubkey],
  );

  // Day 5: called by the banner after a mirror order fires so the
  // engine remembers the follower's exposure and can size close /
  // decrease signals correctly later.
  const notePositionChange = useCallback(
    (leaderPubkey: string, symbol: string, signedDelta: number) => {
      if (!followerPubkey) return;
      const next = storePatchMirrorPosition(
        followerPubkey,
        leaderPubkey,
        symbol,
        signedDelta,
      );
      setFollows(next);
    },
    [followerPubkey],
  );

  // Follower equity for sizing — the Watcher needs this per-tick so
  // we fetch it here at the provider level and pass it down.
  const { state: selfAccount } = useBulkAccount(followerPubkey);
  const followerEquity = selfAccount.data?.equityUsd ?? 0;

  const value = useMemo<CopyTradeContextValue>(
    () => ({
      follows,
      pendingMirrors,
      follow,
      unfollow,
      dismissMirror,
      notePositionChange,
    }),
    [follows, pendingMirrors, follow, unfollow, dismissMirror, notePositionChange],
  );

  return (
    <Ctx.Provider value={value}>
      {follows.map((f) => (
        <LeaderWatcher
          key={f.leaderPubkey}
          follow={f}
          followerEquityUsd={followerEquity}
          onSignals={emitSignals}
          onBaseline={setBaselineForFollow}
          onLastKnown={persistLastKnown}
        />
      ))}
      {children}
    </Ctx.Provider>
  );
}

/**
 * One watcher per active follow. Owns a single `useBulkAccount` for
 * the leader's pubkey. When positions arrive:
 *
 *   - First non-empty snapshot → set baseline (no signals emitted).
 *   - Subsequent snapshots → run `detectSignals` to diff against
 *     `follow.lastKnownPositions`, emit the resulting OPEN / CLOSE
 *     / INCREASE / DECREASE signals, then persist the new snapshot.
 *
 * We short-circuit if the follower's equity is 0 — there's nothing
 * to allocate and sizing would come back zero for opens anyway
 * (close signals are still valid with zero equity, but if the user
 * has zero equity they also have nothing to close, so we skip).
 */
function LeaderWatcher({
  follow,
  followerEquityUsd,
  onSignals,
  onBaseline,
  onLastKnown,
}: {
  readonly follow: Follow;
  readonly followerEquityUsd: number;
  readonly onSignals: (sigs: readonly MirrorSignal[]) => void;
  readonly onBaseline: (leaderPubkey: string, symbols: readonly string[]) => void;
  readonly onLastKnown: (
    leaderPubkey: string,
    positions: Readonly<Record<string, number>>,
  ) => void;
}): null {
  const { state } = useBulkAccount(follow.leaderPubkey);
  const lastFingerprintRef = useRef<string>('');

  useEffect(() => {
    const snapshot = state.data;
    if (!snapshot) return;

    const positions = snapshot.positions
      .filter((p) => p.sizeBase !== 0)
      .map((p) => ({
        symbol: p.symbol,
        sizeBase: p.sizeBase,
        entryPrice: p.entryPrice,
      }));

    // Skip if nothing meaningful changed in the leader's book since
    // the last tick. Fingerprint is symbol+size — unchanged means no
    // diff to compute.
    const fingerprint = positions
      .map((p) => `${p.symbol}:${p.sizeBase}`)
      .sort()
      .join('|');
    if (fingerprint === lastFingerprintRef.current) return;
    lastFingerprintRef.current = fingerprint;

    // Baseline not yet set → set it from this snapshot and stop.
    // Even an empty positions list counts as a valid baseline —
    // it just means the leader currently holds nothing.
    if (follow.baselineSymbols.length === 0) {
      onBaseline(
        follow.leaderPubkey,
        positions.map((p) => p.symbol),
      );
      // Also write the initial lastKnown so we can diff from here.
      const initialMap: Record<string, number> = {};
      for (const p of positions) initialMap[p.symbol] = p.sizeBase;
      onLastKnown(follow.leaderPubkey, initialMap);
      return;
    }

    if (followerEquityUsd > 0) {
      const signals = detectSignals(follow, positions, followerEquityUsd);
      if (signals.length > 0) onSignals(signals);
    }

    // Always persist lastKnown even if we didn't emit signals (e.g.
    // when followerEquity is 0). Next tick's diff depends on it.
    const nextMap: Record<string, number> = {};
    for (const p of positions) nextMap[p.symbol] = p.sizeBase;
    onLastKnown(follow.leaderPubkey, nextMap);
  }, [state.data, follow, followerEquityUsd, onBaseline, onSignals, onLastKnown]);

  return null;
}

export function useCopyTrade(): CopyTradeContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCopyTrade must be used within <CopyTradeProvider>');
  return v;
}
