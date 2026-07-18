'use client';

import {
  type BulkCorrelationMatrix,
  calculateBulkPortfolioMaintenanceMargin,
  type BulkMarginPositionInput,
  type HealthInput,
} from '@klub/calc';
import type { RiskStream } from '@klub/api-client';

import type { BulkAccountSnapshot, BulkPosition } from '@/hooks/use-bulk-account';
import type { RiskSurfaceParams } from '@/hooks/use-risk-surfaces-rest';
import { marketData } from '@/lib/market-data/client';

/**
 * Shared adapter between /home and /health so both pages derive
 * the health score from the same inputs and end up with the same
 * number. Previously /home was computing a proxy score
 * (100 × (1 − marginUsed/totalBalance)) while /health ran the
 * canonical `healthScore()` - two different formulas displayed on
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
  const positions = snapshot.positions.map((p) =>
    toHealthPositionInput(p, equityUsd, livePrices, mmSurfaces),
  );
  if (positions.some((p) => p === null)) return null;

  const readyPositions = positions as readonly ReadyHealthPositionInput[];
  const correlations = buildPortfolioCorrelations(
    readyPositions.map((position) => position.symbol),
  );
  const bulkMargin = calculateBulkPortfolioMaintenanceMargin({
    positions: readyPositions.map((p) => ({
      symbol: p.symbol,
      size: p.size,
      markPrice: p.markPrice,
      lambda: p.lambda,
    })) satisfies readonly BulkMarginPositionInput[],
    ...(correlations ? { correlations } : {}),
  });

  return {
    equityUsd,
    collateralUsd: equityUsd,
    positions: readyPositions.map((position, index) => ({
      symbol: position.symbol,
      size: position.size,
      entryPrice: position.entryPrice,
      markPrice: position.markPrice,
      liqPrice: position.liqPrice,
      maintenanceMarginUsd:
        bulkMargin.positions[index]?.marginComponentUsd ?? position.notionalUsd * position.lambda,
      funding8hRate: position.funding8hRate,
    })),
  };
}

interface ReadyHealthPositionInput {
  readonly symbol: string;
  readonly size: number;
  readonly entryPrice: number;
  readonly markPrice: number;
  readonly liqPrice: number;
  readonly notionalUsd: number;
  readonly lambda: number;
  readonly funding8hRate: number;
}

function toHealthPositionInput(
  p: BulkPosition,
  equityUsd: number,
  livePrices: LivePriceMap,
  mmSurfaces: RiskSurfaceMap | undefined,
): ReadyHealthPositionInput | null {
  const live = livePrices[p.symbol];
  const markPrice = live?.mark ?? p.fairPrice;
  const fundingRate = live?.fundingRate ?? PLACEHOLDER_FUNDING_8H;
  const notional = Math.abs(p.sizeBase) * markPrice;

  const LIQ_KEYS = ['liqPrice', 'liquidationPrice', 'liqPx'] as const;
  const liqFromTop = pickNumber(p, LIQ_KEYS);
  const liqFromRaw = Number.isFinite(liqFromTop) ? liqFromTop : pickNumber(p.raw, LIQ_KEYS);

  // Implicit leverage approximation: notional / equity. Treats each
  // position as if it used the full account equity, which is
  // conservative - it biases the grid lookup toward higher leverage
  // knots, which return higher mmFractions, which gives a safer
  // (lower) health reading. Bulk's actual portfolio-margin math is
  // more nuanced but Bulk doesn't surface per-position margin
  // allocation in the account snapshot today.
  const effectiveLeverage = equityUsd > 0 ? Math.max(1, notional / equityUsd) : 1;

  const side: 'long' | 'short' = p.sizeBase > 0 ? 'long' : 'short';
  const params = preferredRiskSurfaceParams(p.symbol, mmSurfaces);
  if (!params) return null;
  const lambda = lookupPositionMm(params, side, notional, effectiveLeverage);

  return {
    symbol: p.symbol,
    size: p.sizeBase,
    entryPrice: p.entryPrice,
    markPrice,
    notionalUsd: notional,
    lambda,
    liqPrice: Number.isFinite(liqFromRaw)
      ? liqFromRaw
      : estimateLiqPrice(p.sizeBase, markPrice, lambda),
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
 * TODO(week-2): once the `risk:{symbol}` websocket cache is hydrated
 * early enough on first paint, remove the REST fallback entirely and
 * source /health + /home from live risk only.
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

function preferredRiskSurfaceParams(
  symbol: string,
  mmSurfaces: RiskSurfaceMap | undefined,
): RiskSurfaceParams | undefined {
  const live = marketData.getLiveRiskSurface(symbol);
  if (live) {
    const params = riskParamsFromLiveSurface(live);
    if (params) return params;
  }
  return mmSurfaces?.[symbol];
}

function riskParamsFromLiveSurface(surface: RiskStream): RiskSurfaceParams | null {
  const mmFraction = surface.buy[0]?.[0]?.mmrO;
  if (typeof mmFraction !== 'number' || !Number.isFinite(mmFraction)) {
    return null;
  }
  return {
    mmFraction,
    imFraction: mmFraction,
    adlRank: 0,
    leverageKnots: surface.leverage,
    notionalKnots: surface.notionals,
    buy: flattenLiveRiskGrid(surface.buy),
    sell: flattenLiveRiskGrid(surface.sell),
  };
}

function flattenLiveRiskGrid(
  grid: readonly (readonly { readonly mmrO: number }[])[],
): readonly (readonly number[])[] {
  return grid.map((row) => row.map((point) => point.mmrO));
}

function buildPortfolioCorrelations(
  symbols: readonly string[],
): BulkCorrelationMatrix | undefined {
  const symbolByAsset = new Map<string, string>();
  const symbolSet = new Set(symbols);
  const correlations: Record<string, Record<string, number>> = {};
  let sawLiveSurface = false;
  let sawLiveCorrs = false;

  for (const symbol of symbols) {
    const asset = assetFromSymbol(symbol);
    if (!symbolByAsset.has(asset)) {
      symbolByAsset.set(asset, symbol);
    }
  }

  for (const symbol of symbols) {
    const surface = marketData.getLiveRiskSurface(symbol);
    if (!surface) continue;
    sawLiveSurface = true;
    if (surface.corrs.length === 0) {
      // TODO(week-2): Bulk WS currently appears to omit `corrs` from
      // some live `risk:{symbol}` payloads, so /health cannot apply
      // portfolio offsets until the websocket feed includes them.
      continue;
    }
    sawLiveCorrs = true;

    for (const [pair, value] of surface.corrs) {
      if (!Number.isFinite(value)) continue;

      const [leftToken, rightToken] = pair.split(/[:/]/).map((token: string) => token.trim());
      if (!leftToken || !rightToken) continue;

      const leftSymbol = resolveCorrelationSymbol(leftToken, symbolByAsset, symbolSet);
      const rightSymbol = resolveCorrelationSymbol(rightToken, symbolByAsset, symbolSet);
      if (!leftSymbol || !rightSymbol || leftSymbol === rightSymbol) continue;

      correlations[leftSymbol] ??= {};
      correlations[rightSymbol] ??= {};
      correlations[leftSymbol]![rightSymbol] = value;
      correlations[rightSymbol]![leftSymbol] = value;
    }
  }

  if (!sawLiveSurface || !sawLiveCorrs) {
    return undefined;
  }

  return Object.keys(correlations).length > 0 ? correlations : undefined;
}

function resolveCorrelationSymbol(
  token: string,
  symbolByAsset: ReadonlyMap<string, string>,
  symbolSet: ReadonlySet<string>,
): string | null {
  if (symbolSet.has(token)) {
    return token;
  }
  return symbolByAsset.get(token) ?? null;
}

function assetFromSymbol(symbol: string): string {
  const separatorIndex = symbol.indexOf('-');
  return separatorIndex === -1 ? symbol : symbol.slice(0, separatorIndex);
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
