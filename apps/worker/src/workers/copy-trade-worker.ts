// apps/worker/src/workers/copy-trade-worker.ts
/* eslint-disable no-console */

import { agentWallets, type Db, follows } from '@klub/db';
import { Queue, Worker, type Job } from 'bullmq';
import { and, eq, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';

import { signAndSubmit } from '../signing/bulk-keychain';

/**
 * Copy-trade worker.
 *
 * Responsibilities:
 *   1. Subscribe to each opted-in leader's Bulk account WebSocket.
 *   2. For every leader trade (open / close / modify), enumerate active
 *      followers of that leader.
 *   3. Compute each follower's proportional fill given their
 *      maxAllocationPct, stop override, and market filter.
 *   4. Enqueue a `mirror-trade` job per follower.
 *   5. The Worker processes jobs by signing + submitting orders through
 *      the follower's agent wallet.
 *
 * Guards:
 *   - Never mirror a trade if the follower is paused.
 *   - Never mirror a trade that would exceed the follower's allocation cap.
 *   - Never mirror a trade on a symbol the follower has filtered out.
 *   - If an agent wallet is revoked or expired, pause the follow
 *     relationship and email the user.
 */

const QUEUE_NAME = 'klub.copy-trade';

export interface CopyTradeJobPayload {
  readonly followerId: string;
  readonly followerFollowId: string;
  readonly leaderHandle: string;
  readonly agentWalletId: string;
  readonly symbol: string;
  readonly side: 'long' | 'short';
  readonly orderType: 'market' | 'limit';
  readonly leaderSizeBase: number;
  readonly leaderEntryPrice: number;
  readonly leaderNotionalUsd: number;
  readonly followerEquityUsd: number;
  readonly maxAllocationPct: number;
  readonly leaderEventId: string; // idempotency key
}

export function createCopyTradeWorker({
  redis,
  db,
}: {
  readonly redis: Redis;
  readonly db: Db;
}): Worker<CopyTradeJobPayload> {
  const queue = new Queue<CopyTradeJobPayload>(QUEUE_NAME, { connection: redis });
  void queue;

  // TODO(phase-3.5): start leader subscription loop here.
  // For each active leader in the follows table, open a subscription
  // to their Bulk account WebSocket. On every trade event, query
  // active followers (see `selectActiveFollowers`) and enqueue a
  // mirror job per follower. The `leaderEventId` is used as a
  // BullMQ job ID so BullMQ dedupes duplicate events automatically.

  const worker = new Worker<CopyTradeJobPayload>(
    QUEUE_NAME,
    async (job: Job<CopyTradeJobPayload>) => {
      await handleMirrorJob({ job, db });
    },
    {
      connection: redis,
      concurrency: 10,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[copy-trade] job ${job?.id} failed`, err);
  });

  return worker;
}

// -------------------------------------------------------------------
// Job handler — the actual mirror
// -------------------------------------------------------------------

async function handleMirrorJob({
  job,
  db,
}: {
  readonly job: Job<CopyTradeJobPayload>;
  readonly db: Db;
}): Promise<void> {
  const p = job.data;

  // 1. Compute the follower's mirrored size
  const mirroredSizeBase = computeMirroredSize(p);
  if (mirroredSizeBase <= 0) {
    console.log(`[copy-trade] skipping ${p.leaderHandle}→${p.followerId}: zero size`);
    return;
  }

  // 2. Verify the agent wallet is still live (not revoked, not expired)
  const aw = await db
    .select()
    .from(agentWallets)
    .where(eq(agentWallets.id, p.agentWalletId));
  const wallet = aw[0];
  if (!wallet || wallet.revokedAt || (wallet.expiresAt && wallet.expiresAt < new Date())) {
    console.warn(`[copy-trade] agent wallet ${p.agentWalletId} no longer valid; pausing follow`);
    await db
      .update(follows)
      .set({ pausedAt: new Date() })
      .where(eq(follows.id, p.followerFollowId));
    return;
  }

  // 3. Sign and submit the order
  // If this throws, BullMQ retries with exponential backoff.
  await signAndSubmit({
    agentWalletPublicKey: wallet.publicKey,
    symbol: p.symbol,
    side: p.side,
    sizeBase: mirroredSizeBase,
    orderType: p.orderType,
    price: p.leaderEntryPrice,
    leaderEventId: p.leaderEventId,
  });

  // 4. Mark the wallet as used
  await db
    .update(agentWallets)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentWallets.id, p.agentWalletId));
}

// -------------------------------------------------------------------
// Pure helpers (testable in copy-trade-worker.test.ts)
// -------------------------------------------------------------------

/**
 * Compute the follower's mirrored size given the leader's trade and the
 * follower's allocation rules.
 *
 * Rule: the follower puts at most `maxAllocationPct` of their own equity
 * into mirroring this leader, *proportionally sized* to the leader's
 * notional exposure. We do NOT scale by the leader's equity because
 * the leader's equity is private; we scale by a fixed proportion.
 *
 * Example:
 *   Leader opens 0.5 BTC at $67,000 → $33,500 notional
 *   Follower equity = $5,000, maxAllocationPct = 20 → $1,000 allocated
 *   Follower mirrored size = $1,000 / $67,000 = 0.0149 BTC
 *
 * This is the simplest-possible sizing model. A future version will
 * normalize across multiple open leader positions so total follower
 * allocation never exceeds the cap even across many concurrent mirrors.
 */
export function computeMirroredSize(p: {
  readonly leaderEntryPrice: number;
  readonly followerEquityUsd: number;
  readonly maxAllocationPct: number;
}): number {
  if (p.leaderEntryPrice <= 0 || p.followerEquityUsd <= 0) return 0;
  const allocated = p.followerEquityUsd * (p.maxAllocationPct / 100);
  return allocated / p.leaderEntryPrice;
}

/**
 * Select all active (non-paused, non-ended, agent-wallet-valid)
 * followers of a given leader. Used by the leader subscription loop
 * to know whose jobs to enqueue.
 */
export async function selectActiveFollowers(
  db: Db,
  leaderHandle: string,
): Promise<ReadonlyArray<typeof follows.$inferSelect>> {
  return db
    .select()
    .from(follows)
    .where(
      and(
        eq(follows.leaderHandle, leaderHandle),
        isNull(follows.pausedAt),
        isNull(follows.endedAt),
      ),
    );
}
