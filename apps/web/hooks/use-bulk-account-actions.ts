'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useState } from 'react';

import { useAgentWallet } from '@/hooks/use-agent-wallet';
import {
  submitCreateSubAccount,
  submitTransfer,
  type SubmitOrderResult,
} from '@/lib/bulk/orders';

/**
 * Hooks for KLUB Cash actions that map to Bulk v1.0.14 sub-account /
 * transfer primitives. Mirrors `useBulkOrder` semantics:
 *   - Prefer the agent wallet (silent, no popup) when authorized
 *   - Fall back to wallet.signMessage (Solflare popup)
 *   - Track state: idle | submitting | success | error
 */

type ActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly result: Extract<SubmitOrderResult, { ok: true }> }
  | { readonly status: 'error'; readonly result: Extract<SubmitOrderResult, { ok: false }> };

function useSigner() {
  const { publicKey, signMessage, connected } = useWallet();
  const { agent, agentSigner } = useAgentWallet();

  const ready = connected && publicKey !== null;
  const mainPubkey = publicKey?.toBase58() ?? null;
  const canUseAgent =
    agent !== null && agentSigner !== null && mainPubkey !== null && agent.account === mainPubkey;
  const usingAgent = canUseAgent;

  return { ready, mainPubkey, canUseAgent, agent, agentSigner, signMessage, usingAgent };
}

export function useCreatePot(): {
  readonly state: ActionState;
  readonly create: (input: { readonly name: string }) => Promise<SubmitOrderResult>;
  readonly reset: () => void;
  readonly usingAgent: boolean;
} {
  const ctx = useSigner();
  const [state, setState] = useState<ActionState>({ status: 'idle' });

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  const create = useCallback(
    async (input: { readonly name: string }): Promise<SubmitOrderResult> => {
      if (!ctx.ready || !ctx.mainPubkey) {
        const failure: SubmitOrderResult = {
          ok: false,
          reason: 'rejected_invalid',
          message: 'Connect a wallet first.',
        };
        setState({ status: 'error', result: failure });
        return failure;
      }
      setState({ status: 'submitting' });

      let result: SubmitOrderResult;
      if (ctx.canUseAgent && ctx.agentSigner) {
        result = await submitCreateSubAccount({
          name: input.name,
          signer: ctx.agentSigner,
          account: ctx.mainPubkey,
        });
      } else if (ctx.signMessage) {
        result = await submitCreateSubAccount({
          name: input.name,
          signer: { publicKeyBase58: ctx.mainPubkey, signMessage: ctx.signMessage },
        });
      } else {
        result = {
          ok: false,
          reason: 'rejected_invalid',
          message: 'Connected wallet does not support message signing.',
        };
      }

      if (result.ok) setState({ status: 'success', result });
      else setState({ status: 'error', result });
      return result;
    },
    [ctx.ready, ctx.mainPubkey, ctx.canUseAgent, ctx.agentSigner, ctx.signMessage],
  );

  return { state, create, reset, usingAgent: ctx.usingAgent };
}

export interface TransferInput {
  readonly kind: 'internal' | 'external';
  readonly from: string;
  readonly to: string;
  readonly marginSymbol: string;
  readonly amount: number;
}

export function useTransfer(): {
  readonly state: ActionState;
  readonly transfer: (input: TransferInput) => Promise<SubmitOrderResult>;
  readonly reset: () => void;
  readonly usingAgent: boolean;
} {
  const ctx = useSigner();
  const [state, setState] = useState<ActionState>({ status: 'idle' });

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  const transfer = useCallback(
    async (input: TransferInput): Promise<SubmitOrderResult> => {
      if (!ctx.ready || !ctx.mainPubkey) {
        const failure: SubmitOrderResult = {
          ok: false,
          reason: 'rejected_invalid',
          message: 'Connect a wallet first.',
        };
        setState({ status: 'error', result: failure });
        return failure;
      }
      setState({ status: 'submitting' });

      let result: SubmitOrderResult;
      if (ctx.canUseAgent && ctx.agentSigner) {
        result = await submitTransfer({
          ...input,
          signer: ctx.agentSigner,
          account: ctx.mainPubkey,
        });
      } else if (ctx.signMessage) {
        result = await submitTransfer({
          ...input,
          signer: { publicKeyBase58: ctx.mainPubkey, signMessage: ctx.signMessage },
        });
      } else {
        result = {
          ok: false,
          reason: 'rejected_invalid',
          message: 'Connected wallet does not support message signing.',
        };
      }

      if (result.ok) setState({ status: 'success', result });
      else setState({ status: 'error', result });
      return result;
    },
    [ctx.ready, ctx.mainPubkey, ctx.canUseAgent, ctx.agentSigner, ctx.signMessage],
  );

  return { state, transfer, reset, usingAgent: ctx.usingAgent };
}
