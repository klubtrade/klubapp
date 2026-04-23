import type { HealthInput } from '@klub/calc';

import type { BulkAccountSnapshot, BulkPosition } from '@/hooks/use-bulk-account';
import type { RiskSurfaceParams } from '@/hooks/use-risk-surfaces-rest';

/**
 * Shared adapter between /home and /health so both pages derive
 * the health score from the same inputs and end up with the same
 * number. Previously /home was computing a proxy score
 * (100 × (1 − marginUsed/totalBalance)) while /health ran the
 * canonical `healthScore()` — two different formulas displayed on
 * two screens, which confused users comparing them.
 *
 * Any page showing a health score should route through
 * `buildHealthInput()` + `@klub/calc.healthScore()`. If the page
 * needs just ONE number without the sub-breakdown, call
 * `healthScore(buildHealthInput(...)).score`.
 *
 * Day 3 change: the per-symbol mm input is now the full
 * `RiskSurfaceParams` (leverage × notional × side grid) rather than
 * a single scalar. For each position we look up the grid cell that
 * matches its actual notional + implicit leverage + side, giving a
 * position-aware mmFraction rather than a one-per-market floor.
 */

/** Maintenance margin fraction fallback for markets with no
 *  risk-surface grid (Bulk hasn't published, or request failed). */
export const PLACEHOLDER_MAINTENANCE_MARGIN_FRAC = 0.005;

/** Funding rate fallback when a ticker has no live funding yet. */
export const PLACEHOLDER_FUNDING_8H = 0.0001;

export type LivePriceMap = Record<
  string,
  { readonly mark: number; readonly fundingRate: number } | undefined
>;

export type RiskSurfaceMap = Record<string, RiskSurfaceParams | undefined>;

export function buildHealthInput(
  snapshot: BulkAccountSnapshot | null,
  livePrices: LivePriceMap,
  mmSurfaces?: RiskSurfaceMap,
): HealthInput | null {
  if (!snapshot) return null;
  if (snapshot.equityUsd === null) return null;
  if (snapshot.positions.length === 0) return null;
  const equityUsd = snapshot.equityUsd;
  return {
    equityUsd,
    collateralUsd: equityUsd,
    positions: snapshot.positions.map((p) =>
      toHealthPosition(p, equityUsd, livePrices, mmSurfaces),
    ),
  };
}

/**
 * Returns true when every position in the snapshot has a
 * risk-surface grid available (i.e. we can do real per-position mm
 * lookup, not fallback). Used by /health to hide the placeholder
 * caveat banner.
 */
export function hasRealMmForAllPositions(
  snapshot: BulkAccountSnapshot | null,
  mmSurfaces: RiskSurfaceMap,
): boolean {
  if (!snapshot || snapshot.positions.length === 0) return false;
  return snapshot.positions.every((p) => {
    const params = mmSurfaces[p.symbol];
    return (
      !!params &&
      typeof params.mmFraction === 'number' &&
      Number.isFinite(params.mmFraction)
    );
  });
}

function toHealthPosition(
  p: BulkPosition,
  equityUsd: number,
  livePrices: LivePriceMap,
  mmSurfaces: RiskSurfaceMap | undefined,
): HealthInput['positions'][number] {
  const live = livePrices[p.symbol];
  const markPrice = live?.mark ?? p.fairPrice;
  const fundingRate = live?.fundingRate ?? PLACEHOLDER_FUNDING_8H;
  const notional = Math.abs(p.sizeBase) * markPrice;

  const LIQ_KEYS = ['liqPrice', 'liquidationPrice', 'liqPx'] as const;
  const liqFromTop = pickNumber(p, LIQ_KEYS);
  const liqFromRaw = Number.isFinite(liqFromTop) ? liqFromTop : pickNumber(p.raw, LIQ_KEYS);

  // Implicit leverage approximation: notional / equity. Treats each
  // position as if it used the full account equity, which is
  // conservative — it biases the grid lookup toward higher leverage
  // knots, which return higher mmFractions, which gives a safer
  // (lower) health reading. Bulk's actual portfolio-margin math is
  // more nuanced but Bulk doesn't surface per-position margin
  // allocation in the account snapshot today.
  const effectiveLeverage = equityUsd > 0 ? Math.max(1, notional / equityUsd) : 1;

  const side: 'long' | 'short' = p.sizeBase > 0 ? 'long' : 'short';
  const params = mmSurfaces?.[p.symbol];
  const mmFrac = params
    ? lookupPositionMm(params, side, notional, effectiveLeverage)
    : PLACEHOLDER_MAINTENANCE_MARGIN_FRAC;

  return {
    symbol: p.symbol,
    size: p.sizeBase,
    entryPrice: p.entryPrice,
    markPrice,
    liqPrice: Number.isFinite(liqFromRaw)
      ? liqFromRaw
      : estimateLiqPrice(p.sizeBase, markPrice, mmFrac),
    maintenanceMarginUsd: notional * mmFrac,
    funding8hRate: fundingRate,
  };
}

/**
 * Nearest-knot (floor-snap) lookup into Bulk's mm grid.
 *
 * Bulk's grid is published at fixed leverage + notional knots
 * (e.g. leverage [1, 2, ..., 50], notionals [50k, 100k, ...]).
 * Given a position's actual (side, notional, leverage), we snap
 * each axis DOWN to the highest knot ≤ the value, then read
 * `buy[notional_idx][leverage_idx]` (or `sell[...]` for shorts).
 *
 * Floor-snap is the right choice here: margin tiers work by
 * qualifying into the next level, and reading the lower-knot cell
 * returns a conservative (lower-leverage, lower-mm) value that
 * Bulk would actually apply. Bilinear interpolation is a
 * refinement for a later day.
 *
 * Falls back to `params.mmFraction` (the grid's lowest-corner
 * value, typically 0.02) if the grid is missing or the computed
 * index lands in a hole.
 */
export function lookupPositionMm(
  params: RiskSurfaceParams,
  side: 'long' | 'short',
  notionalUsd: number,
  leverage: number,
): number {
  if (!params.leverageKnots || !params.notionalKnots) return params.mmFraction;
  const gridTable = side === 'long' ? params.buy : params.sell;
  if (!gridTable) return params.mmFraction;

  let notionalIdx = 0;
  for (let i = 0; i < params.notionalKnots.length; i++) {
    const knot = params.notionalKnots[i];
    if (typeof knot === 'number' && notionalUsd >= knot) notionalIdx = i;
    else break;
  }

  let leverageIdx = 0;
  for (let i = 0; i < params.leverageKnots.length; i++) {
    const knot = params.leverageKnots[i];
    if (typeof knot === 'number' && leverage >= knot) leverageIdx = i;
    else break;
  }

  const row = gridTable[notionalIdx];
  const mm = row ? row[leverageIdx] : undefined;
  return typeof mm === 'number' && Number.isFinite(mm) ? mm : params.mmFraction;
}

function pickNumber(obj: unknown, keys: readonly string[]): number {
  if (!obj || typeof obj !== 'object') return NaN;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number.parseFloat(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

function estimateLiqPrice(sizeBase: number, markPrice: number, mmFrac: number): number {
  const isLong = sizeBase > 0;
  return isLong ? markPrice * (1 - mmFrac * 20) : markPrice * (1 + mmFrac * 20);
}
