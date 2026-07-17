import { describe, expect, it, beforeEach } from 'vitest';

import {
  claimFallbackHandle,
  getFallbackHandle,
  resetFallbackHandlesForTests,
  shouldUseHandleRegistryFallback,
} from '../handle-registry-fallback.ts';

describe('handle registry fallback', () => {
  beforeEach(() => {
    resetFallbackHandlesForTests();
  });

  it('claims and resolves handles in the in-memory fallback store', () => {
    const result = claimFallbackHandle('micah', 'wallet-a');

    expect(result.ok).toBe(true);
    expect(result.record.handle).toBe('micah');
    expect(result.record.pubkey).toBe('wallet-a');
    expect(result.created).toBe(true);
    expect(getFallbackHandle('micah')?.pubkey).toBe('wallet-a');
  });

  it('keeps same-wallet claims idempotent and rejects different owners', () => {
    claimFallbackHandle('micah', 'wallet-a');

    expect(claimFallbackHandle('micah', 'wallet-a')).toMatchObject({
      ok: true,
      created: false,
    });
    expect(claimFallbackHandle('micah', 'wallet-b')).toMatchObject({
      ok: false,
      reason: 'taken',
    });
  });

  it('only falls back for provisioning and connection errors', () => {
    expect(shouldUseHandleRegistryFallback({ code: '42P01' })).toBe(true);
    expect(shouldUseHandleRegistryFallback(new Error('relation "handles" does not exist'))).toBe(true);
    expect(shouldUseHandleRegistryFallback(new Error('ECONNREFUSED'))).toBe(true);
    expect(shouldUseHandleRegistryFallback(new Error('duplicate key value'))).toBe(false);
  });
});
