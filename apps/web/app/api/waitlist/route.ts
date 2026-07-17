// apps/web/app/api/waitlist/route.ts
import { createDbClient, waitlist } from '@klub/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const WaitlistSchema = z.object({
  email: z.string().email().max(254),
  source: z.string().max(64).optional(),
  referrer: z.string().max(256).optional(),
});

/**
 * POST /api/waitlist — capture a waitlist signup.
 *
 * Captures signups durably in Railway Postgres when DATABASE_URL is
 * configured. Resend audience sync remains optional.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400 },
    );
  }

  const parsed = WaitlistSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_payload', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    await persist(parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error('[waitlist] persist failed', err);
    return NextResponse.json(
      { ok: false, error: 'server_error' },
      { status: 500 },
    );
  }
}

async function persist(entry: z.infer<typeof WaitlistSchema>): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.info('[waitlist:no-db]', JSON.stringify(entry));
    return;
  }
  const db = createDbClient({ connectionString: url, maxConnections: 3 });
  const email = entry.email.trim().toLowerCase();
  const source = (entry.source ?? entry.referrer ?? 'landing').slice(0, 32);
  await db
    .insert(waitlist)
    .values({ email, source })
    .onConflictDoUpdate({
      target: waitlist.email,
      set: { source },
    });
}
