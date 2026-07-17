// apps/web/app/api/handles/[handle]/route.ts
import { createDbClient, handles } from '@klub/db';
import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import {
  getFallbackHandle,
  shouldUseHandleRegistryFallback,
} from '@/lib/handle-registry-fallback';

/**
 * GET /api/handles/:handle
 *
 * Resolve a handle to its owning pubkey. Used by:
 *   - The Send modal in /cash, when the user types `@handle`.
 *   - The pay-by-link landing (`/cash?to=@handle&amount=...`).
 *   - Any future profile route (`/u/[handle]`).
 *
 * Lowercases the input before lookup. Returns 404 if the handle isn't
 * claimed or has been revoked. No auth required — handle → pubkey is
 * public mapping.
 */

export const runtime = 'nodejs';

function getDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

function fallbackResponse(handle: string) {
  const row = getFallbackHandle(handle);
  if (!row) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json(
    { handle: row.handle, pubkey: row.pubkey, fallback: true },
    { status: 200 },
  );
}

export async function GET(
  _request: Request,
  ctx: { params: { handle: string } },
) {
  const raw = ctx.params.handle ?? '';
  const handle = raw.toLowerCase().replace(/^@/, '');

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json({ error: 'invalid_handle' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return fallbackResponse(handle);
  }

  try {
    const [row] = await db
      .select({ handle: handles.handle, pubkey: handles.pubkey })
      .from(handles)
      .where(and(eq(handles.handle, handle), isNull(handles.revokedAt)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ handle: row.handle, pubkey: row.pubkey }, { status: 200 });
  } catch (err) {
    console.error('[handles/get] failed', err);
    if (shouldUseHandleRegistryFallback(err)) {
      return fallbackResponse(handle);
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
