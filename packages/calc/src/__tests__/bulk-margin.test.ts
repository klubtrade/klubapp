import { describe, expect, it } from 'vitest';

import { calculateBulkPortfolioMaintenanceMargin } from '../bulk-margin.js';

describe('calculateBulkPortfolioMaintenanceMargin', () => {
  it('uses correlation offsets when a BTC/ETH matrix is provided', () => {
    const positions = [
      {
        symbol: 'BTC-USD',
        size: 1,
        markPrice: 100,
        lambda: 0.1,
      },
      {
        symbol: 'ETH-USD',
        size: 1,
        markPrice: 100,
        lambda: 0.1,
      },
    ] as const;

    const withoutCorrelations = calculateBulkPortfolioMaintenanceMargin({
      positions,
    });
    const withCorrelations = calculateBulkPortfolioMaintenanceMargin({
      positions,
      correlations: {
        'BTC-USD': {
          'ETH-USD': 0.81,
        },
        'ETH-USD': {
          'BTC-USD': 0.81,
        },
      },
    });

    expect(withoutCorrelations.maintenanceMarginUsd).toBeCloseTo(20, 6);
    expect(withCorrelations.maintenanceMarginUsd).toBeCloseTo(19.0262975904, 6);
    expect(withCorrelations.maintenanceMarginUsd).not.toBeCloseTo(
      withoutCorrelations.maintenanceMarginUsd,
      6,
    );
  });
});
