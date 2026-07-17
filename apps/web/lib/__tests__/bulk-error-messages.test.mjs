import { describe, expect, it } from 'vitest';

import {
  normalizeBulkErrorMessage,
  normalizeFaucetErrorMessage,
} from '../bulk/error-messages.ts';

describe('Bulk error messages', () => {
  it('does not leak Cloudflare HTML into user-facing Bulk errors', () => {
    const html = '<!DOCTYPE html><html><head><title>bulk.trade | 502: Bad gateway</title></head></html>';

    expect(normalizeBulkErrorMessage(html, 502)).toBe(
      'Bulk exchange is temporarily unavailable. Please try again in a few minutes.',
    );
  });

  it('turns faucet upstream outages into calm onboarding copy', () => {
    expect(normalizeFaucetErrorMessage('Cloudflare 502 Bad gateway', 502)).toBe(
      'Faucet claim was not confirmed. If this wallet already has test USDC, continue to Portfolio or start trading; otherwise try again.',
    );
  });

  it('turns duplicate faucet claims into a continue state', () => {
    expect(normalizeFaucetErrorMessage('faucet can only be claimed once per 72h')).toBe(
      'This wallet has already claimed test USDC recently. The faucet resets after 72 hours. Continue to Portfolio or start trading.',
    );
  });
});
