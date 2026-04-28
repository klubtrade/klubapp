// apps/web/app/api/leaders/review/route.ts
import { createDbClient, leaderApplications } from '@klub/db';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const ReviewBody = z.object({
  application_id: z.string().uuid(),
  status: z.enum(['approved', 'rejected']),
});

function getDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

export async function POST(request: Request) {
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
