import { base58Decode, verifyEd25519 } from '@klub/signing';
import { copyFollows, createDbClient } from '@klub/db';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,128}$/;

const FollowBody = z.object({
  followerPubkey: z.string().regex(PUBKEY_RE),
  leaderPubkey: z.string().regex(PUBKEY_RE),
  signature: z.string().min(64).max(128),
  label: z.string().min(1).max(64).optional(),
  allocationPct: z.number().int().min(1).max(100).optional(),
});

function getDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

function followMessage(input: {
  readonly action: 'follow' | 'unfollow';
  readonly followerPubkey: string;
  readonly leaderPubkey: string;
  readonly allocationPct?: number;
  readonly label?: string;
}): string {
  return `klub:copy-follow:${JSON.stringify(input)}`;
}

async function verify(input: {
  readonly message: string;
  readonly pubkey: string;
  readonly signature: string;
}): Promise<boolean> {
  try {
    return await verifyEd25519({
      payload: new TextEncoder().encode(input.message),
      publicKey: base58Decode(input.pubkey),
      signature: base58Decode(input.signature),
    });
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const followerPubkey = url.searchParams.get('followerPubkey') ?? '';
  if (!PUBKEY_RE.test(followerPubkey)) {
    return NextResponse.json({ error: 'invalid_pubkey' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: 'database_unavailable', follows: [] },
      { status: 503 },
    );
  }

  try {
    const rows = await db
      .select()
      .from(copyFollows)
      .where(eq(copyFollows.followerPubkey, followerPubkey));
    return NextResponse.json(
      {
        follows: rows.map((row) => ({
          leaderPubkey: row.leaderPubkey,
          ...(row.label ? { label: row.label } : {}),
          allocationPct: row.allocationPct,
          createdAt: row.createdAt.getTime(),
          baselineSymbols: [],
          mirroredSymbols: [],
        })),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[copy-follows/get] failed', err);
    return NextResponse.json({ error: 'internal', follows: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const parsed = await parseBody(request);
  if (!parsed.ok) return parsed.response;
  const { followerPubkey, leaderPubkey, signature, label, allocationPct = 20 } = parsed.data;
  const message = followMessage({
    action: 'follow',
    followerPubkey,
    leaderPubkey,
    allocationPct,
    ...(label ? { label } : {}),
  });
  if (!(await verify({ message, pubkey: followerPubkey, signature }))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'database_unavailable' }, { status: 503 });
  }

  try {
    const now = new Date();
    const [row] = await db
      .insert(copyFollows)
      .values({
        followerPubkey,
        leaderPubkey,
        label,
        allocationPct,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [copyFollows.followerPubkey, copyFollows.leaderPubkey],
        set: { label, allocationPct, updatedAt: now },
      })
      .returning();

    return NextResponse.json({ ok: true, follow: row }, { status: 200 });
  } catch (err) {
    console.error('[copy-follows/post] failed', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const parsed = await parseBody(request);
  if (!parsed.ok) return parsed.response;
  const { followerPubkey, leaderPubkey, signature } = parsed.data;
  const message = followMessage({ action: 'unfollow', followerPubkey, leaderPubkey });
  if (!(await verify({ message, pubkey: followerPubkey, signature }))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ error: 'database_unavailable' }, { status: 503 });
  }

  try {
    await db
      .delete(copyFollows)
      .where(
        and(
          eq(copyFollows.followerPubkey, followerPubkey),
          eq(copyFollows.leaderPubkey, leaderPubkey),
        ),
      );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[copy-follows/delete] failed', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

async function parseBody(
  request: Request,
): Promise<
  | { readonly ok: true; readonly data: z.infer<typeof FollowBody> }
  | { readonly ok: false; readonly response: NextResponse }
> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) };
  }
  const parsed = FollowBody.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'invalid_payload', issues: parsed.error.issues },
        { status: 422 },
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
