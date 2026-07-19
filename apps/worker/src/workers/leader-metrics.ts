import type { FundingPayment, UserFill } from "@klub/api-client";

export interface LeaderMetrics {
  readonly fundingPnlUsd: number;
  readonly netPnlUsd: number;
  readonly unrealizedPnlUsd: number;
  readonly winRate: number;
  readonly closedTradesCount: number;
  readonly maxDrawdownUsd: number;
  readonly maxDrawdownPct: number;
  readonly sharpeRatio: number;
}

interface SymbolPosition {
  positionSize: number;
  avgEntryPrice: number;
  lastPrice: number;
}

export function computeLeaderMetrics(
  fills: readonly UserFill[],
  fundingPayments: readonly FundingPayment[] = [],
  options: { readonly nowMs?: number; readonly pnlStartMs?: number } = {},
): LeaderMetrics {
  let netPnlUsd = 0;
  let fundingPnlUsd = 0;
  let closedTradesCount = 0;
  let winningTradesCount = 0;
  const positions = new Map<string, SymbolPosition>();
  const dailyRealizedPnl = new Map<string, number>();
  const sortedFills = [...fills].sort(
    (a, b) => toTimestampMs(a.timestamp) - toTimestampMs(b.timestamp),
  );

  for (const fill of sortedFills) {
    const countsTowardPnl =
      options.pnlStartMs === undefined ||
      toTimestampMs(fill.timestamp) >= options.pnlStartMs;
    const position = positions.get(fill.symbol) ?? createSymbolPosition();
    const fillDirection = fill.isBuy ? 1 : -1;
    let remainingSize = fill.amount;
    const feeUsd = getFillFeeUsd(fill);
    const feeCostUsd = Math.abs(feeUsd);
    const dayKey = dayKeyFromTimestamp(fill.timestamp);
    position.lastPrice = fill.price;

    if (
      Math.abs(position.positionSize) > 0 &&
      Math.sign(position.positionSize) !== fillDirection
    ) {
      const closedSize = Math.min(
        Math.abs(position.positionSize),
        remainingSize,
      );
      const grossPnl =
        position.positionSize > 0
          ? (fill.price - position.avgEntryPrice) * closedSize
          : (position.avgEntryPrice - fill.price) * closedSize;
      const closedFeeCostUsd = feeCostUsd * (closedSize / fill.amount);
      const closedPnl = grossPnl - closedFeeCostUsd;

      if (countsTowardPnl) {
        netPnlUsd += grossPnl;
        addDailyPnl(dailyRealizedPnl, dayKey, grossPnl);
        closedTradesCount += 1;
        if (closedPnl > 0) winningTradesCount += 1;
      }

      remainingSize -= closedSize;
      position.positionSize += fillDirection * closedSize;

      if (Math.abs(position.positionSize) < 1e-12) {
        position.positionSize = 0;
        position.avgEntryPrice = 0;
      }
    }

    if (remainingSize > 0) {
      const currentAbsSize = Math.abs(position.positionSize);
      if (currentAbsSize === 0) {
        position.positionSize = fillDirection * remainingSize;
        position.avgEntryPrice = fill.price;
      } else {
        const nextAbsSize = currentAbsSize + remainingSize;
        position.avgEntryPrice =
          (position.avgEntryPrice * currentAbsSize +
            fill.price * remainingSize) /
          nextAbsSize;
        position.positionSize += fillDirection * remainingSize;
      }
    }

    if (countsTowardPnl) {
      netPnlUsd -= feeCostUsd;
      addDailyPnl(dailyRealizedPnl, dayKey, -feeCostUsd);
    }
    positions.set(fill.symbol, position);
  }

  for (const payment of fundingPayments) {
    if (
      options.pnlStartMs !== undefined &&
      toTimestampMs(payment.timestamp) < options.pnlStartMs
    ) {
      continue;
    }
    fundingPnlUsd += payment.payment;
    netPnlUsd += payment.payment;
    addDailyPnl(
      dailyRealizedPnl,
      dayKeyFromTimestamp(payment.timestamp),
      payment.payment,
    );
  }

  let unrealizedPnlUsd = 0;
  for (const position of positions.values()) {
    if (position.positionSize > 0) {
      unrealizedPnlUsd +=
        (position.lastPrice - position.avgEntryPrice) * position.positionSize;
    } else if (position.positionSize < 0) {
      unrealizedPnlUsd +=
        (position.avgEntryPrice - position.lastPrice) *
        Math.abs(position.positionSize);
    }
  }

  return {
    fundingPnlUsd: roundTo(fundingPnlUsd, 2),
    netPnlUsd: roundTo(netPnlUsd, 2),
    unrealizedPnlUsd: roundTo(unrealizedPnlUsd, 2),
    winRate:
      closedTradesCount > 0
        ? roundTo((winningTradesCount / closedTradesCount) * 100, 2)
        : 0,
    closedTradesCount,
    ...computeRiskMetrics(dailyRealizedPnl, options.nowMs ?? Date.now()),
  };
}

