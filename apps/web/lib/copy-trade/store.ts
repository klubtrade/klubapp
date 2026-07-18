// apps/web/lib/copy-trade/store.ts

'use client';

import type { Follow } from './engine';

/**
 * localStorage-backed store for follow records.
 *
 * Keyed per-follower (we use their wallet pubkey as the outer key)
 * so multiple wallets on the same browser don't see each other's
 * follows. A future DB swap replaces this module wholesale; consumers
 * should treat the exported API as stable and not depend on
 * localStorage directly.
 *
 * All functions no-op safely on SSR / without `window`. Reads are
 * JSON-parsed with try/catch so a corrupted entry just returns empty
 * rather than blowing up the page.
 *
 * Day 5 additions:
 *   - `setLastKnownPositions`: store the leader snapshot after each
 *     processed tick so future ticks can diff against it.
 *   - `patchMirrorPosition`: track the follower's own mirror size
 *     per-symbol so close/decrease signals know what to unwind.
 */

const STORAGE_PREFIX = 'klub:copyTrade:';

function storageKey(followerPubkey: string): string {
  return `${STORAGE_PREFIX}${followerPubkey}`;
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function listFollows(followerPubkey: string | null): readonly Follow[] {
  if (!followerPubkey) return [];
  const s = safeStorage();
  if (!s) return [];
  try {
    const raw = s.getItem(storageKey(followerPubkey));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFollow);
  } catch {
    return [];
  }
}

function writeFollows(followerPubkey: string, follows: readonly Follow[]): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(storageKey(followerPubkey), JSON.stringify(follows));
  } catch {
    /* quota exceeded or disabled - silently drop */
  }
}

export function addFollow(
  followerPubkey: string,
  follow: Follow,
): readonly Follow[] {
  const current = listFollows(followerPubkey);
  const next = [
    ...current.filter((f) => f.leaderPubkey !== follow.leaderPubkey),
    follow,
  ];
  writeFollows(followerPubkey, next);
  return next;
}

export function removeFollow(
  followerPubkey: string,
  leaderPubkey: string,
): readonly Follow[] {
  const current = listFollows(followerPubkey);
  const next = current.filter((f) => f.leaderPubkey !== leaderPubkey);
  writeFollows(followerPubkey, next);
  return next;
}

export function updateFollow(
  followerPubkey: string,
  leaderPubkey: string,
  patch: Partial<Follow>,
): readonly Follow[] {
  const current = listFollows(followerPubkey);
  const next = current.map((f) =>
    f.leaderPubkey === leaderPubkey ? { ...f, ...patch } : f,
  );
  writeFollows(followerPubkey, next);
  return next;
}

/**
 * Mark a symbol as having been surfaced as a mirror signal (whether
 * the user accepted or skipped). Prevents re-alerting on the same
 * position on every polling tick.
 */
export function markSymbolMirrored(
  followerPubkey: string,
  leaderPubkey: string,
  symbol: string,
): readonly Follow[] {
  const current = listFollows(followerPubkey);
  const next = current.map((f) => {
    if (f.leaderPubkey !== leaderPubkey) return f;
    if (f.mirroredSymbols.includes(symbol)) return f;
    return { ...f, mirroredSymbols: [...f.mirroredSymbols, symbol] };
  });
  writeFollows(followerPubkey, next);
  return next;
}

/**
 * Day 5: overwrite the leader's last-known position map. Called
 * after each tick from the provider so the next tick can diff.
 * Idempotent with respect to unchanged inputs (we compare to the
 * current value before writing) so we don't thrash localStorage.
 */
export function setLastKnownPositions(
  followerPubkey: string,
  leaderPubkey: string,
  positions: Readonly<Record<string, number>>,
): readonly Follow[] {
  const current = listFollows(followerPubkey);
  const existing = current.find((f) => f.leaderPubkey === leaderPubkey);
  if (!existing) return current;
  if (shallowEqualNumMap(existing.lastKnownPositions, positions)) return current;
  const next = current.map((f) =>
    f.leaderPubkey === leaderPubkey ? { ...f, lastKnownPositions: positions } : f,
  );
  writeFollows(followerPubkey, next);
  return next;
}

/**
 * Day 5: patch the follower's tracked mirror size for a symbol after
 * an order fires successfully. For opens + increases, `delta` is
 * positive (signed by side - e.g. +0.01 for a long, −0.01 for a
 * short). For closes + decreases it's the opposite sign, bringing
 * the tracked size toward zero. Callers pass the signed delta rather
 * than the new absolute size because they already know the sign
 * from the signal.action.
 */
export function patchMirrorPosition(
  followerPubkey: string,
  leaderPubkey: string,
  symbol: string,
  delta: number,
): readonly Follow[] {
  if (delta === 0 || !Number.isFinite(delta)) return listFollows(followerPubkey);
  const current = listFollows(followerPubkey);
  const next = current.map((f) => {
    if (f.leaderPubkey !== leaderPubkey) return f;
    const prior = f.mirrorPositions ?? {};
    const priorSize = prior[symbol] ?? 0;
    const newSize = priorSize + delta;
    const updated: Record<string, number> = { ...prior };
    // If we've crossed or landed on zero within a rounding tolerance,
    // drop the key. This keeps the map tidy and avoids false close
    // signals on a symbol that's already fully unwound.
    if (Math.abs(newSize) < 1e-9) {
      delete updated[symbol];
    } else {
      updated[symbol] = newSize;
    }
    return { ...f, mirrorPositions: updated };
  });
  writeFollows(followerPubkey, next);
  return next;
}

function shallowEqualNumMap(
  a: Readonly<Record<string, number>> | undefined,
  b: Readonly<Record<string, number>>,
): boolean {
  if (!a) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function isFollow(x: unknown): x is Follow {
  if (!x || typeof x !== 'object') return false;
  const f = x as Record<string, unknown>;
  return (
    typeof f['leaderPubkey'] === 'string' &&
    typeof f['allocationPct'] === 'number' &&
    typeof f['createdAt'] === 'number' &&
    Array.isArray(f['baselineSymbols']) &&
    Array.isArray(f['mirroredSymbols'])
  );
}
