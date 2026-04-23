// packages/signing/src/payloads.ts
import { sha256 } from '@noble/hashes/sha256';

import type { SignedEnvelope, Signer } from './types';

/**
 * Canonical payload serialization for Bulk-signed requests.
 *
 * Every authenticated Bulk request is a JSON blob wrapped in an
 * envelope with:
 *   - `nonce`      — 16-byte random, prevents replay
 *   - `timestamp`  — unix ms, Bulk rejects requests > 30s old
 *   - `body`       — the request-specific payload (placeOrder, etc.)
 *
 * The signed bytes are the SHA-256 of the canonical-JSON envelope.
 * Canonical means: keys sorted ascending, no whitespace, UTF-8
 * encoding — a stable serialization across platforms.
 *
 * When bulk-keychain ships, it will do this canonicalization for us.
 * For now we do it ourselves.
 */

export interface RequestEnvelope<B> {
  readonly nonce: string;      // hex, 32 chars
  readonly timestamp: number;  // unix ms
  readonly body: B;
}

/**
 * Canonicalize an envelope: sort keys, UTF-8 encode to bytes.
 */
export function canonicalizeEnvelope<B>(env: RequestEnvelope<B>): Uint8Array {
  const canonical = canonicalJson({
    body: env.body,
    nonce: env.nonce,
    timestamp: env.timestamp,
  });
  return new TextEncoder().encode(canonical);
}

/**
 * Hash to get the 32-byte digest that is actually signed.
 * Not strictly required (Ed25519 hashes internally), but matches
 * Bulk's convention so signatures we produce are verifiable on
 * their side without the server re-serializing.
 */
export function hashForSigning<B>(env: RequestEnvelope<B>): Uint8Array {
  return sha256(canonicalizeEnvelope(env));
}

/**
 * Sign any envelope body. Returns a SignedEnvelope wrapping the
 * canonical bytes, the signature, and the signer's pubkey.
 */
export async function signEnvelope<B>(params: {
  readonly body: B;
  readonly signer: Signer;
}): Promise<SignedEnvelope & { readonly envelope: RequestEnvelope<B> }> {
  const envelope: RequestEnvelope<B> = {
    body: params.body,
    nonce: generateNonce(),
    timestamp: Date.now(),
  };
  const payload = canonicalizeEnvelope(envelope);
  const signature = await params.signer.sign(payload);
  return {
    payload,
    signature,
    publicKey: params.signer.publicKey,
    envelope,
  };
}

// ---------------------------------------------------------------------------
// Canonical JSON
// ---------------------------------------------------------------------------

function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number in payload');
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalJson(v)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return (
      '{' +
      keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') +
      '}'
    );
  }
  throw new Error(`unsupported value in canonical JSON: ${typeof value}`);
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
