import { createDbClient, leaders } from "@klub/db";
import { and, desc, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { leaderLabel } from "@/lib/copy-trade/leaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const window = rankingWindow(new URL(request.url).searchParams.get("window"));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json({ leaders: [], source: "unavailable" });
  }

  try {
    const db = createDbClient({ connectionString, maxConnections: 2 });
    const rankingColumn =
      window === "24h"
        ? leaders.netPnl24hUsd
        : window === "7d"
          ? leaders.netPnl7dUsd
          : leaders.netPnl30dUsd;
    const activityColumn =
      window === "24h"
        ? leaders.fillsLast24h
        : window === "7d"
          ? leaders.fillsLast7d
          : leaders.fillsLast30d;
    const rows = await db
      .select()
      .from(leaders)
      .where(and(gt(rankingColumn, 0), gt(activityColumn, 0)))
      .orderBy(desc(rankingColumn))
      .limit(20);
    return NextResponse.json(
      {
        leaders: rows.map((row) => ({
          pubkey: row.pubkey,
          label: leaderLabel(row.handle, row.pubkey),
          netPnl24hUsd: row.netPnl24hUsd,
          netPnl7dUsd: row.netPnl7dUsd,
          netPnl30dUsd: row.netPnl30dUsd,
          unrealizedPnlUsd: row.unrealizedPnlUsd,
          winRate: row.winRate,
          closedTradesCount: row.closedTradesCount,
          maxDrawdownPct: row.maxDrawdownPct,
          sharpeRatio: row.sharpeRatio,
          fillsLast24h: row.fillsLast24h,
          fillsLast7d: row.fillsLast7d,
          fillsLast30d: row.fillsLast30d,
          updatedAt: row.updatedAt.toISOString(),
        })),
        source: "bulk-observed-accounts",
        rankingWindow: window,
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

function rankingWindow(value: string | null): "24h" | "7d" | "30d" {
  return value === "7d" || value === "30d" ? value : "24h";
}
