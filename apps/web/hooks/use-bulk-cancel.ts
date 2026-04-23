'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useState } from 'react';

import { useAgentWallet } from '@/hooks/use-agent-wallet';
import { submitCancel, type SubmitCancelInput, type SubmitOrderResult } from '@/lib/bulk/orders';

/**
 * React hook that wraps the client-side Bulk cancel-order flow.
 *
 * Mirrors `useBulkOrder` but for cancel actions. Same wallet-adapter
 * integration, same agent-wallet fast path, same state-machine shape,
 * same result type — so a UI that already handles the
 * `SubmitOrderResult` tagged union (e.g. via the shared ResultModal)
 * gets the cancel case for free.
 */

export type BulkCancelState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly result: Extract<SubmitOrderResult, { ok: true }> }
  | { readonly status: 'error'; readonly result: Extract<SubmitOrderResult, { ok: false }> };

export type BulkCancelRequest = Omit<SubmitCancelInput, 'signer' | 'account'>;

export function useBulkCancel(): {
  readonly state: BulkCancelState;
  readonly cancel: (req: BulkCancelRequest) => Promise<SubmitOrderResult>;
  readonly reset: () => void;
  readonly usingAgent: boolean;
} {
  const { publicKey, signMessage, connected } = useWallet();
  const { agent, agentSigner } = useAgentWallet();
  const [state, setState] = useState<BulkCancelState>({ status: 'idle' });

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const cancel = useCallback(
    async (req: BulkCancelRequest): Promise<SubmitOrderResult> => {
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
      setState({ status: 'submitting' });

      const canUseAgent =
        agent !== null && agentSigner !== null && agent.account === mainPubkey;

      if (canUseAgent) {
        const result = await submitCancel({
          ...req,
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

      const result = await submitCancel({
        ...req,
        signer: {
          publicKeyBase58: mainPubkey,
          signMessage,
        },
      });

      if (result.ok) setState({ status: 'success', result });
      else setState({ status: 'error', result });
      return result;
    },
    [agent, agentSigner, connected, publicKey, signMessage],
  );

  const usingAgent =
    agent !== null &&
    agentSigner !== null &&
    connected &&
    publicKey !== null &&
    agent.account === publicKey.toBase58();

  return { state, cancel, reset, usingAgent };
}