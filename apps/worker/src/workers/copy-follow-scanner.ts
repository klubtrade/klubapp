/* eslint-disable no-console */

import {
  copyFollows,
  copyFollowSnapshots,
  type Db,
  workerHeartbeats,
} from "@klub/db";

const DEFAULT_INTERVAL_MS = 30_000;
const WORKER_NAME = "copy-follow-scanner";

export interface CopyFollowScannerSummary {
  readonly activeFollows: number;
  readonly uniqueFollowers: number;
  readonly uniqueLeaders: number;
  readonly indexedAt: string;
}

export interface RunningCopyFollowScanner {
  readonly intervalMs: number;
  readonly runOnce: () => Promise<CopyFollowScannerSummary>;
  readonly close: () => void;
}

type CopyFollowRow = typeof copyFollows.$inferSelect;

export function summarizeCopyFollowRows(
  rows: readonly Pick<CopyFollowRow, "followerPubkey" | "leaderPubkey">[],
  now: Date = new Date(),
): CopyFollowScannerSummary {
  return {
    activeFollows: rows.length,
    uniqueFollowers: new Set(rows.map((row) => row.followerPubkey)).size,
    uniqueLeaders: new Set(rows.map((row) => row.leaderPubkey)).size,
    indexedAt: now.toISOString(),
  };
}

export async function runCopyFollowScannerOnce({
  db,
  instanceId,
  now = new Date(),
}: {
  readonly db: Db;
  readonly instanceId: string;
  readonly now?: Date;
}): Promise<CopyFollowScannerSummary> {
  const rows = await db.select().from(copyFollows);
  const summary = summarizeCopyFollowRows(rows, now);

  await db.transaction(async (tx) => {
    await tx.delete(copyFollowSnapshots);

    if (rows.length > 0) {
      await tx.insert(copyFollowSnapshots).values(
        rows.map((row) => ({
          sourceFollowId: row.id,
          followerPubkey: row.followerPubkey,
          leaderPubkey: row.leaderPubkey,
          label: row.label,
          allocationPct: row.allocationPct,
          status: "active" as const,
          firstSeenAt: row.createdAt,
          lastSeenAt: now,
        })),
      );
    }
  });

  await writeWorkerHeartbeat({
    db,
    workerName: WORKER_NAME,
    instanceId,
    status: "ok",
    activeCopyFollows: summary.activeFollows,
    lastError: null,
    now,
  });

  return summary;
}

export function startCopyFollowScanner({
  db,
  instanceId,
  intervalMs = DEFAULT_INTERVAL_MS,
  logger = console,
}: {
  readonly db: Db;
  readonly instanceId: string;
  readonly intervalMs?: number;
  readonly logger?: Pick<Console, "error" | "log" | "warn">;
}): RunningCopyFollowScanner {
  let running = false;

  const runOnce = async (): Promise<CopyFollowScannerSummary> => {
    if (running) {
      logger.warn("[copy-follow-scanner] previous run still active; skipping");
      return summarizeCopyFollowRows([], new Date());
    }

    running = true;
    try {
      const summary = await runCopyFollowScannerOnce({ db, instanceId });
      logger.log(
        `[copy-follow-scanner] indexed ${summary.activeFollows} follows · ${summary.uniqueLeaders} leaders · ${summary.uniqueFollowers} followers`,
      );
      return summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[copy-follow-scanner] run failed", err);
      await writeWorkerHeartbeat({
        db,
        workerName: WORKER_NAME,
        instanceId,
        status: "error",
        activeCopyFollows: 0,
        lastError: message,
        now: new Date(),
      });
      throw err;
    } finally {
      running = false;
    }
  };

  void runOnce().catch(() => {
    // Error already persisted/logged inside runOnce.
  });

  const timer = setInterval(() => {
    void runOnce().catch(() => {
      // Error already persisted/logged inside runOnce.
    });
  }, intervalMs);

  return {
    intervalMs,
    runOnce,
    close: () => {
      clearInterval(timer);
    },
  };
}

async function writeWorkerHeartbeat({
  db,
  workerName,
  instanceId,
  status,
  activeCopyFollows,
  lastError,
  now,
}: {
  readonly db: Db;
  readonly workerName: string;
  readonly instanceId: string;
  readonly status: "starting" | "ok" | "degraded" | "error";
  readonly activeCopyFollows: number;
  readonly lastError: string | null;
  readonly now: Date;
}): Promise<void> {
  await db
    .insert(workerHeartbeats)
    .values({
      workerName,
      instanceId,
      status,
      activeCopyFollows,
      lastError,
      startedAt: now,
      heartbeatAt: now,
    })
    .onConflictDoUpdate({
      target: workerHeartbeats.workerName,
      set: {
        instanceId,
        status,
        activeCopyFollows,
        lastError,
        heartbeatAt: now,
      },
    });
}
