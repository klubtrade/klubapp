import type { Candle } from "@klub/api-client";

export interface ChartCandle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

/** Display-only guard for isolated corrupt Bulk wicks that break autoscale. */
export function prepareChartCandles(
  candles: readonly Candle[],
): readonly ChartCandle[] {
  const normalized = candles
    .map((candle) => ({
      time: candle.t / 1000,
      open: Number(candle.o),
      high: Number(candle.h),
      low: Number(candle.l),
      close: Number(candle.c),
    }))
    .filter((candle) => {
      return (
        Object.values(candle).every(Number.isFinite) &&
        candle.open > 0 &&
        candle.close > 0
      );
    })
    .sort((a, b) => a.time - b.time);

  if (normalized.length < 3) return normalized;

  const typicalClose = median(normalized.map((candle) => candle.close));
  const typicalBody = median(
    normalized.map((candle) =>
      Math.max(Math.abs(candle.open - candle.close), typicalClose * 0.0001),
    ),
  );
  const maxWick = Math.max(typicalClose * 0.02, typicalBody * 12);

  return normalized.map((candle) => {
    const bodyHigh = Math.max(candle.open, candle.close);
    const bodyLow = Math.min(candle.open, candle.close);
    return {
      ...candle,
      high: Math.max(bodyHigh, Math.min(candle.high, bodyHigh + maxWick)),
      low: Math.min(
        bodyLow,
        Math.max(candle.low, Math.max(0, bodyLow - maxWick)),
      ),
    };
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
