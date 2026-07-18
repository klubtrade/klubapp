import type { Candle } from "@klub/api-client";

export interface ChartCandle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

/**
 * Normalize venue candles for the chart and contain isolated testnet wick
 * corruption. Bodies are never altered; only a wick that is many normal
 * ranges away from its body is clipped for display.
 */
export function prepareChartCandles(
  candles: readonly Candle[],
): readonly ChartCandle[] {
  const normalized = candles
    .map((candle) => ({
      time: toChartUnixSeconds(Number(candle.t)),
      open: Number(candle.o),
      high: Number(candle.h),
      low: Number(candle.l),
      close: Number(candle.c),
    }))
    .filter((candle) => {
      return (
        Object.values(candle).every(Number.isFinite) &&
        candle.open > 0 &&
        candle.close > 0 &&
        candle.high > 0 &&
        candle.low > 0
      );
    })
    .sort((a, b) => a.time - b.time);

  const deduplicated = [
    ...new Map(normalized.map((row) => [row.time, row])).values(),
  ];
  if (deduplicated.length < 3) return deduplicated.map(enforceOhlcBounds);

  const bounded = deduplicated.map(enforceOhlcBounds);
  const typicalClose = median(bounded.map((candle) => candle.close));
  const typicalRange = median(
    bounded.map((candle) =>
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.open - candle.close),
        typicalClose * 0.0001,
      ),
    ),
  );
  const maxWick = Math.max(typicalClose * 0.001, typicalRange * 3);

  return bounded.map((candle) => {
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

function enforceOhlcBounds(candle: ChartCandle): ChartCandle {
  return {
    ...candle,
    high: Math.max(candle.high, candle.open, candle.close),
    low: Math.min(candle.low, candle.open, candle.close),
  };
}

export function toChartUnixSeconds(timestamp: number): number {
  if (timestamp >= 1_000_000_000_000) return Math.floor(timestamp / 1000);
  if (timestamp >= 1_000_000_000) return Math.floor(timestamp);
  return Math.floor(timestamp / 1000);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
