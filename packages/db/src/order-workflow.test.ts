import { readFile } from "node:fs/promises";

import { PGlite } from "@electric-sql/pglite";
import { InvalidOrderTransitionError } from "@klub/domain";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  claimOutboxEvents,
  createOrderIntent,
  IdempotencyConflictError,
  markOutboxFailed,
  markOutboxPublished,
  transitionOrderIntent,
} from "./order-workflow.js";
import {
  appendSecurityAuditEvent,
  buildRateLimitKey,
  consumeRateLimit,
  consumeSigningNonce,
} from "./security-controls.js";
import * as schema from "./schema.js";
import type { Db } from "./index.js";

const correlationId = "11111111-1111-4111-8111-111111111111";
const now = Date.parse("2026-07-18T10:00:00.000Z");
const input = {
  version: 1,
  principalId: "did:privy:user-1",
  accountId: "bulk-account-1",
  marketId: "BTC-USD",
  side: "buy",
  orderType: "limit",
  quantity: "0.01",
  limitPrice: "64000",
  reduceOnly: false,
  maxSlippageBps: 25,
  expiresAt: "2026-07-18T10:01:00.000Z",
  nonce: "nonce-1",
  network: "bulk-testnet",
} as const;

let client: PGlite;
let db: Db;

beforeAll(async () => {
  client = new PGlite();
  const migration = await readFile(
    new URL(
      "../migrations/0008_add_security_and_execution_state.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
  db = drizzle(client, { schema }) as unknown as Db;
});

beforeEach(async () => {
  await client.exec(`TRUNCATE TABLE
    outbox_events, order_state_transitions, order_intents, reconciliation_items,
    faucet_claims, privy_wallets, privy_accounts, api_rate_limits,
    security_audit_heads, security_audit_events, idempotency_records CASCADE`);
  await client.query(
    `INSERT INTO privy_accounts (privy_user_id) VALUES ('did:privy:user-1')`,
  );
});

afterAll(async () => {
  await client.close();
});

function command(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    input,
    idempotencyKey: "idem-1",
    requestHash: "a".repeat(64),
    correlationId,
    idempotencyExpiresAt: new Date("2026-07-19T10:00:00.000Z"),
    now,
    ...overrides,
  };
}

describe("durable order workflow", () => {
  it("atomically creates the intent, transition, and outbox event", async () => {
    const created = await createOrderIntent(db, command());
    expect(created).toMatchObject({ status: "CREATED", replayed: false });

    const counts = await client.query<{
      intents: number;
      transitions: number;
      events: number;
    }>(`SELECT
      (SELECT count(*)::int FROM order_intents) intents,
      (SELECT count(*)::int FROM order_state_transitions) transitions,
      (SELECT count(*)::int FROM outbox_events) events`);
    expect(counts.rows[0]).toEqual({ intents: 1, transitions: 1, events: 1 });
  });

  it("returns the original result for a matching idempotent replay", async () => {
    const first = await createOrderIntent(db, command());
    const replay = await createOrderIntent(db, command());
    expect(replay).toEqual({ id: first.id, status: "CREATED", replayed: true });
  });

  it("rejects reuse of an idempotency key with another request hash", async () => {
    await createOrderIntent(db, command());
    await expect(
      createOrderIntent(db, command({ requestHash: "b".repeat(64) })),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("persists only legal serialized state transitions", async () => {
    const created = await createOrderIntent(db, command());
    await expect(
      transitionOrderIntent(db, {
        orderIntentId: created.id,
        toStatus: "VALIDATED",
        correlationId,
      }),
    ).resolves.toEqual({ status: "VALIDATED", sequence: 1 });
    await expect(
      transitionOrderIntent(db, {
        orderIntentId: created.id,
        toStatus: "FILLED",
        correlationId,
      }),
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError);
  });

  it("claims outbox work once, then records publication", async () => {
    await createOrderIntent(db, command());
    const claimed = await claimOutboxEvents(db, "worker-1", {
      now: new Date("2099-07-18T10:00:01.000Z"),
    });
    expect(claimed).toHaveLength(1);
    await expect(
      claimOutboxEvents(db, "worker-2", {
        now: new Date("2099-07-18T10:00:01.000Z"),
      }),
    ).resolves.toHaveLength(0);
    await markOutboxPublished(db, claimed[0]!.id);
    const status = await client.query<{ status: string }>(
      `SELECT status FROM outbox_events`,
    );
    expect(status.rows[0]?.status).toBe("published");
  });

  it("backs failed events off and dead-letters at the retry limit", async () => {
    await createOrderIntent(db, command());
    const [event] = await claimOutboxEvents(db, "worker-1", {
      now: new Date("2099-07-18T10:00:01.000Z"),
    });
    expect(event?.attempts).toBe(1);
    await expect(
      markOutboxFailed(db, event!.id, "VENUE_UNAVAILABLE", {
        maxAttempts: 1,
        now: new Date("2099-07-18T10:00:02.000Z"),
      }),
    ).resolves.toBe("dead");
  });

  it("durably limits opaque identities and resets the next window", async () => {
    const key = buildRateLimitKey({
      riskClass: "signing",
      identifiers: ["203.0.113.7", "did:privy:user-1"],
      secret: "s".repeat(32),
    });
    expect(key).not.toContain("203.0.113.7");
    const first = await consumeRateLimit(db, {
      key,
      limit: 1,
      windowMs: 60_000,
      now: new Date("2026-07-18T10:00:00.000Z"),
    });
    const denied = await consumeRateLimit(db, {
      key,
      limit: 1,
      windowMs: 60_000,
      now: new Date("2026-07-18T10:00:01.000Z"),
    });
    const reset = await consumeRateLimit(db, {
      key,
      limit: 1,
      windowMs: 60_000,
      now: new Date("2026-07-18T10:01:01.000Z"),
    });
    expect(first.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(reset).toMatchObject({ allowed: true, count: 1 });
  });

  it("atomically rejects a signing nonce replay", async () => {
    const params = {
      scope: "bulk-testnet:account-1",
      nonce: "nonce-1",
      expiresAt: new Date("2026-07-18T10:01:00.000Z"),
    };
    await expect(consumeSigningNonce(db, params)).resolves.toBe(true);
    await expect(consumeSigningNonce(db, params)).resolves.toBe(false);
  });

  it("chains immutable security audit events", async () => {
    const first = await appendSecurityAuditEvent(db, {
      chainKey: "principal:did:privy:user-1",
      principalId: "did:privy:user-1",
      action: "order.sign",
      decision: "allowed",
      correlationId,
      occurredAt: new Date("2026-07-18T10:00:00.000Z"),
    });
    await appendSecurityAuditEvent(db, {
      chainKey: "principal:did:privy:user-1",
      principalId: "did:privy:user-1",
      action: "order.submit",
      decision: "error",
      reasonCodes: ["VENUE_TIMEOUT"],
      correlationId,
      occurredAt: new Date("2026-07-18T10:00:01.000Z"),
    });
    const result = await client.query<{ previous_hash: string }>(
      `SELECT previous_hash FROM security_audit_events ORDER BY created_at DESC LIMIT 1`,
    );
    expect(result.rows[0]?.previous_hash).toBe(first.eventHash);
  });
});
