// apps/web/app/api/handles/claim/route.ts
import { base58Decode, verifyEd25519 } from '@klub/signing';
import { createDbClient, handles } from '@klub/db';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  claimFallbackHandle,
  shouldUseHandleRegistryFallback,
} from '@/lib/handle-registry-fallback';

/**
 * POST /api/handles/claim
 *
 * Claim a handle for a pubkey. Body:
 *   { handle: string, pubkey: string (base58), signature: string (base58) }
 *
 * Auth: signature must be a valid Ed25519 signature over the canonical
 * message `claim:${handle}` produced by the supplied pubkey. This proves
 * the caller controls the pubkey they're claiming the handle for —
 * without it, anyone could claim a handle for any address.
 *
 * Idempotency: if the pubkey already owns the handle, return 200 (no
 * change). If the handle is owned by someone else, return 409.
 */

export const runtime = 'nodejs';

const ClaimBody = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/),
  pubkey: z.string().min(32).max(64),
  signature: z.string().min(64).max(128),
});

function getDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

function claimWithFallback(handle: string, pubkey: string) {
  const result = claimFallbackHandle(handle, pubkey);
  if (!result.ok) {
    return NextResponse.json(
      { error: 'handle_taken', message: 'Handle already claimed' },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      handle: result.record.handle,
      pubkey: result.record.pubkey,
      claimed: true,
      fallback: true,
    },
    { status: result.created ? 201 : 200 },
  );
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = ClaimBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { handle, pubkey, signature } = parsed.data;

  // Verify signature over `claim:${handle}` with the supplied pubkey.
  let pubkeyBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    pubkeyBytes = base58Decode(pubkey);
    signatureBytes = base58Decode(signature);
  } catch {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Malformed pubkey or signature' },
      { status: 401 },
    );
  }
  const message = new TextEncoder().encode(`claim:${handle}`);
  const sigOk = await verifyEd25519({
    payload: message,
    signature: signatureBytes,
    publicKey: pubkeyBytes,
  });
  if (!sigOk) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid signature for handle claim' },
      { status: 401 },
    );
  }

  const db = getDb();
  if (!db) {
    return claimWithFallback(handle, pubkey);
  }

  try {
    const [existing] = await db
      .select()
      .from(handles)
      .where(eq(handles.handle, handle))
      .limit(1);

    if (existing) {
      // Idempotent re-claim by the same pubkey.
      if (existing.pubkey === pubkey && !existing.revokedAt) {
        return NextResponse.json({ handle, pubkey, claimed: true }, { status: 200 });
      }
      return NextResponse.json(
        { error: 'handle_taken', message: 'Handle already claimed' },
        { status: 409 },
      );
    }

    const [inserted] = await db
      .insert(handles)
      .values({ handle, pubkey })
      .returning();

    if (!inserted) {
      return NextResponse.json({ error: 'internal' }, { status: 500 });
    }

    return NextResponse.json(
      { handle: inserted.handle, pubkey: inserted.pubkey, claimed: true },
      { status: 201 },
    );
  } catch (err) {
    console.error('[handles/claim] insert failed', err);
    if (shouldUseHandleRegistryFallback(err)) {
      return claimWithFallback(handle, pubkey);
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
