import { describe, expect, it } from "vitest";

import { prepareChartCandles } from "../market-data/candles";

describe("prepareChartCandles", () => {
  it("clips an isolated corrupt wick without changing its body", () => {
    const result = prepareChartCandles([
      {
        t: 1_000,
        o: "64000",
        h: "77154",
        l: "63966",
        c: "64034",
        v: "1",
        n: 1,
      },
      {
        t: 2_000,
        o: "64034",
        h: "64066",
        l: "63928",
        c: "64060",
        v: "1",
        n: 1,
      },
      {
        t: 3_000,
        o: "64060",
        h: "64120",
        l: "64000",
        c: "64100",
        v: "1",
        n: 1,
      },
    ]);

    expect(result[0]).toMatchObject({
      open: 64_000,
      close: 64_034,
      low: 63_966,
    });
    expect(result[0]?.high).toBeLessThan(66_000);
  });

  it("keeps normal candles unchanged and sorts them", () => {
    const result = prepareChartCandles([
      { t: 2_000, o: "101", h: "103", l: "100", c: "102", v: "1", n: 1 },
      { t: 1_000, o: "100", h: "102", l: "99", c: "101", v: "1", n: 1 },
      { t: 3_000, o: "102", h: "104", l: "101", c: "103", v: "1", n: 1 },
    ]);

    expect(result.map((candle) => candle.time)).toEqual([1, 2, 3]);
    expect(result[1]).toMatchObject({
      open: 101,
      high: 103,
      low: 100,
      close: 102,
    });
  });
});
