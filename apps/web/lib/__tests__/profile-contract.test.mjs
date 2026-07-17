import { describe, expect, it } from 'vitest';

import {
  cleanProfileUpdate,
  profileUpdateMessage,
} from '../profile-contract.ts';

describe('profile persistence contract', () => {
  it('canonicalizes update payloads for wallet signatures', () => {
    const a = profileUpdateMessage({
      pubkey: 'wallet-a',
      update: { onboardingComplete: true, handle: 'micah' },
    });
    const b = profileUpdateMessage({
      pubkey: 'wallet-a',
      update: { handle: 'micah', onboardingComplete: true },
    });

    expect(a).toBe(b);
    expect(a).toContain('klub:profile:update:');
  });

  it('drops undefined values but preserves explicit null handles', () => {
    expect(
      cleanProfileUpdate({
        handle: null,
        alertsEnabled: undefined,
        preferredTradeMode: 'simple',
      }),
    ).toEqual({ handle: null, preferredTradeMode: 'simple' });
  });
});
