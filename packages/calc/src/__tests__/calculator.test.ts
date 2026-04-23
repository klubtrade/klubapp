// packages/calc/src/__tests__/calculator.test.ts
import { describe, expect, it } from 'vitest';

import {
  calculate,
  CalcError,
  liqPrice,
  sizeFromMargin,
  sizeFromNotional,
} from '../calculator.js';

describe('liqPrice', () => {
  it('long 10× with 0.5% maintenance lands ~90.45% of entry', () => {
    // Formula: entry × (1 − 1/L) / (1 − m) = 100 × 0.9 / 0.995 ≈ 90.4523
    const px = liqPrice({
      side: 'long',
      entryPrice: 100,
      leverage: 10,
      maintenanceMarginFrac: 0.005,
    });
    expect(px).toBeCloseTo(90.4523, 3);
  });

  it('short 10× with 0.5% maintenance lands ~109.45% of entry', () => {
    // Formula: entry × (1 + 1/L) / (1 + m) = 100 × 1.1 / 1.005 ≈ 109.4527
    const px = liqPrice({
      side: 'short',
      entryPrice: 100,
      leverage: 10,
      maintenanceMarginFrac: 0.005,
    });
    expect(px).toBeCloseTo(109.4527, 3);
  });

  it('no leverage (1x) gives liq far below entry for long', () => {
    // 1x long: entry × 0 / (1-m) = 0. You effectively can't be liquidated.
    const px = liqPrice({
      side: 'long',
      entryPrice: 100,
      leverage: 1,
      maintenanceMarginFrac: 0.005,
    });
    expect(px).toBe(0);
  });

  it('high maintenance squeezes buffer tighter', () => {
    const lowM = liqPrice({
      side: 'long',
      entryPrice: 100,
      leverage: 5,
      maintenanceMarginFrac: 0.005,
    });
    const highM = liqPrice({
      side: 'long',
      entryPrice: 100,
      leverage: 5,
      maintenanceMarginFrac: 0.03,
    });
    expect(highM).toBeGreaterThan(lowM);
  });
});

describe('calculate', () => {
  const BASE = {
    side: 'long' as const,
    leverage: 5,
    entryPrice: 100,
    size: 1, // 1 unit → $100 notional
    maintenanceMarginFrac: 0.005,
    takerBps: 5,
  };

  it('computes notional and required margin', () => {
    const r = calculate(BASE);
    expect(r.notional).toBe(100);
    expect(r.requiredMargin).toBe(20); // notional / leverage
  });

  it('computes long liq and buffer', () => {
    const r = calculate(BASE);
    // 100 × 0.8 / 0.995 ≈ 80.402
    expect(r.liquidationPrice).toBeCloseTo(80.402, 2);
    // Buffer: (100 - 80.402)/100 ≈ 0.196
    expect(r.liqBufferFrac).toBeCloseTo(0.196, 2);
  });

  it('PnL at target = size × move − fees', () => {
    const r = calculate({ ...BASE, targetPrice: 110 });
    // Gross = 1 × 10 = 10
    // Fees round-trip = 100 × 0.0005 × 2 = 0.1
    expect(r.pnlAtTarget).toBeCloseTo(9.9, 6);
    // ROI on margin = 9.9 / 20 = 0.495
    expect(r.pnlAtTargetRoiFrac).toBeCloseTo(0.495, 4);
  });

  it('loss at stop below entry for long is negative', () => {
    const r = calculate({ ...BASE, stopPrice: 95 });
    // Gross = 1 × (-5) = -5
    // Fees = 0.1
    // Net loss = -5.1
    expect(r.lossAtStop).toBeCloseTo(-5.1, 6);
    expect(r.stopIsSafe).toBe(true); // 95 > 80.4 (liq)
  });

  it('flags unsafe stop (stop below liq for long)', () => {
    const r = calculate({ ...BASE, stopPrice: 70 });
    expect(r.stopIsSafe).toBe(false);
  });

  it('reward/risk ratio when both target and stop set', () => {
    const r = calculate({ ...BASE, targetPrice: 110, stopPrice: 95 });
    // pnlAtTarget ≈ 9.9, |loss| ≈ 5.1 → R:R ≈ 1.94
    expect(r.rewardToRisk).toBeCloseTo(1.94, 1);
  });

  it('funding cost respects side', () => {
    const longR = calculate({ ...BASE, funding8hRate: 0.0001 });
    // Long pays positive funding: +$100 × 0.0001 = $0.01
    expect(longR.fundingCostPer8h).toBeCloseTo(0.01, 6);

    const shortR = calculate({ ...BASE, side: 'short', funding8hRate: 0.0001 });
    // Short receives: -$0.01
    expect(shortR.fundingCostPer8h).toBeCloseTo(-0.01, 6);
  });

  it('breakeven covers fees + one funding period', () => {
    const r = calculate({ ...BASE, funding8hRate: 0.0001 });
    // Fees round-trip = 0.1, funding = 0.01 → total = 0.11
    // breakevenFrac = 0.11 / 100 = 0.0011
    expect(r.breakevenFrac).toBeCloseTo(0.0011, 6);
    // Long breakeven = 100 × 1.0011 = 100.11
    expect(r.breakevenPrice).toBeCloseTo(100.11, 4);
  });

  it('breakeven for short subtracts from entry', () => {
    const r = calculate({ ...BASE, side: 'short' });
    // No funding → breakevenFrac = 0.1/100 = 0.001
    // Short breakeven = 100 × 0.999 = 99.9
    expect(r.breakevenPrice).toBeCloseTo(99.9, 6);
  });

  it('rejects non-positive inputs', () => {
    expect(() => calculate({ ...BASE, leverage: 0 })).toThrow(CalcError);
    expect(() => calculate({ ...BASE, entryPrice: -1 })).toThrow(CalcError);
    expect(() => calculate({ ...BASE, size: 0 })).toThrow(CalcError);
  });

  it('rejects out-of-range maintenance fraction', () => {
    expect(() => calculate({ ...BASE, maintenanceMarginFrac: 1.1 })).toThrow(CalcError);
    expect(() => calculate({ ...BASE, maintenanceMarginFrac: -0.01 })).toThrow(CalcError);
  });
});

describe('sizing helpers', () => {
  it('sizeFromNotional divides notional by price', () => {
    expect(sizeFromNotional(1000, 50000)).toBeCloseTo(0.02, 6);
  });
  it('sizeFromMargin: $100 margin × 5x / $50k = 0.01', () => {
    expect(sizeFromMargin(100, 5, 50000)).toBeCloseTo(0.01, 6);
  });
});
