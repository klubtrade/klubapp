// apps/web/lib/copy-trade/engine.ts

/**
 * Copy-trade engine - pure logic.
 *
 * Day 4 (v1): detected new positions opening only.
 * Day 5 (v2): detects OPEN / CLOSE / INCREASE / DECREASE.
 *
 * This module is pure TypeScript, no React, no I/O. It contains:
 *   - The types for a Follow record and a detected mirror signal
 *   - Diff logic (`detectSignals`) for spotting leader position changes
 *   - Sizing logic (`computeMirrorSize`) for proportionally sizing the
 *     follower's mirror given the leader's trade + follower's equity
 *
 * The worker scaffold in `apps/worker/src/workers/copy-trade-worker.ts`
 * has a similar `computeMirroredSize` - the implementations match by
 * design, because a future milestone will migrate the client-side
 * engine to the worker and we don't want two different sizing
 * formulas floating around. If you change one, change both.
 *
 * The React-layer glue (polling, banner, localStorage) lives in
 * `copy-trade-provider.tsx` and `store.ts`.
 */

export type SignalAction = 'open' | 'close' | 'increase' | 'decrease';

export interface Follow {
  /** Bulk pubkey of the leader being followed. */
  readonly leaderPubkey: string;
  /** Optional display nickname. */
  readonly label?: string;
  /** Percentage of follower equity to allocate per leader trade. 1-100. */
  readonly allocationPct: number;
  /** When the follow was created, for UI + sort. */
  readonly createdAt: number;
  /**
   * Pre-existing leader exposure at the time of follow. These
   * positions are NOT mirrored - we only act on changes that happen
   * after baseline is set.
   */
  readonly baselineSymbols: readonly string[];
  /**
   * Symbols we've already surfaced a mirror signal for. Day 4 used
   * this flat list; Day 5 keeps it for back-compat but relies mostly
   * on `lastKnownPositions` below. Presence in `mirroredSymbols`
   * suppresses future OPEN signals for that symbol until the leader
   * fully closes it.
   */
  readonly mirroredSymbols: readonly string[];
  /**
   * Day 5 addition: snapshot of the leader's position map at the last
   * tick we processed. Used to compute diffs (open / close / size
   * change). Keyed by symbol; value is signed sizeBase (negative for
   * shorts). Missing means we haven't seen a snapshot yet.
   */
  readonly lastKnownPositions?: Readonly<Record<string, number>>;
  /**
   * Day 5 addition: follower's current position in each mirrored
   * symbol. Used when the leader closes so we know what to send to
   * the follower's account to close THEIR mirror (they may have
   * mirrored at a different size than the leader was holding).
   * Keyed by symbol; value is signed sizeBase.
   */
  readonly mirrorPositions?: Readonly<Record<string, number>>;
  /**
   * When true, the first leader snapshot after follow creation can emit
   * open signals for positions the leader already has.
   */
  readonly mirrorExistingOnFollow?: boolean;
}

export interface LeaderPositionSnapshot {
  readonly symbol: string;
  /** Signed: negative = short. */
  readonly sizeBase: number;
  /** Average entry price, for sizing the mirror. */
  readonly entryPrice: number;
}

export interface MirrorSignal {
  /** Stable id for the UI banner queue. `{leaderPubkey}:{symbol}:{action}:{ts}`. */
  readonly id: string;
  readonly leaderPubkey: string;
  readonly leaderLabel: string | undefined;
  readonly symbol: string;
  /** What the leader did, which determines the order the follower should send. */
  readonly action: SignalAction;
  /** Side of the leader's position BEFORE the change (useful for close signals). */
  readonly side: 'long' | 'short';
  readonly leaderSizeBase: number;
  readonly leaderEntryPrice: number;
  /**
   * Proposed follower action size (absolute, positive). For OPEN +
   * INCREASE: the size to BUY/SELL to open/extend. For CLOSE: the
   * full mirrored position size to unwind. For DECREASE: the reduced
   * portion to unwind.
   */
  readonly mirrorSizeBase: number;
  /** Notional USD of the proposed mirror action. */
  readonly mirrorNotionalUsd: number;
  /** Follower allocation the mirror consumes (zero for close/decrease). */
  readonly allocatedUsd: number;
  /** When the signal was generated, client-side. */
  readonly detectedAt: number;
}

