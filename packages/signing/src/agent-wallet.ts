// packages/signing/src/agent-wallet.ts
import type { AgentWalletScope, Signer } from "./types.js";
import {
  base58Encode,
  createEd25519Signer,
  generateKeypair,
} from "./signer.js";

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

/** Validate KLUB's local limits before the official keychain authorization. */
export function assertSafeAgentWalletScope(
  scope: AgentWalletScope,
): AgentWalletScope {
  if (scope.canWithdraw !== false) {
    throw new Error("agent wallets cannot carry withdrawal authority");
  }
  if (scope.expiresAt <= Date.now()) {
    throw new Error("agent wallet expiry must be in the future");
  }
  return scope;
}

/**
 * Helper for display: shorten a base58 pubkey to `Fu…PQh7` form
 * for UI contexts. Keeps the first 2 and last 4 chars.
 */
export function shortenPubkey(pubkey: string | Uint8Array): string {
  const s = typeof pubkey === "string" ? pubkey : base58Encode(pubkey);
  if (s.length <= 8) return s;
  return `${s.slice(0, 2)}…${s.slice(-4)}`;
}
