import { copyFollowSnapshots, createDbClient, workerHeartbeats } from "@klub/db";
import { desc, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env["DATABASE_URL"];

  if (!databaseUrl) {
    return NextResponse.json(
      {
        ok: true,
        service: "klub-web",
        database: { configured: false },
        worker: { configured: false },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const db = createDbClient({
      connectionString: databaseUrl,
      maxConnections: 1,
      idleTimeoutSeconds: 5,
    });
    const [heartbeatRows, snapshotCountRows] = await Promise.all([
      db
        .select()
        .from(workerHeartbeats)
        .orderBy(desc(workerHeartbeats.heartbeatAt))
        .limit(5),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(copyFollowSnapshots),
    ]);

    const latestHeartbeat = heartbeatRows[0] ?? null;
    const latestHeartbeatMs = latestHeartbeat?.heartbeatAt.getTime() ?? 0;
    const workerStale =
      latestHeartbeatMs > 0 ? Date.now() - latestHeartbeatMs > 90_000 : true;

    return NextResponse.json(
      {
        ok: !workerStale || latestHeartbeat === null,
        service: "klub-web",
        database: {
          configured: true,
          ok: true,
        },
        worker: {
          configured: latestHeartbeat !== null,
          stale: latestHeartbeat === null ? null : workerStale,
          latest: latestHeartbeat,
          recent: heartbeatRows,
        },
        copyFollows: {
          activeSnapshots: snapshotCountRows[0]?.count ?? 0,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database check failed";
    const workerSchemaMissing =
      message.includes("worker_heartbeats") ||
      message.includes("copy_follow_snapshots");

    if (workerSchemaMissing) {
      return NextResponse.json(
        {
          ok: true,
          service: "klub-web",
          database: {
            configured: true,
            ok: true,
          },
          worker: {
            configured: false,
            schemaReady: false,
            error: "Worker tables are not migrated yet. Run @klub/db migrate.",
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: false,
        service: "klub-web",
        database: {
          configured: true,
          ok: false,
          error: message,
        },
        worker: { configured: null },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