/**
 * Diff the leader's current positions against the last tick and emit
 * the full set of signals needed to keep the follower in sync.
 *
 * The rules are:
 *
 *  - OPEN     : symbol is new (not in baseline AND not in
 *               lastKnownPositions) → size the mirror from follower
 *               equity + allocation %, emit open signal.
 *  - CLOSE    : symbol was in lastKnownPositions with nonzero size,
 *               now absent or zero → emit close signal sized to
 *               unwind the follower's tracked mirror position.
 *  - INCREASE : symbol size grew in the SAME direction → emit an
 *               add-on signal sized proportionally to the leader's
 *               add (|newSize| − |oldSize|) × mirrorRatio. Mirror
 *               ratio is derived from the initial mirror (follower
 *               allocation / leader entry) so the follower scales
 *               with the leader's own risk.
 *  - DECREASE : symbol size shrank but didn't close → proportional
 *               partial unwind, same formula but opposite direction.
 *  - FLIP     : symbol crossed zero (long → short or vice versa) →
 *               two signals: close the old side, open the new side.
 *
 * Baseline positions (present at follow time) are ignored for OPEN
 * but DO contribute to lastKnownPositions, so closes/changes on
 * those positions still fire once the follow is active.
 *
 * Day 5 NOTE: we do NOT emit INCREASE/DECREASE signals for symbols
 * the follower never mirrored (baseline-only positions) - there's
 * nothing to adjust. Only OPEN+CLOSE fire on baseline symbols.
 */
export function detectSignals(
  follow: Follow,
  currentPositions: readonly LeaderPositionSnapshot[],
  followerEquityUsd: number,
  now: number = Date.now(),
): readonly MirrorSignal[] {
  const signals: MirrorSignal[] = [];
  const baseline = new Set(follow.baselineSymbols);
  const lastKnown = follow.lastKnownPositions ?? {};
  const mirrorPositions = follow.mirrorPositions ?? {};

  // Build a quick lookup of current leader positions for close
  // detection (symbols that were known last tick but are absent now).
  const currentBySymbol = new Map<string, LeaderPositionSnapshot>();
  for (const p of currentPositions) {
    if (p.sizeBase !== 0) currentBySymbol.set(p.symbol, p);
  }

  // --- OPEN / INCREASE / DECREASE / FLIP on current positions ---
  for (const pos of currentPositions) {
    if (pos.sizeBase === 0) continue;
    if (!Number.isFinite(pos.entryPrice) || pos.entryPrice <= 0) continue;

    const prior = lastKnown[pos.symbol];
    const newSize = pos.sizeBase;
    const side: 'long' | 'short' = newSize > 0 ? 'long' : 'short';

    // CASE: never seen before AND not baseline → OPEN.
    if (prior === undefined && !baseline.has(pos.symbol)) {
      const sizing = computeMirrorSize({
        leaderEntryPrice: pos.entryPrice,
        followerEquityUsd,
        allocationPct: follow.allocationPct,
      });
      if (sizing.mirrorSizeBase > 0) {
        signals.push({
          id: `${follow.leaderPubkey}:${pos.symbol}:open:${now}`,
          leaderPubkey: follow.leaderPubkey,
          leaderLabel: follow.label,
          symbol: pos.symbol,
          action: 'open',
          side,
          leaderSizeBase: newSize,
          leaderEntryPrice: pos.entryPrice,
          mirrorSizeBase: sizing.mirrorSizeBase,
          mirrorNotionalUsd: sizing.mirrorNotionalUsd,
          allocatedUsd: sizing.allocatedUsd,
          detectedAt: now,
        });
      }
      continue;
    }

    // CASE: seen before, no size change → nothing to do.
    if (prior !== undefined && prior === newSize) continue;

    // CASE: seen before, size changed.
    if (prior !== undefined && prior !== newSize) {
      // FLIP: crossed zero. Emit a close for the old side sized from
      // the follower's existing mirror, then an open for the new side
      // sized from the allocation. Two signals, in that order.
      const crossedZero = Math.sign(prior) !== 0 && Math.sign(newSize) !== Math.sign(prior);
      if (crossedZero) {
        const followerOld = mirrorPositions[pos.symbol];
        if (followerOld && followerOld !== 0) {
          signals.push({
            id: `${follow.leaderPubkey}:${pos.symbol}:close:${now}`,
            leaderPubkey: follow.leaderPubkey,
            leaderLabel: follow.label,
            symbol: pos.symbol,
            action: 'close',
            side: followerOld > 0 ? 'long' : 'short',
            leaderSizeBase: prior,
            leaderEntryPrice: pos.entryPrice,
            mirrorSizeBase: Math.abs(followerOld),
            mirrorNotionalUsd: Math.abs(followerOld) * pos.entryPrice,
            allocatedUsd: 0,
            detectedAt: now,
          });
        }
        const sizing = computeMirrorSize({
          leaderEntryPrice: pos.entryPrice,
          followerEquityUsd,
          allocationPct: follow.allocationPct,
        });
        if (sizing.mirrorSizeBase > 0) {
          signals.push({
            id: `${follow.leaderPubkey}:${pos.symbol}:open:${now + 1}`,
            leaderPubkey: follow.leaderPubkey,
            leaderLabel: follow.label,
            symbol: pos.symbol,
            action: 'open',
            side,
            leaderSizeBase: newSize,
            leaderEntryPrice: pos.entryPrice,
            mirrorSizeBase: sizing.mirrorSizeBase,
            mirrorNotionalUsd: sizing.mirrorNotionalUsd,
            allocatedUsd: sizing.allocatedUsd,
            detectedAt: now,
          });
        }
        continue;
      }

      // INCREASE / DECREASE: same-side size change. Proportional
      // adjustment derived from follower's current mirror size.
      const followerCurrent = mirrorPositions[pos.symbol] ?? 0;
      // If follower has no mirror position (baseline-only or never
      // accepted the open signal), we skip - nothing to adjust.
      if (followerCurrent === 0) continue;

      const leaderDeltaAbs = Math.abs(Math.abs(newSize) - Math.abs(prior));
      const leaderPriorAbs = Math.abs(prior);
      if (leaderPriorAbs === 0 || leaderDeltaAbs === 0) continue;

      const ratio = Math.abs(followerCurrent) / leaderPriorAbs;
      const mirrorDelta = leaderDeltaAbs * ratio;
      if (mirrorDelta <= 0) continue;

      const action: SignalAction =
        Math.abs(newSize) > Math.abs(prior) ? 'increase' : 'decrease';

      signals.push({
        id: `${follow.leaderPubkey}:${pos.symbol}:${action}:${now}`,
        leaderPubkey: follow.leaderPubkey,
        leaderLabel: follow.label,
        symbol: pos.symbol,
        action,
        side,
        leaderSizeBase: newSize,
        leaderEntryPrice: pos.entryPrice,
        mirrorSizeBase: mirrorDelta,
        mirrorNotionalUsd: mirrorDelta * pos.entryPrice,
        allocatedUsd: action === 'increase' ? mirrorDelta * pos.entryPrice : 0,
        detectedAt: now,
      });
    }
  }

  // --- CLOSE on absent symbols ---
  for (const [symbol, priorSize] of Object.entries(lastKnown)) {
    if (priorSize === 0) continue;
    if (currentBySymbol.has(symbol)) continue;
    // Leader fully closed this position.
    const followerPrior = mirrorPositions[symbol];
    if (!followerPrior || followerPrior === 0) continue;

    signals.push({
      id: `${follow.leaderPubkey}:${symbol}:close:${now}`,
      leaderPubkey: follow.leaderPubkey,
      leaderLabel: follow.label,
      symbol,
      action: 'close',
      side: followerPrior > 0 ? 'long' : 'short',
      leaderSizeBase: priorSize,
      // We don't have a fresh entry price since the leader already
      // closed; we leave this as 0 so the UI knows to look up mark
      // price at execution time.
      leaderEntryPrice: 0,
      mirrorSizeBase: Math.abs(followerPrior),
      mirrorNotionalUsd: 0,
      allocatedUsd: 0,
      detectedAt: now,
    });
  }

  return signals;
}

