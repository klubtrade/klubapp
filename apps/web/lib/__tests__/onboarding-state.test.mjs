import { describe, expect, it } from 'vitest';

import { shouldRequireOnboarding } from '../onboarding-state.ts';

const base = {
  prefsReady: true,
  walletReady: true,
  connected: true,
  publicKeyBase58: 'wallet-a',
  pathname: '/trade',
  prefs: { onboardingComplete: false, onboardingWallet: null },
};

describe('onboarding route policy', () => {
  it('routes a newly connected wallet into onboarding', () => {
    expect(shouldRequireOnboarding(base)).toBe(true);
  });

  it('does not interrupt disconnected visitors or the onboarding page', () => {
    expect(shouldRequireOnboarding({ ...base, connected: false })).toBe(false);
    expect(shouldRequireOnboarding({ ...base, pathname: '/onboarding' })).toBe(false);
  });

  it('requires onboarding again when a different wallet connects', () => {
    const prefs = { onboardingComplete: true, onboardingWallet: 'wallet-a' };
    expect(shouldRequireOnboarding({ ...base, prefs })).toBe(false);
    expect(
      shouldRequireOnboarding({ ...base, publicKeyBase58: 'wallet-b', prefs }),
    ).toBe(true);
  });
});
