import { createDbClient, handles } from '@klub/db';
import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,128}$/;

function getDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

export async function GET(
  _request: Request,
  ctx: { params: { pubkey: string } },
) {
  const pubkey = ctx.params.pubkey ?? '';
  if (!PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: 'invalid_pubkey' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: 'database_unavailable', message: 'Handle database is not configured' },
      { status: 503 },
    );
  }

  try {
    const [row] = await db
      .select({ handle: handles.handle, pubkey: handles.pubkey })
      .from(handles)
      .where(and(eq(handles.pubkey, pubkey), isNull(handles.revokedAt)))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(row, { status: 200 });
  } catch (err) {
    console.error('[handles/by-pubkey] failed', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