/**
 * Back-compat shim - Day 4 callers used `detectNewTrades`. Kept as
 * a thin wrapper so callers that haven't migrated still work, but
 * it now delegates to `detectSignals` and filters to opens only.
 * New code should call `detectSignals` directly.
 */
export function detectNewTrades(
  follow: Follow,
  currentPositions: readonly LeaderPositionSnapshot[],
  followerEquityUsd: number,
  now: number = Date.now(),
): readonly MirrorSignal[] {
  return detectSignals(follow, currentPositions, followerEquityUsd, now).filter(
    (s) => s.action === 'open',
  );
}

export interface MirrorSizing {
  readonly allocatedUsd: number;
  readonly mirrorSizeBase: number;
  readonly mirrorNotionalUsd: number;
}

/**
 * Size the follower's mirror given the leader's trade + follower's
 * equity + allocation preference.
 *
 * Rule: follower allocates `allocationPct%` of their equity to this
 * single mirror and buys as much base as that dollar amount covers at
 * the leader's entry price. We do NOT scale by the leader's position
 * size (since that would require knowing their equity, which is
 * private) - the allocation is purely the follower's.
 *
 * Mirrors the `computeMirroredSize` logic in
 * `apps/worker/src/workers/copy-trade-worker.ts`. Keep in sync.
 *
 * Example:
 *   follower equity $5,000, allocation 20%, leader opens at $67,000
 *   → $1,000 allocated → 0.01492 BTC mirror size → $1,000 notional
 */
export function computeMirrorSize(params: {
  readonly leaderEntryPrice: number;
  readonly followerEquityUsd: number;
  readonly allocationPct: number;
}): MirrorSizing {
  const zero: MirrorSizing = {
    allocatedUsd: 0,
    mirrorSizeBase: 0,
    mirrorNotionalUsd: 0,
  };
  if (params.leaderEntryPrice <= 0) return zero;
  if (params.followerEquityUsd <= 0) return zero;
  if (params.allocationPct <= 0 || params.allocationPct > 100) return zero;
  const allocatedUsd = params.followerEquityUsd * (params.allocationPct / 100);
  const mirrorSizeBase = allocatedUsd / params.leaderEntryPrice;
  const mirrorNotionalUsd = mirrorSizeBase * params.leaderEntryPrice;
  return { allocatedUsd, mirrorSizeBase, mirrorNotionalUsd };
}
