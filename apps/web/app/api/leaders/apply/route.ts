// apps/web/app/api/leaders/apply/route.ts
import { createDbClient, leaderApplications } from "@klub/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  requireLinkedSolanaWallet,
  requirePrivyAuth,
} from "@/lib/server/privy-auth";

const ApplyBody = z.object({
  user_pubkey: z.string().min(1).max(128),
  handle: z.string().min(1).max(20),
});

function getDb() {
  const url = process.env["DATABASE_URL"];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

export async function POST(request: Request) {
  const auth = await requirePrivyAuth(request);
  if (!auth.ok) return auth.response;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ApplyBody.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const ownershipError = requireLinkedSolanaWallet(
    auth.principal,
    parsed.data.user_pubkey,
  );
  if (ownershipError) return ownershipError;

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      { error: "database_unavailable" },
      { status: 500 },
    );
  }

  try {
    const [application] = await db
      .insert(leaderApplications)
      .values({
        userPubkey: parsed.data.user_pubkey,
        handle: parsed.data.handle,
        status: "pending",
      })
      .returning();

    return NextResponse.json({ ok: true, application }, { status: 201 });
  } catch (err) {
    console.error("[leaders/apply] insert failed", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
