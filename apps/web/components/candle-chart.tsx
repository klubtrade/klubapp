"use client";

import type { Candle } from "@klub/api-client";
import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

import { prepareChartCandles } from "@/lib/market-data/candles";

/**
 * <CandleChart /> — TradingView Lightweight Charts wrapper.
 *
 * Design decisions:
 *   - **Canvas-only.** lightweight-charts is HTML5 canvas under the
 *     hood. It uses globals like ResizeObserver and won't run on the
 *     server. This component is dynamically imported with `ssr: false`
 *     by callers (see /trade) so it never tries to render at build
 *     time.
 *   - **No React state.** The chart instance lives in refs; we never
 *     unmount and recreate on data changes — instead we call
 *     `setData()` on the existing series. This gives us 60fps updates
 *     even for symbols with hundreds of candles.
 *   - **Colors from KLUB tokens.** Up/down body colors track our
 *     `--pnl-long` / `--pnl-short`. Grid + text use `--border-subtle`
 *     and `--fg-muted`. If the brand palette changes, the chart
 *     follows automatically.
 *   - **Time as UNIX seconds.** lightweight-charts wants seconds, not
 *     ms — Bulk gives us ms (`Candle.t`), so we divide by 1000 once
 *     at the conversion boundary.
 *   - **Auto-fit on first data load.** Subsequent updates preserve
 *     the user's zoom/pan — we only fit on initial load (and on
 *     symbol change, which mounts a fresh chart anyway because the
 *     `key` prop changes upstream).
 *
 * The component takes `candles: readonly Candle[]` and renders. Empty
 * arrays render an empty chart frame (no skeleton noise — the parent
 * shows a spinner while loading). Resize handling is via
 * ResizeObserver on the container.
 */

interface Props {
  readonly candles: readonly Candle[];
  /** Pixel height for the chart canvas. Width is always 100% of the
   *  container. Defaults to 320 (good for /trade column). */
  readonly height?: number;
  /** Fill the parent's available height and resize the canvas with it. */
  readonly fill?: boolean;
}

export default function CandleChart({
  candles,
  height = 320,
  fill = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fittedRef = useRef(false);

  // Chart creation — runs once on mount, tears down on unmount.
  useEffect(() => {
    if (!containerRef.current) return;

    // Read CSS vars at runtime so the chart matches the live theme.
    // getPropertyValue returns strings; trim() because CSS vars often
    // have leading whitespace.
    const css = getComputedStyle(document.documentElement);
    const fg = css.getPropertyValue("--fg-muted").trim() || "#6A7185";
    const grid = css.getPropertyValue("--border-subtle").trim() || "#1A1F2E";
    const bg = css.getPropertyValue("--bg-surface").trim() || "#0F1320";
    const long = css.getPropertyValue("--pnl-long").trim() || "#10b981";
    const short = css.getPropertyValue("--pnl-short").trim() || "#ef4444";

    const initialHeight = fill
      ? Math.max(containerRef.current.clientHeight, 180)
      : height;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: initialHeight,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: fg,
        fontSize: 11,
        fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: grid, style: 1 },
        horzLines: { color: grid, style: 1 },
      },
      rightPriceScale: {
        borderColor: grid,
      },
      timeScale: {
        borderColor: grid,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        // Mode 0 = magnet snaps to candles, 1 = free crosshair.
        // Free is more responsive for hover-to-read price.
        mode: 1,
      },
      // Note: TradingView's attribution logo renders in the bottom-
      // right corner of the chart by default. Per the lightweight-
      // charts license that satisfies the attribution requirement,
      // so we leave it on and don't try to suppress it. (An earlier
      // pass tried `attributionLogo: false` but the v5 typedefs don't
      // expose that option.)
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      upColor: long,
      downColor: short,
      borderUpColor: long,
      borderDownColor: short,
      wickUpColor: long,
      wickDownColor: short,
    });
    seriesRef.current = series;

    // Resize observer — keep canvas width in sync with the parent.
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      chart.applyOptions({
        width: entry.contentRect.width,
        height: fill ? Math.max(entry.contentRect.height, 180) : height,
      });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [fill, height]);

  // Data updates — runs whenever candles change. Calls `setData()` on
  // the existing series rather than recreating the chart.
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    const data = prepareChartCandles(candles).map((candle) => ({
      ...candle,
      time: candle.time as Time,
    }));

    series.setData(data);

    // Auto-fit on first non-empty data load. Subsequent updates
    // preserve the user's zoom — that's what they expect once
    // they've panned/zoomed somewhere.
    if (!fittedRef.current && data.length > 0) {
      chart.timeScale().fitContent();
      fittedRef.current = true;
    }
  }, [candles]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: fill ? "100%" : height }}
    />
  );
}
