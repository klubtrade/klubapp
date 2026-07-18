// apps/web/lib/ramp/index.ts
/**
 * Ramp layer - pluggable fiat on/off ramp.
 *
 * The landing / deposit UI talks to a `RampDriver`; it never knows
 * whether it's hitting Coinbase Onramp, Transak, or (eventually)
 * the Ika + Encrypt experimental driver.
 *
 * Driver A: `coinbase`   - production. Widget-based card → USDC → Bulk.
 * Driver B: `transak`    - fallback production. Covers coverage gaps.
 * Driver C: `ika-encrypt`- experimental, flagged off on mainnet until
 *                          both Ika and Encrypt reach Alpha 1.
 */

import { coinbaseDriver } from './coinbase.js';
import { ikaExperimentalDriver } from './ika-experimental.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RampDirection = 'onramp' | 'offramp';

export interface RampQuoteInput {
  readonly direction: RampDirection;
  readonly amountUsd: number;
  /** Destination Solana address for on-ramp, source for off-ramp. */
  readonly userAddress: string;
  readonly fiatCurrency?: string; // default 'USD'
}

export interface RampQuote {
  readonly providerId: string;
  readonly feeUsd: number;
  readonly estimatedReceiveUsd: number;
  readonly estimatedTimeSec: number;
  /** URL or widget-init payload the UI should present. */
  readonly action: RampAction;
}

export type RampAction =
  | { readonly kind: 'redirect'; readonly url: string }
  | { readonly kind: 'widget'; readonly initParams: Record<string, string> }
  | { readonly kind: 'unavailable'; readonly reason: string };

export interface RampDriver {
  readonly id: string;
  readonly label: string;
  readonly isProduction: boolean;
  /**
   * Is this driver usable right now? Drivers return false when env
   * vars / feature flags don't permit use (e.g. experimental on mainnet).
   */
  isAvailable(): boolean;
  getQuote(input: RampQuoteInput): Promise<RampQuote>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: readonly RampDriver[] = [coinbaseDriver, ikaExperimentalDriver];

/**
 * Pick the best available driver. Strategy:
 *   1. If the experimental driver is enabled by env flag AND on testnet,
 *      use it - that's the whole point.
 *   2. Otherwise: first production driver that's available.
 *   3. If none available, returns null - UI should surface "ramp coming soon".
 */
export function pickDriver(params: {
  readonly network: 'mainnet' | 'testnet';
  readonly experimentalEnabled: boolean;
}): RampDriver | null {
  if (params.experimentalEnabled && params.network === 'testnet') {
    if (ikaExperimentalDriver.isAvailable()) return ikaExperimentalDriver;
  }
  for (const driver of REGISTRY) {
    if (driver.isProduction && driver.isAvailable()) {
      return driver;
    }
  }
  return null;
}

export { coinbaseDriver, ikaExperimentalDriver };
