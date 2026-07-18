'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  agentSignerFromStored,
  clearStoredAgent,
  generateAgentKeypair,
  loadStoredAgent,
  saveStoredAgent,
  stripStoredAgentSecret,
  type StoredAgentWallet,
} from '@/lib/bulk/agent-wallet';
import { submitAgentWalletAuth, type SubmitOrderResult } from '@/lib/bulk/orders';
import { useTradingWallet } from '@/lib/trading-wallet';

/**
 * React hook for observing and managing the active agent wallet.
 *
 * Responsibilities:
 *   - Read current agent from localStorage for the connected user.
 *   - Expose authorize/revoke actions that sign via the main wallet.
 *   - Expose an adapted BulkWalletSigner for the agent (caller uses
 *     this to sign orders locally without a wallet popup).
 *
 * Not responsible for:
 *   - Deciding whether to use agent or wallet signer - that's the
 *     order-submission hooks' call (useBulkOrder / useBulkCancel).
 *   - UI prompts - caller renders whatever copy suits its page.
 */

export interface UseAgentWalletResult {
  /** New local private-key agents are opt-in for disposable testnet builds only. */
  readonly creationEnabled: boolean;
  /**
   * The currently authorized agent for the connected user, or null
   * if none exists or no wallet is connected.
   */
  readonly agent: StoredAgentWallet | null;
  /** True while an authorize or revoke flow is in progress. */
  readonly pending: boolean;
  /** Last authorize/revoke result, or null if nothing has run yet. */
  readonly lastResult: SubmitOrderResult | null;
  /**
   * Generate a fresh keypair, have the main wallet sign the
   * authorization, persist on success.
   *
   * Returns the submit result so the caller can surface success /
   * failure. On success, `agent` in the next render will be the new
   * record.
   */
  readonly authorize: () => Promise<SubmitOrderResult>;
  /**
   * Submit a revocation `agentWalletCreation` with `d: true`, signed
   * by the main wallet. On success, the local agent is cleared.
   *
   * If no agent is currently authorized, returns a
   * `rejected_invalid` result without prompting the wallet.
   */
  readonly revoke: () => Promise<SubmitOrderResult>;
  /**
   * Convenience: the adapted signer for the current agent, or null
   * if no agent. Can be plugged into submitOrder / submitCancel.
   */
  readonly agentSigner: {
    readonly publicKeyBase58: string;
    readonly signMessage: (bytes: Uint8Array) => Promise<Uint8Array>;
  } | null;
}

