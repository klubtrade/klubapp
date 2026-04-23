// apps/web/app/api/waitlist/route.ts
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
 * Phase 1: validates and logs. Wire Resend + Postgres in Phase 2 by
 * swapping the body of `persist()` below.
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
  // TODO(phase-2): replace with Resend + Postgres insert.
  //   const { RESEND_API_KEY, WAITLIST_AUDIENCE_ID } = process.env;
  //   await fetch('https://api.resend.com/audiences/.../contacts', ...)
  //   await db.insert(waitlist).values({ email, source, referrer, ts: new Date() })
  console.info('[waitlist]', JSON.stringify(entry));
}
