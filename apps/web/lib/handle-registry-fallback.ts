export interface FallbackHandleRecord {
  readonly handle: string;
  readonly pubkey: string;
  readonly claimedAt: string;
}

interface FallbackHandleStore {
  byHandle: Map<string, FallbackHandleRecord>;
  byPubkey: Map<string, FallbackHandleRecord>;
}

declare global {
  // eslint-disable-next-line no-var
  var __klubHandleFallbackStore: FallbackHandleStore | undefined;
}

function store(): FallbackHandleStore {
  const existing = globalThis.__klubHandleFallbackStore;
  if (existing) return existing;
  const created: FallbackHandleStore = { byHandle: new Map(), byPubkey: new Map() };
  globalThis.__klubHandleFallbackStore = created;
  return created;
}

export function getFallbackHandle(handle: string): FallbackHandleRecord | null {
  return store().byHandle.get(handle) ?? null;
}

export function getFallbackHandleByPubkey(pubkey: string): FallbackHandleRecord | null {
  return store().byPubkey.get(pubkey) ?? null;
}

export type FallbackClaimResult =
  | { readonly ok: true; readonly record: FallbackHandleRecord; readonly created: boolean }
  | { readonly ok: false; readonly reason: 'taken'; readonly record: FallbackHandleRecord };

/**
 * Non-durable emergency registry used only when the production database or
 * handles table is unavailable. Signature verification still happens before
 * this function is called, so it cannot be used to claim a handle for a pubkey
 * the caller does not control.
 */
export function claimFallbackHandle(handle: string, pubkey: string): FallbackClaimResult {
  const fallback = store();
  const existingForPubkey = fallback.byPubkey.get(pubkey);
  if (existingForPubkey) {
    return { ok: true, record: existingForPubkey, created: false };
  }

  const existing = fallback.byHandle.get(handle);
  if (existing) {
    if (existing.pubkey === pubkey) {
      return { ok: true, record: existing, created: false };
    }
    return { ok: false, reason: 'taken', record: existing };
  }

  const record: FallbackHandleRecord = {
    handle,
    pubkey,
    claimedAt: new Date().toISOString(),
  };
  fallback.byHandle.set(handle, record);
  fallback.byPubkey.set(pubkey, record);
  return { ok: true, record, created: true };
}

export function shouldUseHandleRegistryFallback(error: unknown): boolean {
  if (!error) return false;

  const withCode = error as { code?: unknown; cause?: unknown; message?: unknown };
  if (withCode.code === '42P01') return true;

  const message = String(withCode.message ?? '').toLowerCase();
  if (!message) {
    return shouldUseHandleRegistryFallback(withCode.cause);
  }

  return (
    message.includes('database') ||
    message.includes('relation "handles" does not exist') ||
    message.includes('relation handles does not exist') ||
    message.includes('connect') ||
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('timeout')
  );
}

export function resetFallbackHandlesForTests(): void {
  store().byHandle.clear();
  store().byPubkey.clear();
}
