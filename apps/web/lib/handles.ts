'use client';

import bs58 from 'bs58';

/**
 * Client helpers for the @handle social layer.
 *
 * Two operations:
 *   - resolveHandle(handle) → pubkey | null
 *   - claimHandle(handle, signer) → result
 *
 * Both hit the routes in `apps/web/app/api/handles/`. Claiming requires
 * the connected wallet's `signMessage` to produce a signature over
 * `claim:${handle}`.
 */

export const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

export function normalizeHandle(input: string): string {
  return input.toLowerCase().replace(/^@/, '').trim();
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(normalizeHandle(handle));
}

export interface ResolveResult {
  readonly handle: string;
  readonly pubkey: string;
  readonly fallback?: boolean;
  readonly alreadyClaimed?: boolean;
}

/**
 * Look up a handle. Returns null on 404, throws on network/other errors.
 */
export async function resolveHandle(handle: string): Promise<ResolveResult | null> {
  const normalized = normalizeHandle(handle);
  if (!isValidHandle(normalized)) return null;
  const res = await fetch(`/api/handles/${encodeURIComponent(normalized)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `handle resolve failed (${res.status})`);
  }
  return (await res.json()) as ResolveResult;
}

export async function resolveHandleByPubkey(pubkey: string): Promise<ResolveResult | null> {
  const res = await fetch(`/api/handles/by-pubkey/${encodeURIComponent(pubkey)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `handle lookup failed (${res.status})`);
  }
  return (await res.json()) as ResolveResult;
}

export interface HandleSigner {
  readonly publicKeyBase58: string;
  readonly signMessage: (bytes: Uint8Array) => Promise<Uint8Array>;
}

export type ClaimResult =
  | { readonly ok: true; readonly handle: string; readonly pubkey: string; readonly fallback?: boolean; readonly alreadyClaimed?: boolean }
  | { readonly ok: false; readonly reason: 'invalid' | 'taken' | 'unauthorized' | 'database' | 'network'; readonly message: string };

/**
 * Claim a handle. Signs `claim:${handle}` with the supplied wallet
 * signer, then POSTs to `/api/handles/claim`.
 */
export async function claimHandle(
  rawHandle: string,
  signer: HandleSigner,
): Promise<ClaimResult> {
  const handle = normalizeHandle(rawHandle);
  if (!isValidHandle(handle)) {
    return { ok: false, reason: 'invalid', message: 'Handle must be 3–30 lowercase letters / digits / underscore.' };
  }

  let signatureBytes: Uint8Array;
  try {
    const msg = new TextEncoder().encode(`claim:${handle}`);
    signatureBytes = await signer.signMessage(msg);
  } catch (err) {
    return {
      ok: false,
      reason: 'unauthorized',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  let res: Response;
  try {
    res = await fetch('/api/handles/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        handle,
        pubkey: signer.publicKeyBase58,
        signature: bs58.encode(signatureBytes),
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'network',
      message: err instanceof Error ? err.message : 'Network error',
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.ok) {
    const r = body as ResolveResult;
    return {
      ok: true,
      handle: r.handle,
      pubkey: r.pubkey,
      ...(r.fallback ? { fallback: true } : {}),
      ...(r.alreadyClaimed ? { alreadyClaimed: true } : {}),
    };
  }

  const errBody = body as { error?: string; message?: string } | null;
  if (res.status === 409) {
    return { ok: false, reason: 'taken', message: errBody?.message ?? 'Handle already claimed' };
  }
  if (res.status === 401) {
    return { ok: false, reason: 'unauthorized', message: errBody?.message ?? 'Signature rejected by server' };
  }
  if (res.status === 503) {
    return { ok: false, reason: 'database', message: errBody?.message ?? 'Handles registry not yet provisioned' };
  }
  return { ok: false, reason: 'invalid', message: errBody?.message ?? `Failed (${res.status})` };
}
