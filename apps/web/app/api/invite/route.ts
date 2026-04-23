// apps/web/app/api/invite/route.ts
import { createDbClient, inviteRedemptions, invites, users, waitlist } from '@klub/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * GET  /api/invite?code=XYZ  — validate a code
 * POST /api/invite           — redeem a code for an account
 *
 * Phase 3.5: backed by Postgres via @klub/db. Codes live in the
 * `invites` table with `max_redemptions` (null = infinite, e.g.
 * the public `demo` code) and a `redemption_count` counter that
 * we increment atomically on POST.
 *
 * Fallback: when DATABASE_URL is missing (preview deployments,
 * local Vercel without docker compose), we fall back to the
 * legacy in-memory allowlist so the invite flow keeps demo-able.
 */

// In-memory fallback only used when DATABASE_URL is missing.
const FALLBACK_CODES = new Map<string, { readonly remaining: number; readonly label: string }>([
  ['demo', { remaining: Number.POSITIVE_INFINITY, label: 'Public demo' }],
  ['klub-0001', { remaining: 1, label: 'Founder 01' }],
  ['klub-0002', { remaining: 1, label: 'Founder 02' }],
  ['klub-0003', { remaining: 1, label: 'Founder 03' }],
  ['klub-0004', { remaining: 1, label: 'Founder 04' }],
  ['klub-0005', { remaining: 1, label: 'Founder 05' }],
]);

function getDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

// ---------------------------------------------------------------------------
// GET — validate
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get('code') ?? '').trim().toLowerCase();
  if (!code) {
    return NextResponse.json({ valid: false, reason: 'missing_code' });
  }

  const db = getDb();
  if (!db) {
    // Fallback path for preview builds without a DB
    const entry = FALLBACK_CODES.get(code);
    if (!entry) return NextResponse.json({ valid: false, reason: 'not_found' });
    if (entry.remaining <= 0) return NextResponse.json({ valid: false, reason: 'exhausted' });
    return NextResponse.json({
      valid: true,
      label: entry.label,
      remaining: entry.remaining === Number.POSITIVE_INFINITY ? null : entry.remaining,
    });
  }

  const [row] = await db.select().from(invites).where(eq(invites.code, code)).limit(1);
  if (!row) return NextResponse.json({ valid: false, reason: 'not_found' });
  if (row.disabledAt !== null) {
    return NextResponse.json({ valid: false, reason: 'disabled' });
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ valid: false, reason: 'expired' });
  }
  const remaining =
    row.maxRedemptions === null ? null : row.maxRedemptions - row.redemptionCount;
  if (remaining !== null && remaining <= 0) {
    return NextResponse.json({ valid: false, reason: 'exhausted' });
  }
  return NextResponse.json({ valid: true, label: row.label, remaining });
}

// ---------------------------------------------------------------------------
// POST — redeem
// ---------------------------------------------------------------------------

const RedeemBody = z.object({
  code: z.string().min(3).max(64),
  email: z.string().email().max(254),
  handle: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/, 'lowercase letters, numbers, underscore')
    .optional(),
});

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = RedeemBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const code = parsed.data.code.trim().toLowerCase();
  const email = parsed.data.email.trim().toLowerCase();
  const handle = parsed.data.handle?.trim().toLowerCase();

  const db = getDb();
  if (!db) {
    // Fallback: decrement in-memory and log
    const entry = FALLBACK_CODES.get(code);
    if (!entry || entry.remaining <= 0) {
      return NextResponse.json(
        { error: 'invalid_code', reason: !entry ? 'not_found' : 'exhausted' },
        { status: 410 },
      );
    }
    if (entry.remaining !== Number.POSITIVE_INFINITY) {
      FALLBACK_CODES.set(code, { ...entry, remaining: entry.remaining - 1 });
    }
    console.info('[invite] redeemed (fallback, no DB)', { code, email, handle });
    return NextResponse.json({ ok: true, label: entry.label });
  }

  // DB path — transactional: check code is live, insert user if new,
  // insert redemption, increment invite counter, mark waitlist entry
  // as promoted if one exists for this email.
  try {
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = request.headers.get('user-agent') ?? null;

    const result = await db.transaction(async (tx) => {
      const [invite] = await tx.select().from(invites).where(eq(invites.code, code)).limit(1);
      if (!invite) return { ok: false as const, reason: 'not_found' as const };
      if (invite.disabledAt !== null) return { ok: false as const, reason: 'disabled' as const };
      if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
        return { ok: false as const, reason: 'expired' as const };
      }
      if (
        invite.maxRedemptions !== null &&
        invite.redemptionCount >= invite.maxRedemptions
      ) {
        return { ok: false as const, reason: 'exhausted' as const };
      }

      // Upsert user by email. Handle is optional; if omitted, derive
      // a pseudonymous one from the email local-part (collision-safe
      // suffix appended by the unique constraint).
      const finalHandle = handle ?? deriveHandle(email);
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      const userId =
        existingUser?.id ??
        (
          await tx
            .insert(users)
            .values({ email, handle: finalHandle })
            .returning({ id: users.id })
        )[0]?.id;

      if (!userId) throw new Error('user insert failed');

      await tx.insert(inviteRedemptions).values({
        code: invite.code,
        userId,
        ipAddress,
        userAgent,
      });

      await tx
        .update(invites)
        .set({ redemptionCount: sql`${invites.redemptionCount} + 1` })
        .where(eq(invites.code, invite.code));

      // If the user was on the waitlist, mark their entry promoted
      await tx
        .update(waitlist)
        .set({ promotedUserId: userId })
        .where(and(eq(waitlist.email, email), isNull(waitlist.promotedUserId)));

      return { ok: true as const, label: invite.label };
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'invalid_code', reason: result.reason },
        { status: 410 },
      );
    }

    // Sync to Resend audience (fire and forget — the waitlist-resend
    // worker also sweeps, so dropping this is non-fatal).
    // TODO: publish a `resend.sync` job here once the email package lands.

    return NextResponse.json({ ok: true, label: result.label });
  } catch (err) {
    console.error('[invite] redemption failed', err);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

function deriveHandle(email: string): string {
  const base = email.split('@')[0] ?? 'klubber';
  const cleaned = base.replace(/[^a-z0-9_]/g, '').slice(0, 17);
  const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${cleaned || 'klubber'}_${suffix}`;
}
