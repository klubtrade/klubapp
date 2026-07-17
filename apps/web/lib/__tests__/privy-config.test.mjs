import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PRIVY_APP_ID,
  getPrivyLogoUrl,
  PRIVY_LOGIN_METHODS,
  PRIVY_SOLANA_WALLETS,
} from '../privy-config.ts';

describe('Privy configuration policy', () => {
  it('uses the staging app and exposes only email or wallet login', () => {
    expect(DEFAULT_PRIVY_APP_ID).toBe('cmrp21bm502390cjxce8liowo');
    expect(PRIVY_LOGIN_METHODS).toEqual(['email', 'wallet']);
  });

  it('keeps the wallet gateway Solana-only and broadly discoverable', () => {
    expect(PRIVY_SOLANA_WALLETS).toContain('phantom');
    expect(PRIVY_SOLANA_WALLETS).toContain('solflare');
    expect(PRIVY_SOLANA_WALLETS).toContain('backpack');
    expect(PRIVY_SOLANA_WALLETS).toContain('detected_solana_wallets');
    expect(PRIVY_SOLANA_WALLETS).toContain('wallet_connect_qr_solana');
  });

  it('builds the public 180x90 logo URL without duplicate slashes', () => {
    expect(getPrivyLogoUrl('https://klub.trade/')).toBe(
      'https://klub.trade/privy-logo.png',
    );
  });
});
