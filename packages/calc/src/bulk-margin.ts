/**
 * Bulk portfolio-margin helpers.
 *
 * Inputs here are intentionally small and explicit so callers can
 * provide live risk data from any source without coupling calc to a
 * specific transport or cache.
 */

export interface BulkMarginPositionInput {
  readonly symbol: string;
  /** Signed size in base units. Positive = long, negative = short. */
  readonly size: number;
  /** Current mark price in quote currency. */
  readonly markPrice: number;
  /** Per-position Bulk maintenance lambda. */
  readonly lambda: number;
}

export type BulkCorrelationMatrix = Readonly<
  Record<string, Readonly<Record<string, number>>>
>;

export interface BulkMarginPositionBreakdown extends BulkMarginPositionInput {
  readonly notionalUsd: number;
  /** Standalone maintenance-margin component M_i. */
  readonly marginComponentUsd: number;
}

export interface BulkPortfolioMaintenanceMarginInput {
  readonly positions: readonly BulkMarginPositionInput[];
  readonly correlations?: BulkCorrelationMatrix;
}

export interface BulkPortfolioMaintenanceMarginResult {
  readonly positions: readonly BulkMarginPositionBreakdown[];
  readonly maintenanceMarginUsd: number;
}

export function bulkMarginNotionalUsd(position: BulkMarginPositionInput): number {
  assertFinite(position.size, 'size');
  assertNonNegative(position.markPrice, 'markPrice');
  return Math.abs(position.size) * position.markPrice;
}

export function bulkMarginComponentUsd(position: BulkMarginPositionInput): number {
  const notionalUsd = bulkMarginNotionalUsd(position);
  assertNonNegative(position.lambda, 'lambda');
  return notionalUsd * position.lambda;
}

export function calculateBulkPortfolioMaintenanceMargin(
  input: BulkPortfolioMaintenanceMarginInput,
): BulkPortfolioMaintenanceMarginResult {
  const positions = input.positions.map((position) => {
    const notionalUsd = bulkMarginNotionalUsd(position);
    const marginComponentUsd = bulkMarginComponentUsd(position);
    return {
      ...position,
      notionalUsd,
      marginComponentUsd,
    };
  });

  if (positions.length === 0) {
    return { positions, maintenanceMarginUsd: 0 };
  }

  if (input.correlations === undefined) {
    // Conservative fallback: disable portfolio offsets until a live
    // correlation grid is available to the caller.
    return {
      positions,
      maintenanceMarginUsd: positions.reduce(
        (sum, position) => sum + position.marginComponentUsd,
        0,
      ),
    };
  }

  let sumOfSquares = 0;
  let crossTermSum = 0;

  for (let i = 0; i < positions.length; i++) {
    const left = positions[i]!;
    const leftMargin = left.marginComponentUsd;
    sumOfSquares += leftMargin * leftMargin;

    for (let j = i + 1; j < positions.length; j++) {
      const right = positions[j]!;
      crossTermSum +=
        leftMargin *
        right.marginComponentUsd *
        correlationFor(input.correlations, left.symbol, right.symbol);
    }
  }

  return {
    positions,
    maintenanceMarginUsd: Math.sqrt(Math.max(0, sumOfSquares + 2 * crossTermSum)),
  };
}

function correlationFor(
  correlations: BulkCorrelationMatrix,
  leftSymbol: string,
  rightSymbol: string,
): number {
  if (leftSymbol === rightSymbol) {
    return 1;
  }

  const direct = correlations[leftSymbol]?.[rightSymbol];
  if (direct !== undefined) {
    return clampCorrelation(direct);
  }

  const reverse = correlations[rightSymbol]?.[leftSymbol];
  if (reverse !== undefined) {
    return clampCorrelation(reverse);
  }

  return 0;
}

function clampCorrelation(value: number): number {
  assertFinite(value, 'correlation');
  return Math.max(-1, Math.min(1, value));
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
}

function assertNonNegative(value: number, label: string): void {
  assertFinite(value, label);
  if (value < 0) {
    throw new Error(`${label} must be non-negative`);
  }
}
