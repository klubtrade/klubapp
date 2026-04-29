// apps/web/app/api/leaders/review/route.ts
import { base58Decode, verifyEd25519 } from '@klub/signing';
import { createDbClient, leaderApplications } from '@klub/db';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * POST /api/leaders/review
 *
 * Approve or reject a leader application. ADMIN-ONLY.
 *
 * Auth model (replaces the no-auth shim that was flagged in
 * MASTER-CONTEXT §10.2):
 *
 *   - Server-side `ADMIN_PUBKEYS` env (comma-separated base58) defines
 *     who is allowed to call this endpoint. If the env is empty or
 *     missing, the route is fail-closed — no requests are accepted.
 *   - Caller must include `x-admin-pubkey` header: their base58 pubkey,
 *     which must appear in the allowlist.
 *   - Caller must include `x-admin-signature` header: an Ed25519
 *     signature (base58) over the canonical message
 *     `${application_id}:${status}`. We verify the signature against
 *     the supplied pubkey before doing anything else.
 *
 * The signed message is intentionally minimal: it binds an admin to a
 * specific (application, decision) pair. Replay is acceptable here —
 * approving the same application twice is a no-op.
 */

const ReviewBody = z.object({
  application_id: z.string().uuid(),
  status: z.enum(['approved', 'rejected']),
});

function getDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

function adminAllowlist(): readonly string[] {
  const raw = process.env['ADMIN_PUBKEYS'] ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function POST(request: Request) {
  const adminPubkey = request.headers.get('x-admin-pubkey');
  const adminSignature = request.headers.get('x-admin-signature');
  const allowlist = adminAllowlist();

  if (allowlist.length === 0) {
    // Fail-closed: if the env isn't configured, no one is admin.
    return NextResponse.json(
      { error: 'admin_unconfigured' },
      { status: 503 },
    );
  }

  if (!adminPubkey || !adminSignature) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Missing x-admin-pubkey or x-admin-signature' },
      { status: 401 },
    );
  }

  if (!allowlist.includes(adminPubkey)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Pubkey not in admin allowlist' },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = ReviewBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  // Verify the signature is over the canonical message.
  const message = new TextEncoder().encode(
    `${parsed.data.application_id}:${parsed.data.status}`,
  );
  let pubkeyBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    pubkeyBytes = base58Decode(adminPubkey);
    signatureBytes = base58Decode(adminSignature);
  } catch {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Malformed admin pubkey or signature' },
      { status: 401 },
    );
  }
  const sigOk = await verifyEd25519({
    payload: message,
    signature: signatureBytes,
    publicKey: pubkeyBytes,
  });
  if (!sigOk) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Invalid signature' },
      { status: 401 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: 'database_unavailable' },
      { status: 500 },
    );
  }

  try {
    const [application] = await db
      .update(leaderApplications)
      .set({
        status: parsed.data.status,
        reviewedAt: new Date(),
      })
      .where(eq(leaderApplications.id, parsed.data.application_id))
      .returning();

    if (!application) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, application }, { status: 200 });
  } catch (err) {
    console.error('[leaders/review] update failed', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