export function useAgentWallet(): UseAgentWalletResult {
  const wallet = useTradingWallet();
  const connected = wallet.connected;
  const signMessage = wallet.signMessage;
  const mainPubkey = wallet.publicKeyBase58;

  // Local mirror of the stored record. Seeded from localStorage on
  // mount / pubkey change, then updated on authorize/revoke success.
  const [agent, setAgent] = useState<StoredAgentWallet | null>(null);
  const [pending, setPending] = useState(false);
  const [lastResult, setLastResult] = useState<SubmitOrderResult | null>(null);
  const creationEnabled = shouldEnableBrowserAgentWallets();

  // Reload from storage whenever the user switches wallets, or when
  // localStorage for this user's key changes (from another tab, or
  // from our own authorize/revoke). Without the storage-event
  // listener, an agent authorized on /trade would not be
  // visible to a /trade page already mounted in another tab.
  useEffect(() => {
    if (!mainPubkey) {
      setAgent(null);
      return;
    }
    const key = `klub.agentWallet.${mainPubkey}`;

    // Initial read.
    const stored = loadStoredAgent(mainPubkey);
    if (stored?.secretKeyBase64 && !creationEnabled) {
      const safeMetadata = stripStoredAgentSecret(stored);
      saveStoredAgent(safeMetadata);
      setAgent(safeMetadata);
    } else {
      setAgent(stored);
    }

    // Cross-tab sync: fires when localStorage is mutated in ANY tab
    // except the one doing the mutation. Chrome/Safari/Firefox all
    // emit this for the same-origin tabs.
    function onStorage(e: StorageEvent) {
      if (e.key !== key && e.key !== null) return;
      // e.key === null means localStorage.clear() - always re-read.
      const next = loadStoredAgent(mainPubkey!);
      if (next?.secretKeyBase64 && !creationEnabled) {
        const safeMetadata = stripStoredAgentSecret(next);
        saveStoredAgent(safeMetadata);
        setAgent(safeMetadata);
      } else {
        setAgent(next);
      }
    }
    window.addEventListener('storage', onStorage);

    // Same-tab sync: the storage event does NOT fire in the tab
    // that wrote the value. We dispatch a synthetic CustomEvent on
    // the window from saveStoredAgent/clearStoredAgent (see below)
    // so components in the same tab stay in sync too.
    function onLocal() {
      const next = loadStoredAgent(mainPubkey!);
      if (next?.secretKeyBase64 && !creationEnabled) {
        const safeMetadata = stripStoredAgentSecret(next);
        saveStoredAgent(safeMetadata);
        setAgent(safeMetadata);
      } else {
        setAgent(next);
      }
    }
    window.addEventListener('klub:agentWalletChanged', onLocal);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('klub:agentWalletChanged', onLocal);
    };
  }, [creationEnabled, mainPubkey]);

  const authorize = useCallback(async (): Promise<SubmitOrderResult> => {
    if (!creationEnabled) {
      const failure: SubmitOrderResult = {
        ok: false,
        reason: 'rejected_invalid',
        message: 'Browser-stored agent keys are disabled. Use Privy or approve this order directly.',
      };
      setLastResult(failure);
      return failure;
    }
    if (!connected || !mainPubkey || !signMessage) {
      const failure: SubmitOrderResult = {
        ok: false,
        reason: 'rejected_invalid',
        message: 'Connect a wallet first.',
      };
      setLastResult(failure);
      return failure;
    }

    setPending(true);
    try {
      // Generate the keypair BEFORE asking the user to sign. If the
      // wallet popup is dismissed, we simply discard the keypair -
      // nothing hits Bulk, nothing persists.
      const kp = generateAgentKeypair();

      const result = await submitAgentWalletAuth({
        agentPublicKey: kp.publicKeyBase58,
        isDelete: false,
        signer: {
          publicKeyBase58: mainPubkey,
          signMessage,
        },
      });

      setLastResult(result);
      if (result.ok) {
        const record: StoredAgentWallet = {
          v: 1,
          account: mainPubkey,
          agentPublicKeyBase58: kp.publicKeyBase58,
          secretKeyBase64: kp.secretKeyBase64,
          authorizedAt: Date.now(),
        };
        try {
          saveStoredAgent(record);
          setAgent(record);
        } catch (err) {
          // localStorage blocked (private mode etc.). Surface as an
          // authorization failure so the caller's UI reflects it.
          const storageFail: SubmitOrderResult = {
            ok: false,
            reason: 'rejected_invalid',
            message: `Agent authorized on Bulk, but saving locally failed: ${
              err instanceof Error ? err.message : 'unknown error'
            }. Your browser may be blocking localStorage.`,
          };
          setLastResult(storageFail);
          return storageFail;
        }
      }
      return result;
    } finally {
      setPending(false);
    }
  }, [connected, creationEnabled, mainPubkey, signMessage]);

  const revoke = useCallback(async (): Promise<SubmitOrderResult> => {
    if (!connected || !mainPubkey || !signMessage) {
      const failure: SubmitOrderResult = {
        ok: false,
        reason: 'rejected_invalid',
        message: 'Connect a wallet first.',
      };
      setLastResult(failure);
      return failure;
    }
    if (!agent) {
      const failure: SubmitOrderResult = {
        ok: false,
        reason: 'rejected_invalid',
        message: 'No agent to revoke.',
      };
      setLastResult(failure);
      return failure;
    }

    setPending(true);
    try {
      const result = await submitAgentWalletAuth({
        agentPublicKey: agent.agentPublicKeyBase58,
        isDelete: true,
        signer: {
          publicKeyBase58: mainPubkey,
          signMessage,
        },
      });
      setLastResult(result);
      if (result.ok) {
        clearStoredAgent(mainPubkey);
        setAgent(null);
      }
      return result;
    } finally {
      setPending(false);
    }
  }, [agent, connected, mainPubkey, signMessage]);

  const agentSigner = agent ? agentSignerFromStored(agent) : null;

  return {
    agent,
    pending,
    lastResult,
    authorize,
    revoke,
    agentSigner,
    creationEnabled,
  };
}

function shouldEnableBrowserAgentWallets(): boolean {
  const explicit = process.env['NEXT_PUBLIC_ENABLE_LEGACY_AGENT_WALLETS'];
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;

  // The current KLUB deployment is testnet/devnet-staging. Keep the fast
  // trading button available by default there, but require an explicit opt-in
  // before enabling browser-stored agent keys on mainnet.
  return process.env['NEXT_PUBLIC_BULK_NETWORK'] !== 'mainnet';
}
