// apps/web/lib/ramp/coinbase.ts
/**
 * Coinbase Onramp driver.
 *
 * Coinbase Onramp is a hosted widget. We assemble the init URL with
 * the user's destination address and desired USDC amount; the user
 * completes KYC + card flow inside the widget; USDC lands in their
 * Solana wallet; a separate step moves it onto Bulk via their deposit
 * flow (Phase 3 — blocked on the Bulk bridge question).
 *
 * Docs: https://docs.cloud.coinbase.com/pay-sdk/docs/welcome
 */

import type { RampDriver, RampQuote, RampQuoteInput } from './index.js';

const COINBASE_ONRAMP_BASE = 'https://pay.coinbase.com/buy/select-asset';

export const coinbaseDriver: RampDriver = {
  id: 'coinbase',
  label: 'Coinbase Onramp',
  isProduction: true,

  isAvailable() {
    return Boolean(process.env['NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID']);
  },

  async getQuote(input: RampQuoteInput): Promise<RampQuote> {
    const appId = process.env['NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID'];
    if (!appId) {
      return {
        providerId: 'coinbase',
        feeUsd: 0,
        estimatedReceiveUsd: input.amountUsd,
        estimatedTimeSec: 0,
        action: {
          kind: 'unavailable',
          reason: 'Coinbase Onramp not configured',
        },
      };
    }

    // Realistic fee estimate: 1% + $0.50 network. Real quote comes from
    // the widget; this is for display before the user clicks through.
    const feeUsd = input.amountUsd * 0.01 + 0.5;

    if (input.direction === 'onramp') {
      const params = new URLSearchParams({
        appId,
        destinationWallets: JSON.stringify([
          {
            address: input.userAddress,
            blockchains: ['solana'],
            assets: ['USDC'],
          },
        ]),
        presetFiatAmount: String(input.amountUsd),
        fiatCurrency: input.fiatCurrency ?? 'USD',
        defaultAsset: 'USDC',
        defaultNetwork: 'solana',
      });
      return {
        providerId: 'coinbase',
        feeUsd,
        estimatedReceiveUsd: Math.max(0, input.amountUsd - feeUsd),
        estimatedTimeSec: 90, // typical card → Solana USDC
        action: {
          kind: 'redirect',
          url: `${COINBASE_ONRAMP_BASE}?${params.toString()}`,
        },
      };
    }

    // Off-ramp uses a different endpoint; Phase 3 work.
    return {
      providerId: 'coinbase',
      feeUsd,
      estimatedReceiveUsd: Math.max(0, input.amountUsd - feeUsd),
      estimatedTimeSec: 120,
      action: {
        kind: 'unavailable',
        reason: 'Off-ramp coming in Phase 3',
      },
    };
  },
};
