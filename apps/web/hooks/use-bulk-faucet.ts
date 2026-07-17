'use client';

import { useCallback, useState } from 'react';

import { useAgentWallet } from '@/hooks/use-agent-wallet';
import { submitFaucetClaim, type SubmitOrderResult } from '@/lib/bulk/orders';
import { useTradingWallet } from '@/lib/trading-wallet';

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

/**
 * Optional `account` override targets the drip at a specific sub-account
 * (Pot). The signer is always the master wallet (or its agent); Bulk
 * authorizes the master to claim into any of its sub-accounts.
 */
export interface UseBulkFaucetOptions {
  readonly account?: string | null;
}

export function useBulkFaucet(options: UseBulkFaucetOptions = {}): {
  readonly state: BulkFaucetState;
  readonly claim: () => Promise<SubmitOrderResult>;
  readonly reset: () => void;
  readonly usingAgent: boolean;
} {
  const wallet = useTradingWallet();
  const { agent, agentSigner } = useAgentWallet();
  const [state, setState] = useState<BulkFaucetState>({ status: 'idle' });
  const accountOverride = options.account ?? null;

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const claim = useCallback(async (): Promise<SubmitOrderResult> => {
    if (!wallet.connected || !wallet.publicKeyBase58) {
      const failure: SubmitOrderResult = {
        ok: false,
        reason: 'rejected_invalid',
        message: 'Connect a wallet first.',
      };
      setState({ status: 'error', result: failure });
      return failure;
    }

    const mainPubkey = wallet.publicKeyBase58;
    const targetAccount = accountOverride ?? mainPubkey;
    setState({ status: 'claiming' });

    const canUseAgent =
      agent !== null && agentSigner !== null && agent.account === mainPubkey;

    if (canUseAgent) {
      // eslint-disable-next-line no-console
      console.debug('[useBulkFaucet] signing path: agent', {
        target: targetAccount.slice(0, 8),
        agent: agent.agentPublicKeyBase58.slice(0, 8),
      });
      const result = await submitFaucetClaim({
        signer: agentSigner,
        account: targetAccount,
      });
      if (result.ok) setState({ status: 'success', result });
      else setState({ status: 'error', result });
      return result;
    }

    if (!wallet.signMessage) {
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
      target: targetAccount.slice(0, 8),
    });

    const result = await submitFaucetClaim({
      signer: {
        publicKeyBase58: mainPubkey,
        signMessage: wallet.signMessage,
      },
      account: targetAccount,
    });

    if (result.ok) setState({ status: 'success', result });
    else setState({ status: 'error', result });
    return result;
  }, [accountOverride, agent, agentSigner, wallet]);

  const usingAgent =
    agent !== null &&
    agentSigner !== null &&
    wallet.connected &&
    wallet.publicKeyBase58 !== null &&
    agent.account === wallet.publicKeyBase58;

  return { state, claim, reset, usingAgent };
}