function createSymbolPosition(): SymbolPosition {
  return { positionSize: 0, avgEntryPrice: 0, lastPrice: 0 };
}

function getFillFeeUsd(fill: UserFill): number {
  if (fill.fee !== undefined) return fill.fee;
  return (fill.makerFee ?? 0) + (fill.takerFee ?? 0);
}

function addDailyPnl(
  dailyPnl: Map<string, number>,
  dayKey: string,
  pnlUsd: number,
): void {
  dailyPnl.set(dayKey, (dailyPnl.get(dayKey) ?? 0) + pnlUsd);
}

function computeRiskMetrics(dailyPnl: Map<string, number>, nowMs: number) {
  const dailyValues = buildThirtyDayDailyPnlSeries(dailyPnl, nowMs);
  let equity = 0;
  let peak = 0;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;

  for (const pnl of dailyValues) {
    equity += pnl;
    if (equity > peak) peak = equity;
    const drawdownUsd = peak - equity;
    if (drawdownUsd > maxDrawdownUsd) {
      maxDrawdownUsd = drawdownUsd;
      maxDrawdownPct = peak > 0 ? drawdownUsd / peak : 0;
    }
  }

  return {
    maxDrawdownUsd: roundTo(maxDrawdownUsd, 2),
    maxDrawdownPct: roundTo(maxDrawdownPct * 100, 2),
    sharpeRatio: roundTo(computeSharpeRatio(dailyValues), 2),
  };
}

function buildThirtyDayDailyPnlSeries(
  dailyPnl: Map<string, number>,
  nowMs: number,
): readonly number[] {
  const end = new Date(nowMs);
  const endDayMs = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  const startDayMs = endDayMs - 29 * 24 * 60 * 60 * 1000;

  return Array.from({ length: 30 }, (_, index) => {
    const dayMs = startDayMs + index * 24 * 60 * 60 * 1000;
    return dailyPnl.get(new Date(dayMs).toISOString().slice(0, 10)) ?? 0;
  });
}

function computeSharpeRatio(dailyValues: readonly number[]): number {
  if (dailyValues.length === 0) return 0;
  const mean =
    dailyValues.reduce((sum, value) => sum + value, 0) / dailyValues.length;
  const variance =
    dailyValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    dailyValues.length;
  const stddev = Math.sqrt(variance);
  return stddev > 0 ? (mean / stddev) * Math.sqrt(365) : 0;
}

function dayKeyFromTimestamp(timestamp: number): string {
  return new Date(toTimestampMs(timestamp)).toISOString().slice(0, 10);
}

export function toTimestampMs(timestamp: number): number {
  return timestamp > 1_000_000_000_000_000
    ? Math.floor(timestamp / 1_000_000)
    : timestamp;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
