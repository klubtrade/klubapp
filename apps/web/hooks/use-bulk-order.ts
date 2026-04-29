'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useState } from 'react';

import { useActiveAccount } from '@/hooks/use-active-account';
import { useAgentWallet } from '@/hooks/use-agent-wallet';
import { submitOrder, type SubmitOrderInput, type SubmitOrderResult } from '@/lib/bulk/orders';

/**
 * React hook that wraps the client-side Bulk order submit flow.
 *
 * Responsibilities:
 *
 *   - Reads `publicKey` and `signMessage` from `@solana/wallet-adapter-react`.
 *   - If an agent wallet is authorized for the current user, signs
 *     locally with the agent key (no wallet popup).
 *   - Otherwise adapts the wallet into `BulkWalletSigner` shape and
 *     signs via the user's wallet popup.
 *   - Tracks submit state: `idle | submitting | success | error`.
 *   - Exposes `submit()` as a single async function for UI buttons.
 *   - Exposes `usingAgent` so the UI can decide whether to show a
 *     "signing in wallet…" spinner or just "submitting…".
 *
 * Not responsible for:
 *   - Toasts (caller shows whatever UI fits the page).
 *   - Wallet connection prompting (caller uses `useWalletGate`).
 *   - Prompting the user to authorize an agent (caller renders the
 *     AgentWalletPrompt component when it wants).
 */

export type BulkOrderState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly result: Extract<SubmitOrderResult, { ok: true }> }
  | { readonly status: 'error'; readonly result: Extract<SubmitOrderResult, { ok: false }> };

/**
 * Input shape for `submit()` — everything in `SubmitOrderInput` EXCEPT
 * the signer and account, which the hook injects from wallet-adapter
 * and the current agent record respectively.
 */
/**
 * Caller-supplied input. `signer` is injected by the hook from
 * wallet-adapter / agent. `account` is optional — when supplied (e.g.
 * the user is trading from a sub-account / pot), it's the trading
 * account; the master pubkey remains the signer. When omitted, the
 * hook defaults `account` to the master pubkey (self-trading from
 * the master EOA).
 */
export type BulkOrderRequest = Omit<SubmitOrderInput, 'signer' | 'account'> & {
  readonly account?: string;
};

export function useBulkOrder(): {
  readonly state: BulkOrderState;
  readonly submit: (req: BulkOrderRequest) => Promise<SubmitOrderResult>;
  readonly reset: () => void;
  /** True when the next submit will be silent (no wallet popup). */
  readonly usingAgent: boolean;
} {
  const { publicKey, signMessage, connected } = useWallet();
  const { agent, agentSigner } = useAgentWallet();
  // The trading account defaults to whatever the user has selected in
  // the AccountSwitcher (master or a pot). Per-call `req.account` still
  // overrides — useful for actions like Close-position that explicitly
  // target a specific account.
  const { pubkey: activePubkey } = useActiveAccount();
  const [state, setState] = useState<BulkOrderState>({ status: 'idle' });

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const submit = useCallback(
    async (req: BulkOrderRequest): Promise<SubmitOrderResult> => {
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

      // Prefer the agent signer when authorized. Double-check the
      // agent belongs to the currently connected wallet — defensive,
      // should always be true since useAgentWallet keys on pubkey.
      const canUseAgent =
        agent !== null && agentSigner !== null && agent.account === mainPubkey;

      // The trading account, in priority order:
      //   1. Caller-supplied `req.account` (explicit target — e.g.
      //      Close-position aimed at a specific account)
      //   2. Active account from the AccountSwitcher (master or pot)
      //   3. The wallet's master pubkey
      // Agents registered on the master auto-authorize sub-accounts
      // per Bulk v1.0.14, so the agent can sign for either.
      const account = req.account ?? activePubkey ?? mainPubkey;

      if (canUseAgent) {
        // eslint-disable-next-line no-console
        console.debug('[useBulkOrder] signing path: agent', {
          account: account.slice(0, 8),
          agent: agent.agentPublicKeyBase58.slice(0, 8),
        });
        const result = await submitOrder({
          ...req,
          signer: agentSigner,
          account,
        });
        if (result.ok) setState({ status: 'success', result });
        else setState({ status: 'error', result });
        return result;
      }

      // Fall through to wallet-signed flow.
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
      console.debug('[useBulkOrder] signing path: wallet (no agent available)', {
        hasAgent: agent !== null,
        agentAccount: agent?.account.slice(0, 8) ?? null,
        mainAccount: mainPubkey.slice(0, 8),
      });

      const result = await submitOrder({
        ...req,
        account,
        signer: {
          publicKeyBase58: mainPubkey,
          signMessage,
        },
      });

      if (result.ok) setState({ status: 'success', result });
      else setState({ status: 'error', result });
      return result;
    },
    [activePubkey, agent, agentSigner, connected, publicKey, signMessage],
  );

  const usingAgent =
    agent !== null &&
    agentSigner !== null &&
    connected &&
    publicKey !== null &&
    agent.account === publicKey.toBase58();

  return { state, submit, reset, usingAgent };
}