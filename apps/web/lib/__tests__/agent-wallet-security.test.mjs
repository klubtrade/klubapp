import { describe, expect, it } from 'vitest';

import { agentSignerFromStored, stripStoredAgentSecret } from '../bulk/agent-wallet.ts';

describe('legacy agent wallet security', () => {
  it('removes browser-readable secret material but retains revocation metadata', () => {
    const stored = {
      v: 1,
      account: 'account',
      agentPublicKeyBase58: 'agent',
      secretKeyBase64: 'sensitive',
      authorizedAt: 123,
    };
    const safe = stripStoredAgentSecret(stored);
    expect(safe).not.toHaveProperty('secretKeyBase64');
    expect(safe.agentPublicKeyBase58).toBe('agent');
    expect(agentSignerFromStored(safe)).toBeNull();
  });
});
