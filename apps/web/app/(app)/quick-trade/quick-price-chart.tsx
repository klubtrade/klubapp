"use client";

import type { Candle } from "@klub/api-client";
import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

import {
  prepareChartCandles,
  toChartUnixSeconds,
} from "@/lib/market-data/candles";

export default function QuickPriceChart({
  candles,
}: {
  readonly candles: readonly Candle[];
}) {
  const priceRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<ISeriesApi<"Area"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceChartApiRef = useRef<IChartApi | null>(null);
  const volumeChartApiRef = useRef<IChartApi | null>(null);
  const fittedRef = useRef(false);
  const tonesRef = useRef({ long: "#10b981", short: "#ef4444" });

  useEffect(() => {
    if (!priceRef.current || !volumeRef.current) return;
    const css = getComputedStyle(document.documentElement);
    const bg = css.getPropertyValue("--bg-surface").trim() || "#0F1320";
    const fg = css.getPropertyValue("--fg-muted").trim() || "#6A7185";
    const grid = css.getPropertyValue("--border-subtle").trim() || "#1A1F2E";
    const long = css.getPropertyValue("--pnl-long").trim() || "#10b981";
    const short = css.getPropertyValue("--pnl-short").trim() || "#ef4444";
    tonesRef.current = { long, short };

    const shared = {
      layout: {
        background: { type: ColorType.Solid as const, color: bg },
        textColor: fg,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: grid },
        horzLines: { color: grid },
      },
      rightPriceScale: { borderColor: grid },
    };
    const priceChart = createChart(priceRef.current, {
      ...shared,
      height: 220,
      width: priceRef.current.clientWidth,
      timeScale: { visible: false, barSpacing: 7, rightOffset: 3 },
      rightPriceScale: {
        ...shared.rightPriceScale,
        scaleMargins: { top: 0.1, bottom: 0.08 },
      },
    });
    const volumeChart = createChart(volumeRef.current, {
      ...shared,
      height: 88,
      width: volumeRef.current.clientWidth,
      timeScale: {
        borderColor: grid,
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 7,
        rightOffset: 3,
      },
      rightPriceScale: {
        ...shared.rightPriceScale,
        scaleMargins: { top: 0.15, bottom: 0 },
      },
    });
    priceChartApiRef.current = priceChart;
    volumeChartApiRef.current = volumeChart;
    const area = priceChart.addSeries(AreaSeries, {
      lineColor: long,
      topColor: `${long}45`,
      bottomColor: `${long}00`,
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    const volume = volumeChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "right",
    });
    areaRef.current = area;
    volumeSeriesRef.current = volume;

    const resize = new ResizeObserver(() => {
      if (!priceRef.current || !volumeRef.current) return;
      priceChart.applyOptions({ width: priceRef.current.clientWidth });
      volumeChart.applyOptions({ width: volumeRef.current.clientWidth });
    });
    resize.observe(priceRef.current);

    return () => {
      resize.disconnect();
      priceChart.remove();
      volumeChart.remove();
      areaRef.current = null;
      volumeSeriesRef.current = null;
      priceChartApiRef.current = null;
      volumeChartApiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const area = areaRef.current;
    const volume = volumeSeriesRef.current;
    if (!area || !volume) return;
    const { long, short } = tonesRef.current;
    const prices = prepareChartCandles(candles);
    area.setData(
      prices.map((row) => ({ time: row.time as Time, value: row.close })),
    );
    const bodies = new Map(prices.map((row) => [row.time, row]));
    volume.setData(
      candles
        .map((row) => {
          const time = toChartUnixSeconds(Number(row.t));
          const candle = bodies.get(time);
          return {
            time: time as Time,
            value: Number(row.v),
            color:
              candle && candle.close >= candle.open
                ? `${long}99`
                : `${short}99`,
          };
        })
        .filter((row) => Number.isFinite(row.value))
        .sort((a, b) => Number(a.time) - Number(b.time)),
    );
    if (!fittedRef.current && prices.length > 0) {
      priceChartApiRef.current?.timeScale().fitContent();
      volumeChartApiRef.current?.timeScale().fitContent();
      fittedRef.current = true;
    }
  }, [candles]);

  return (
    <div className="overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface">
      <div ref={priceRef} className="h-[220px] w-full" />
      <div className="border-t border-border-subtle px-3 pt-2 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
        Volume
      </div>
      <div ref={volumeRef} className="h-[88px] w-full" />
    </div>
  );
}
