import { base58Decode, verifyEd25519 } from '@klub/signing';
import { createDbClient, userProfiles } from '@klub/db';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  cleanProfileUpdate,
  DEFAULT_PREFS,
  profileUpdateMessage,
  type ProfilePrefsUpdate,
} from '@/lib/profile-contract';

export const runtime = 'nodejs';

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

const ProfileUpdate = z.object({
  handle: z.string().min(3).max(30).regex(/^[a-z0-9_]+$/).nullable().optional(),
  riskProfile: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
  onboardingComplete: z.boolean().optional(),
  preferredTradeMode: z.enum(['simple', 'expert']).optional(),
  defaultCopyAllocPct: z.number().int().min(1).max(100).optional(),
  alertsEnabled: z.boolean().optional(),
});

const PatchBody = z.object({
  pubkey: z.string().regex(PUBKEY_RE),
  signature: z.string().min(64).max(128),
  update: ProfileUpdate,
});

function getDb() {
  const url = process.env['DATABASE_URL'];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

function serializeProfile(row: typeof userProfiles.$inferSelect | null, pubkey: string) {
  return {
    pubkey,
    handle: row?.handle ?? null,
    prefs: {
      ...DEFAULT_PREFS,
      onboardingComplete: row?.onboardingComplete ?? false,
      onboardingWallet: row?.onboardingComplete ? pubkey : null,
      riskProfile: row?.riskProfile ?? DEFAULT_PREFS.riskProfile,
      preferredTradeMode: row?.preferredTradeMode ?? DEFAULT_PREFS.preferredTradeMode,
      defaultCopyAllocPct: row?.defaultCopyAllocPct ?? DEFAULT_PREFS.defaultCopyAllocPct,
      alertsEnabled: row?.alertsEnabled ?? DEFAULT_PREFS.alertsEnabled,
    },
    persisted: Boolean(row),
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pubkey = url.searchParams.get('pubkey') ?? '';

  if (!PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: 'invalid_pubkey' }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ ...serializeProfile(null, pubkey), persisted: false }, { status: 200 });
  }

  try {
    const [row] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.pubkey, pubkey))
      .limit(1);

    return NextResponse.json(serializeProfile(row ?? null, pubkey), { status: 200 });
  } catch (err) {
    console.error('[profile/get] failed', err);
    return NextResponse.json(
      {
        ...serializeProfile(null, pubkey),
        persisted: false,
        degraded: true,
        message: 'Profile sync is temporarily unavailable.',
      },
      { status: 200 },
    );
  }
}

export async function PATCH(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { pubkey, signature } = parsed.data;
  const update = cleanProfileUpdate(parsed.data.update as ProfilePrefsUpdate);

  try {
    const sigOk = await verifyEd25519({
      payload: new TextEncoder().encode(profileUpdateMessage({ pubkey, update })),
      signature: base58Decode(signature),
      publicKey: base58Decode(pubkey),
    });
    if (!sigOk) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Invalid profile update signature' },
        { status: 401 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Malformed pubkey or signature' },
      { status: 401 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      serializeProfileFromUpdate(pubkey, update),
      { status: 200 },
    );
  }

  const now = new Date();
  const values = {
    pubkey,
    handle: update.handle,
    onboardingComplete: update.onboardingComplete,
    riskProfile: update.riskProfile,
    preferredTradeMode: update.preferredTradeMode,
    defaultCopyAllocPct: update.defaultCopyAllocPct,
    alertsEnabled: update.alertsEnabled,
    updatedAt: now,
  };
  const updatableValues = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );

  try {
    const [row] = await db
      .insert(userProfiles)
      .values({ pubkey, ...updatableValues })
      .onConflictDoUpdate({
        target: userProfiles.pubkey,
        set: updatableValues,
      })
      .returning();

    return NextResponse.json(serializeProfile(row ?? null, pubkey), { status: 200 });
  } catch (err) {
    console.error('[profile/patch] failed', err);
    return NextResponse.json(
      {
        ...serializeProfileFromUpdate(pubkey, update),
        degraded: true,
        message: 'Profile sync is temporarily unavailable. Local preferences remain active.',
      },
      { status: 200 },
    );
  }
}

function serializeProfileFromUpdate(pubkey: string, update: ProfilePrefsUpdate) {
  return {
    pubkey,
    handle: update.handle ?? null,
    prefs: {
      ...DEFAULT_PREFS,
      ...update,
      onboardingWallet: update.onboardingComplete ? pubkey : null,
    },
    persisted: false,
    updatedAt: null,
  };
}
