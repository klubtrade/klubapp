'use client';

import { useCallback, useState } from 'react';

import { useActiveAccount } from '@/hooks/use-active-account';
import { useAgentWallet } from '@/hooks/use-agent-wallet';
import { submitCancel, type SubmitCancelInput, type SubmitOrderResult } from '@/lib/bulk/orders';
import { useTradingWallet } from '@/lib/trading-wallet';

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

export type BulkCancelRequest = Omit<SubmitCancelInput, 'signer' | 'account'> & {
  /** Optional account override — pot pubkey when cancelling from a sub-account. */
  readonly account?: string;
};

export function useBulkCancel(): {
  readonly state: BulkCancelState;
  readonly cancel: (req: BulkCancelRequest) => Promise<SubmitOrderResult>;
  readonly reset: () => void;
  readonly usingAgent: boolean;
} {
  const wallet = useTradingWallet();
  const { agent, agentSigner } = useAgentWallet();
  const { pubkey: activePubkey } = useActiveAccount();
  const [state, setState] = useState<BulkCancelState>({ status: 'idle' });

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const cancel = useCallback(
    async (req: BulkCancelRequest): Promise<SubmitOrderResult> => {
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
      const account = req.account ?? activePubkey ?? mainPubkey;
      setState({ status: 'submitting' });

      const canUseAgent =
        agent !== null && agentSigner !== null && agent.account === mainPubkey;

      if (canUseAgent) {
        const result = await submitCancel({
          ...req,
          signer: agentSigner,
          account,
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

      const result = await submitCancel({
        ...req,
        account,
        signer: {
          publicKeyBase58: mainPubkey,
          signMessage: wallet.signMessage,
        },
      });

      if (result.ok) setState({ status: 'success', result });
      else setState({ status: 'error', result });
      return result;
    },
    [activePubkey, agent, agentSigner, wallet],
  );

  const usingAgent =
    agent !== null &&
    agentSigner !== null &&
    wallet.connected &&
    wallet.publicKeyBase58 !== null &&
    agent.account === wallet.publicKeyBase58;

  return { state, cancel, reset, usingAgent };
}
