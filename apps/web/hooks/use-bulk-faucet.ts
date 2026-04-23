'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useState } from 'react';

import { useAgentWallet } from '@/hooks/use-agent-wallet';
import { submitFaucetClaim, type SubmitOrderResult } from '@/lib/bulk/orders';

/**
 * React hook wrapping the client-side faucet claim flow.
 *
 * Parallels `useBulkOrder`: prefers the agent signer when authorized
 * (silent claim, no wallet popup), falls back to the main wallet when
 * no agent is available.
 *
 * State machine:
 *   idle → claiming → (success | error) → (reset) → idle
 *
 * UI pattern:
 *   const { claim, state, usingAgent, reset } = useBulkFaucet();
 *   <button onClick={claim} disabled={state.status === 'claiming'}>
 *     {state.status === 'claiming' ? 'Claiming…' : 'Claim test USDC'}
 *   </button>
 *
 * The `usingAgent` flag lets the UI show "signing silently…" vs
 * "waiting for wallet…" without leaking the internal branching.
 */

export type BulkFaucetState =
  | { readonly status: 'idle' }
  | { readonly status: 'claiming' }
  | { readonly status: 'success'; readonly result: Extract<SubmitOrderResult, { ok: true }> }
  | { readonly status: 'error'; readonly result: Extract<SubmitOrderResult, { ok: false }> };

export function useBulkFaucet(): {
  readonly state: BulkFaucetState;
  readonly claim: () => Promise<SubmitOrderResult>;
  readonly reset: () => void;
  readonly usingAgent: boolean;
} {
  const { publicKey, signMessage, connected } = useWallet();
  const { agent, agentSigner } = useAgentWallet();
  const [state, setState] = useState<BulkFaucetState>({ status: 'idle' });

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const claim = useCallback(async (): Promise<SubmitOrderResult> => {
    if (!connected || !publicKey) {
      const failure: SubmitOrderResult = {
        ok: false,
        reason: 'rejected_invalid',
        message: 'Connect a wallet first.',
      };
      setState({ status: 'error', result: failure });
      return failure;
    }

    const mainPubkey = publicKey.toBase58();
    setState({ status: 'claiming' });

    const canUseAgent =
      agent !== null && agentSigner !== null && agent.account === mainPubkey;

    if (canUseAgent) {
      // eslint-disable-next-line no-console
      console.debug('[useBulkFaucet] signing path: agent', {
        account: mainPubkey.slice(0, 8),
        agent: agent.agentPublicKeyBase58.slice(0, 8),
      });
      const result = await submitFaucetClaim({
        signer: agentSigner,
        account: mainPubkey,
      });
      if (result.ok) setState({ status: 'success', result });
      else setState({ status: 'error', result });
      return result;
    }

    if (!signMessage) {
      const failure: SubmitOrderResult = {
        ok: false,
        reason: 'rejected_invalid',
        message: 'Connected wallet does not support message signing.',
      };
      setState({ status: 'error', result: failure });
      return failure;
    }

    // eslint-disable-next-line no-console
    console.debug('[useBulkFaucet] signing path: wallet (no agent)', {
      mainAccount: mainPubkey.slice(0, 8),
    });

    const result = await submitFaucetClaim({
      signer: {
        publicKeyBase58: mainPubkey,
        signMessage,
      },
    });

    if (result.ok) setState({ status: 'success', result });
    else setState({ status: 'error', result });
    return result;
  }, [agent, agentSigner, connected, publicKey, signMessage]);

  const usingAgent =
    agent !== null &&
    agentSigner !== null &&
    connected &&
    publicKey !== null &&
    agent.account === publicKey.toBase58();

  return { state, claim, reset, usingAgent };
}