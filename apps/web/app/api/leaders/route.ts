import { createDbClient, leaders } from "@klub/db";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import { leaderLabel } from "@/lib/copy-trade/leaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json({ leaders: [], source: "unavailable" });
  }

  try {
    const db = createDbClient({ connectionString, maxConnections: 2 });
    const rows = await db
      .select()
      .from(leaders)
      .orderBy(desc(leaders.netPnl30dUsd))
      .limit(20);
    return NextResponse.json(
      {
        leaders: rows.map((row) => ({
          pubkey: row.pubkey,
          label: leaderLabel(row.handle, row.pubkey),
          netPnl30dUsd: row.netPnl30dUsd,
          unrealizedPnlUsd: row.unrealizedPnlUsd,
          winRate: row.winRate,
          closedTradesCount: row.closedTradesCount,
          maxDrawdownPct: row.maxDrawdownPct,
          sharpeRatio: row.sharpeRatio,
          fillsLast30d: row.fillsLast30d,
          updatedAt: row.updatedAt.toISOString(),
        })),
        source: "bulk-observed-accounts",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[leaders] query failed", error);
    return NextResponse.json(
      { leaders: [], source: "degraded" },
      { status: 200 },
    );
  }
}
