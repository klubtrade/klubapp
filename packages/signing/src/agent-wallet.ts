// packages/signing/src/agent-wallet.ts
import type { AgentWalletScope, Signer } from './types';
import { signEnvelope } from './payloads';
import { base58Encode, createEd25519Signer, generateKeypair } from './signer';

/**
 * Mint a new agent-wallet keypair.
 *
 * Returns both the signer (for immediate use — first auth request)
 * and the raw private key (for at-rest storage, encrypted with KMS).
 *
 * This is the ONE place where a KLUB service holds an Ed25519 private
 * key. The private key never crosses a process boundary in the
 * clear — it goes straight to KMS wrap, and the wrapped bytes land
 * in Postgres. When the worker needs to sign, it unwraps on-demand,
 * signs, and drops the unwrapped key immediately.
 *
 * The private key bytes returned here should be handed off to the
 * KMS wrapper and zeroed from memory in the calling code.
 */
export function mintAgentWallet(): {
  readonly signer: Signer;
  readonly privateKey: Uint8Array;
} {
  const keypair = generateKeypair();
  return {
    signer: createEd25519Signer(keypair),
    privateKey: keypair.privateKey,
  };
}

/**
 * Build the authorization payload a user signs with their primary
 * Bulk account key to grant an agent wallet its scope.
 *
 * Flow:
 *   1. KLUB mints an agent wallet (`mintAgentWallet()`)
 *   2. KLUB returns the agent pubkey + scope to the client
 *   3. Client signs this authorization using their Bulk account
 *      (via Phantom / Backpack / etc.)
 *   4. Client sends the signed authorization to Bulk directly
 *   5. Bulk registers the agent key under the user's account
 *   6. KLUB's worker now signs orders with the agent key; Bulk
 *      validates scope on every request
 */
export async function buildAgentWalletAuthorization(params: {
  readonly userSigner: Signer;
  readonly scope: AgentWalletScope;
}) {
  if (params.scope.canWithdraw !== false) {
    // Defense in depth: even with a malicious config upstream,
    // KLUB-built agent-wallet authorizations must never grant
    // withdrawal rights. This is an invariant, not a default.
    throw new Error('agent wallets cannot carry withdrawal authority');
  }
  if (params.scope.expiresAt <= Date.now()) {
    throw new Error('agent wallet expiry must be in the future');
  }
  return signEnvelope({
    body: {
      op: 'manageAgentWallet' as const,
      action: 'authorize' as const,
      userPubkey: params.scope.userPubkey,
      agentPubkey: params.scope.agentPubkey,
      allowedMarkets: params.scope.allowedMarkets,
      maxNotionalUsd: params.scope.maxNotionalUsd,
      expiresAt: params.scope.expiresAt,
      canWithdraw: false,
    },
    signer: params.userSigner,
  });
}

/**
 * Build a revocation payload for an existing agent wallet. The
 * user signs this to instantly strip KLUB's key of all permissions.
 */
export async function buildAgentWalletRevocation(params: {
  readonly userSigner: Signer;
  readonly agentPubkey: string;
}) {
  return signEnvelope({
    body: {
      op: 'manageAgentWallet' as const,
      action: 'revoke' as const,
      agentPubkey: params.agentPubkey,
    },
    signer: params.userSigner,
  });
}

/**
 * Helper for display: shorten a base58 pubkey to `Fu…PQh7` form
 * for UI contexts. Keeps the first 2 and last 4 chars.
 */
export function shortenPubkey(pubkey: string | Uint8Array): string {
  const s = typeof pubkey === 'string' ? pubkey : base58Encode(pubkey);
  if (s.length <= 8) return s;
  return `${s.slice(0, 2)}…${s.slice(-4)}`;
}
