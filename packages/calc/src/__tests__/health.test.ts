// packages/calc/src/__tests__/health.test.ts
import { describe, expect, it } from 'vitest';

import {
  bandFor,
  healthScore,
  stressTest,
  type HealthInput,
  type HealthPosition,
} from '../health.js';

const btc: HealthPosition = {
  symbol: 'BTC-USD',
  size: 0.1,
  entryPrice: 60_000,
  markPrice: 60_000,
  liqPrice: 50_000,
  maintenanceMarginUsd: 30,
  funding8hRate: 0,
};

describe('healthScore', () => {
  it('flat book scores 100', () => {
    const out = healthScore({
      equityUsd: 1000,
      collateralUsd: 1000,
      positions: [],
    });
    expect(out.score).toBe(100);
    expect(out.band).toBe('healthy');
    expect(out.recommendations).toEqual([]);
  });

  it('zero equity → critical', () => {
    const out = healthScore({
      equityUsd: 0,
      collateralUsd: 0,
      positions: [btc],
    });
    expect(out.score).toBe(0);
    expect(out.band).toBe('critical');
  });

  it('comfortable single position scores high', () => {
    // Buffer on BTC: (60000-50000)/60000 ≈ 16.7% — between orange and yellow
    // but with low leverage, single symbol, no funding → should score OK
    const out = healthScore({
      equityUsd: 6_000,
      collateralUsd: 6_000,
      positions: [btc],
    });
    expect(out.score).toBeGreaterThanOrEqual(50);
    expect(out.score).toBeLessThanOrEqual(85);
  });

  it('position near liq hurts proximity subscore', () => {
    const tight: HealthPosition = {
      ...btc,
      markPrice: 51_000, // only 2% buffer — below red tier
      liqPrice: 50_000,
    };
    const out = healthScore({
      equityUsd: 5_000,
      collateralUsd: 5_000,
      positions: [tight],
    });
    expect(out.subscores.liquidationProximity.score).toBeLessThan(20);
    expect(out.band === 'risky' || out.band === 'critical').toBe(true);
    expect(out.recommendations.some((r) => r.includes('BTC-USD'))).toBe(true);
  });

  it('high leverage drags the lev subscore', () => {
    // 10x effective lev → $60k notional on $6k equity
    const out = healthScore({
      equityUsd: 600,
      collateralUsd: 600,
      positions: [btc],
    });
    expect(out.subscores.leverageExposure.score).toBeLessThan(50);
    expect(out.subscores.leverageExposure.rawValue).toBeCloseTo(10, 0);
  });

  it('concentrated book scores worse on concentration subscore than diversified', () => {
    const btc2: HealthPosition = { ...btc, symbol: 'BTC-USD' };
    const eth: HealthPosition = {
      symbol: 'ETH-USD',
      size: 1,
      entryPrice: 3000,
      markPrice: 3000,
      liqPrice: 2500,
      maintenanceMarginUsd: 15,
      funding8hRate: 0,
    };

    const concentrated = healthScore({
      equityUsd: 5000,
      collateralUsd: 5000,
      positions: [btc2],
    });
    const diversified = healthScore({
      equityUsd: 5000,
      collateralUsd: 5000,
      positions: [btc2, eth],
    });
    expect(concentrated.subscores.concentrationRisk.score).toBeLessThan(
      diversified.subscores.concentrationRisk.score,
    );
  });

  it('funding burn subscore penalises high rates', () => {
    const expensive: HealthPosition = {
      ...btc,
      funding8hRate: 0.005, // 0.5% per 8h → 1.5%/day
    };
    // notional = 6000, equity = 6000 → funding/day = 90 → 1.5% of equity
    const out = healthScore({
      equityUsd: 6000,
      collateralUsd: 6000,
      positions: [expensive],
    });
    expect(out.subscores.fundingBurn.score).toBeLessThan(30);
    expect(out.subscores.fundingBurn.rawValue).toBeCloseTo(0.015, 3);
  });
});

describe('bandFor', () => {
  it('maps scores to bands', () => {
    expect(bandFor(95)).toBe('healthy');
    expect(bandFor(80)).toBe('healthy');
    expect(bandFor(79)).toBe('fine');
    expect(bandFor(60)).toBe('fine');
    expect(bandFor(55)).toBe('caution');
    expect(bandFor(30)).toBe('risky');
    expect(bandFor(10)).toBe('critical');
    expect(bandFor(0)).toBe('critical');
  });
});

describe('stressTest', () => {
  const portfolio: HealthInput = {
    equityUsd: 6000,
    collateralUsd: 6000,
    positions: [btc],
  };

  it('-10% shock on long BTC is a $600 loss, portfolio survives', () => {
    const out = stressTest(portfolio, { shockFrac: -0.1 });
    // 0.1 BTC × (-6000) = -600
    expect(out.shockPnl).toBeCloseTo(-600, 0);
    expect(out.liquidatedPositions).toEqual([]);
    expect(out.survivingPositions).toEqual(['BTC-USD']);
    expect(out.shockedEquityUsd).toBeCloseTo(5400, 0);
  });

  it('severe shock liquidates the position', () => {
    const out = stressTest(portfolio, { shockFrac: -0.2 });
    // New mark: 60000 × 0.8 = 48000, below liq 50000 → liquidated
    expect(out.liquidatedPositions).toContain('BTC-USD');
  });

  it('positive shock on long is a gain', () => {
    const out = stressTest(portfolio, { shockFrac: 0.05 });
    // 0.1 × 3000 = 300
    expect(out.shockPnl).toBeCloseTo(300, 0);
  });

  it('uncorrelated shock applies only to filtered positions', () => {
    const eth: HealthPosition = {
      symbol: 'ETH-USD',
      size: 1,
      entryPrice: 3000,
      markPrice: 3000,
      liqPrice: 2500,
      maintenanceMarginUsd: 15,
      funding8hRate: 0,
    };
    const both: HealthInput = {
      equityUsd: 9000,
      collateralUsd: 9000,
      positions: [btc, eth],
    };
    const out = stressTest(both, {
      shockFrac: -0.1,
      correlated: false,
      shouldApply: (p) => p.symbol === 'BTC-USD',
    });
    // Only BTC took the hit: -600, ETH unchanged
    expect(out.shockPnl).toBeCloseTo(-600, 0);
  });

  it('short positions profit from negative shocks', () => {
    const shortPos: HealthPosition = {
      symbol: 'BTC-USD',
      size: -0.1, // short
      entryPrice: 60_000,
      markPrice: 60_000,
      liqPrice: 70_000,
      maintenanceMarginUsd: 30,
      funding8hRate: 0,
    };
    const out = stressTest(
      { equityUsd: 6000, collateralUsd: 6000, positions: [shortPos] },
      { shockFrac: -0.1 },
    );
    // Short profits on drop: -0.1 × (-6000) = 600
    expect(out.shockPnl).toBeCloseTo(600, 0);
  });
});
