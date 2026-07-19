import { createDbClient, handles } from "@klub/db";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getFallbackHandleByPubkey } from "@/lib/handle-registry-fallback";

export const runtime = "nodejs";

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,128}$/;

function getDb() {
  const url = process.env["DATABASE_URL"];
  if (!url) return null;
  return createDbClient({ connectionString: url, maxConnections: 3 });
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ pubkey: string }> },
) {
  const { pubkey = "" } = await ctx.params;
  if (!PUBKEY_RE.test(pubkey)) {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return fallbackResponse(pubkey);
  }

  try {
    const [row] = await db
      .select({ handle: handles.handle, pubkey: handles.pubkey })
      .from(handles)
      .where(and(eq(handles.pubkey, pubkey), isNull(handles.revokedAt)))
      .limit(1);

    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(row, { status: 200 });
  } catch (err) {
    console.error("[handles/by-pubkey] failed", err);
    return fallbackResponse(pubkey);
  }
}

function fallbackResponse(pubkey: string) {
  const row = getFallbackHandleByPubkey(pubkey);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(
    { handle: row.handle, pubkey: row.pubkey, fallback: true },
    { status: 200 },
  );
}
