/* eslint-disable no-console */

import { createDbClient } from "@klub/db";

import { startLeaderDiscovery } from "./workers/leader-discovery.js";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing required env: DATABASE_URL");
  const durationMs = Number(process.env.LEADER_SEED_DURATION_MS ?? "75000");
  const db = createDbClient({ connectionString, maxConnections: 3 });
  const discovery = await startLeaderDiscovery({
    db,
    intervalMs: Math.max(30_000, durationMs - 15_000),
    maxCandidatesPerRun: 20,
  });
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  console.log(
    JSON.stringify({ observedCandidates: discovery.candidateCount() }),
  );
  discovery.close();
}

void main().catch((error) => {
  console.error("[leader-seed] failed", error);
  process.exitCode = 1;
});
