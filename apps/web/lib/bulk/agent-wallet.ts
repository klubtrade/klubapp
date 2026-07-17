/**
 * Agent wallet — ed25519 keypair that trades on behalf of the user
 * without a wallet popup for every order.
 *
 * Lifecycle:
 *   1. Main wallet (Solflare) signs a one-time `agentWalletCreation`
 *      tx authorizing an ephemeral agent pubkey on Bulk.
 *   2. Legacy testnet builds stored the agent private key in localStorage.
 *   3. All subsequent orders/cancels sign locally with the agent key.
 *      Bulk accepts them because `signer=agent_pub` is in its
 *      authorized-agents set for `account=user_pub`.
 *   4. Revocation: signs another `agentWalletCreation` with `d: true`,
 *      clears local storage.
 *
 * Security notes (important):
 *   - Private keys in localStorage are readable by any JS on the domain.
 *     This legacy fast-trading path is enabled for testnet/devnet-staging
 *     only, unless explicitly overridden by env.
 *   - Existing records are stripped to public revocation metadata by
 *     `useAgentWallet`; production signing belongs in Privy or a server
 *     signer backed by KMS/HSM, never ordinary browser storage.
 *   - Keys are NOT shared across tabs/windows. Each browser origin
 *     has one agent per main account.
 */

import bs58 from 'bs58';
import nacl from 'tweetnacl';

// -------------------------------------------------------------------------
// Storage
// -------------------------------------------------------------------------

/**
 * Per-user agent record in localStorage. Keyed by main account pubkey
 * so multiple users sharing a browser get separate agents.
 *
 * `secretKeyBase64` is the 64-byte ed25519 secret key
 * (32 bytes seed || 32 bytes pubkey, tweetnacl's standard format).
 * Base64 rather than base58 because base58 for 64 bytes is verbose
 * and offers no advantage over base64 for opaque storage.
 */
export interface StoredAgentWallet {
  readonly account: string;
  readonly agentPublicKeyBase58: string;
  readonly secretKeyBase64?: string;
  readonly authorizedAt: number;
  /** Version field for forward-compat if we ever rotate key format. */
  readonly v: 1;
}

const STORAGE_PREFIX = 'klub.agentWallet.';

function storageKeyFor(account: string): string {
  return `${STORAGE_PREFIX}${account}`;
}

/**
 * Read the stored agent for a given main account. Returns null if
 * no agent is authorized, or if the stored blob is corrupt / from a
 * future version we don't understand.
 */
export function loadStoredAgent(account: string): StoredAgentWallet | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKeyFor(account));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidStoredAgent(parsed, account)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write the stored agent. Throws only if localStorage is unavailable
 * (private mode, quota, etc.) so callers can surface a meaningful
 * error to the user.
 *
 * Dispatches a same-tab CustomEvent after writing. Browsers only
 * fire native `storage` events in OTHER tabs — to keep components
 * within the current tab in sync, we broadcast via a custom event
 * that `useAgentWallet` listens for.
 */
export function saveStoredAgent(agent: StoredAgentWallet): void {
  window.localStorage.setItem(storageKeyFor(agent.account), JSON.stringify(agent));
  try {
    window.dispatchEvent(new CustomEvent('klub:agentWalletChanged'));
  } catch {
    // swallow — custom events aren't critical, only a sync hint
  }
}

/**
 * Remove the stored agent. Does not revoke on Bulk — the caller must
 * separately submit a revocation `agentWalletCreation` action if they
 * want Bulk's server-side record cleared. This function only clears
 * the browser's cached key.
 *
 * Like saveStoredAgent, dispatches a same-tab CustomEvent so other
 * components in the tab re-read storage.
 */
export function clearStoredAgent(account: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(storageKeyFor(account));
  try {
    window.dispatchEvent(new CustomEvent('klub:agentWalletChanged'));
  } catch {
    // swallow
  }
}

function isValidStoredAgent(raw: unknown, expectedAccount: string): raw is StoredAgentWallet {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  return (
    r['v'] === 1 &&
    typeof r['account'] === 'string' &&
    r['account'] === expectedAccount &&
    typeof r['agentPublicKeyBase58'] === 'string' &&
    r['agentPublicKeyBase58'].length > 0 &&
    (r['secretKeyBase64'] === undefined ||
      (typeof r['secretKeyBase64'] === 'string' && r['secretKeyBase64'].length > 0)) &&
    typeof r['authorizedAt'] === 'number'
  );
}

// -------------------------------------------------------------------------
// Keypair generation
// -------------------------------------------------------------------------

export interface GeneratedAgentKeypair {
  readonly publicKeyBase58: string;
  readonly secretKey: Uint8Array;
  readonly secretKeyBase64: string;
}

/**
 * Generate a fresh ed25519 keypair for use as an agent wallet.
 * The caller is responsible for persisting it (or discarding it if
 * the authorization flow fails).
 */
export function generateAgentKeypair(): GeneratedAgentKeypair {
  const kp = nacl.sign.keyPair();
  return {
    publicKeyBase58: bs58.encode(kp.publicKey),
    secretKey: kp.secretKey,
    secretKeyBase64: toBase64(kp.secretKey),
  };
}

// -------------------------------------------------------------------------
// Signer factory — adapts a stored agent into the BulkWalletSigner
// shape that submitOrder / submitCancel expect.
// -------------------------------------------------------------------------

/**
 * Adapt a stored agent into the signer shape used by `submitOrder` /
 * `submitCancel`. The resulting signer's `signMessage` is SYNC under
 * the hood but wrapped in a resolved Promise to satisfy the async
 * contract — no wallet popup, no user interaction.
 *
 * `publicKeyBase58` here is the AGENT's pubkey. Callers must set
 * `account` to the user's main pubkey separately; they are distinct
 * fields in Bulk's envelope and the agent's authority depends on
 * this asymmetry.
 */
export function agentSignerFromStored(stored: StoredAgentWallet): {
  readonly publicKeyBase58: string;
  readonly signMessage: (bytes: Uint8Array) => Promise<Uint8Array>;
} | null {
  if (!stored.secretKeyBase64) return null;
  const secretKey = fromBase64(stored.secretKeyBase64);
  if (secretKey.length !== 64) {
    throw new Error('Stored agent key is malformed (wrong length)');
  }
  return {
    publicKeyBase58: stored.agentPublicKeyBase58,
    signMessage: async (bytes: Uint8Array) => {
      // nacl.sign.detached returns a 64-byte Uint8Array signature.
      // Synchronous — wrapped in Promise.resolve only to match the
      // BulkWalletSigner interface, not because anything awaits.
      return nacl.sign.detached(bytes, secretKey);
    },
  };
}

/** Remove browser-readable key material while preserving revocation metadata. */
export function stripStoredAgentSecret(stored: StoredAgentWallet): StoredAgentWallet {
  const { secretKeyBase64: _secret, ...metadata } = stored;
  return metadata;
}

// -------------------------------------------------------------------------
// Base64 helpers — browser has atob/btoa but only on ASCII; for
// binary we round-trip via a byte array. Keep the encoding local so
// we don't take another dep.
// -------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return typeof window !== 'undefined' ? window.btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

function fromBase64(b64: string): Uint8Array {
  const s = typeof window !== 'undefined' ? window.atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
