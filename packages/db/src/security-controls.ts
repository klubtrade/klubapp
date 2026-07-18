import { createHash, createHmac } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import type { Db } from "./index.js";
import {
  apiRateLimits,
  idempotencyRecords,
  securityAuditEvents,
  securityAuditHeads,
} from "./schema.js";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly count: number;
  readonly limit: number;
  readonly retryAfterSeconds: number;
}

/** HMACs identifiers so IPs, wallet addresses, and account IDs are not stored raw. */
export function buildRateLimitKey(params: {
  readonly riskClass: string;
  readonly identifiers: readonly string[];
  readonly secret: string;
}): string {
  if (params.secret.length < 32)
    throw new Error("rate-limit key secret is too short");
  const digest = createHmac("sha256", params.secret)
    .update(params.identifiers.join("\u001f"))
    .digest("hex");
  return `${params.riskClass}:${digest}`.slice(0, 256);
}

/** Atomic, durable fixed-window limiter. Redis may front this but cannot replace it. */
export async function consumeRateLimit(
  db: Db,
  params: {
    readonly key: string;
    readonly limit: number;
    readonly windowMs: number;
    readonly now?: Date;
  },
): Promise<RateLimitDecision> {
  if (!Number.isInteger(params.limit) || params.limit < 1) {
    throw new Error("rate limit must be a positive integer");
  }
  if (!Number.isInteger(params.windowMs) || params.windowMs < 1_000) {
    throw new Error("rate-limit window must be at least one second");
  }
  const now = params.now ?? new Date();
  const nextExpiry = new Date(now.getTime() + params.windowMs);
  const [row] = await db
    .insert(apiRateLimits)
    .values({
      key: params.key,
      count: 1,
      windowStartedAt: now,
      expiresAt: nextExpiry,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: apiRateLimits.key,
      set: {
        count: sql`CASE WHEN ${apiRateLimits.expiresAt} <= ${now} THEN 1 ELSE ${apiRateLimits.count} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${apiRateLimits.expiresAt} <= ${now} THEN ${now} ELSE ${apiRateLimits.windowStartedAt} END`,
        expiresAt: sql`CASE WHEN ${apiRateLimits.expiresAt} <= ${now} THEN ${nextExpiry} ELSE ${apiRateLimits.expiresAt} END`,
        updatedAt: now,
      },
    })
    .returning({
      count: apiRateLimits.count,
      expiresAt: apiRateLimits.expiresAt,
    });
  if (!row) throw new Error("rate-limit update returned no row");
  return {
    allowed: row.count <= params.limit,
    count: row.count,
    limit: params.limit,
    retryAfterSeconds: Math.max(
      0,
      Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1_000),
    ),
  };
}

/** Durable implementation for the typed signer's NonceStore port. */
export async function consumeSigningNonce(
  db: Db,
  params: {
    readonly scope: string;
    readonly nonce: string;
    readonly expiresAt: Date;
  },
): Promise<boolean> {
  const key = createHash("sha256")
    .update(`${params.scope}\u001f${params.nonce}`)
    .digest("hex");
  const [inserted] = await db
    .insert(idempotencyRecords)
    .values({
      scope: "signing-nonce",
      key,
      requestHash: key,
      status: "completed",
      expiresAt: params.expiresAt,
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyRecords.id });
  return Boolean(inserted);
}

export interface SecurityAuditInput {
  readonly chainKey: string;
  readonly action: string;
  readonly decision: "allowed" | "denied" | "error";
  readonly correlationId: string;
  readonly principalId?: string;
  readonly sessionId?: string;
  readonly resource?: string;
  readonly reasonCodes?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly occurredAt?: Date;
}

/** Appends one hash-chained event while serializing writers on its chain head. */
export async function appendSecurityAuditEvent(
  db: Db,
  input: SecurityAuditInput,
): Promise<{ readonly id: string; readonly eventHash: string }> {
  return db.transaction(async (tx) => {
    await tx
      .insert(securityAuditHeads)
      .values({ chainKey: input.chainKey })
      .onConflictDoNothing();
    const [head] = await tx
      .select({ eventHash: securityAuditHeads.eventHash })
      .from(securityAuditHeads)
      .where(eq(securityAuditHeads.chainKey, input.chainKey))
      .limit(1)
      .for("update");
    if (!head) throw new Error("audit chain head was not found");

    const occurredAt = input.occurredAt ?? new Date();
    const metadata = input.metadata ?? {};
    const reasonCodes = [...(input.reasonCodes ?? [])].sort();
    const eventHash = createHash("sha256")
      .update(
        stableJson({
          previousHash: head.eventHash,
          chainKey: input.chainKey,
          action: input.action,
          decision: input.decision,
          correlationId: input.correlationId,
          principalId: input.principalId ?? null,
          sessionId: input.sessionId ?? null,
          resource: input.resource ?? null,
          reasonCodes,
          metadata,
          occurredAt: occurredAt.toISOString(),
        }),
      )
      .digest("hex");
    const [created] = await tx
      .insert(securityAuditEvents)
      .values({
        chainKey: input.chainKey,
        action: input.action,
        decision: input.decision,
        correlationId: input.correlationId,
        previousHash: head.eventHash,
        eventHash,
        reasonCodes,
        metadata,
        createdAt: occurredAt,
        ...(input.principalId ? { principalId: input.principalId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.resource ? { resource: input.resource } : {}),
      })
      .returning({ id: securityAuditEvents.id });
    if (!created) throw new Error("security audit insert returned no row");
    await tx
      .update(securityAuditHeads)
      .set({ eventHash, updatedAt: occurredAt })
      .where(
        and(
          eq(securityAuditHeads.chainKey, input.chainKey),
          head.eventHash === null
            ? sql`${securityAuditHeads.eventHash} IS NULL`
            : eq(securityAuditHeads.eventHash, head.eventHash),
        ),
      );
    return { id: created.id, eventHash };
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
