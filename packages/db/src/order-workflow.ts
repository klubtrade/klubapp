import {
  assertOrderTransition,
  parsePlaceOrderIntentV1,
  type OrderStatus,
  type PlaceOrderIntentV1,
} from "@klub/domain";
import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";

import type { Db } from "./index.js";
import {
  idempotencyRecords,
  orderIntents,
  orderStateTransitions,
  outboxEvents,
} from "./schema.js";

export interface CreateOrderIntentCommand {
  readonly input: unknown;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly correlationId: string;
  readonly idempotencyExpiresAt: Date;
  readonly now?: number;
}

export interface CreatedOrderIntent {
  readonly id: string;
  readonly status: OrderStatus;
  readonly replayed: boolean;
}

/** Atomically persists an intent, initial transition, and outbox event. */
export async function createOrderIntent(
  db: Db,
  command: CreateOrderIntentCommand,
): Promise<CreatedOrderIntent> {
  const intent = parsePlaceOrderIntentV1(command.input, command.now);
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .insert(idempotencyRecords)
      .values({
        scope: "place-order",
        key: command.idempotencyKey,
        requestHash: command.requestHash,
        expiresAt: command.idempotencyExpiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyRecords.id });

    if (!claimed) {
      const [existingRecord] = await tx
        .select({ requestHash: idempotencyRecords.requestHash })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.scope, "place-order"),
            eq(idempotencyRecords.key, command.idempotencyKey),
          ),
        )
        .limit(1);
      if (
        !existingRecord ||
        existingRecord.requestHash !== command.requestHash
      ) {
        throw new IdempotencyConflictError(command.idempotencyKey);
      }
      const [existingIntent] = await tx
        .select({ id: orderIntents.id, status: orderIntents.status })
        .from(orderIntents)
        .where(eq(orderIntents.idempotencyKey, command.idempotencyKey))
        .limit(1);
      if (!existingIntent)
        throw new IdempotencyInProgressError(command.idempotencyKey);
      return { ...existingIntent, replayed: true };
    }

    const [created] = await tx
      .insert(orderIntents)
      .values(orderIntentRow(intent, command))
      .returning({ id: orderIntents.id, status: orderIntents.status });
    if (!created) throw new Error("order intent insert returned no row");

    await tx.insert(orderStateTransitions).values({
      orderIntentId: created.id,
      sequence: 0,
      fromStatus: null,
      toStatus: "CREATED",
    });
    await tx.insert(outboxEvents).values({
      aggregateType: "order-intent",
      aggregateId: created.id,
      eventType: "OrderIntentCreated",
      payload: outboxPayload(created.id, "CREATED", command.correlationId),
    });
    await tx
      .update(idempotencyRecords)
      .set({
        status: "completed",
        responseCode: 202,
        responseBody: { orderIntentId: created.id, status: created.status },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(idempotencyRecords.scope, "place-order"),
          eq(idempotencyRecords.key, command.idempotencyKey),
        ),
      );
    return { ...created, replayed: false };
  });
}

export interface TransitionOrderCommand {
  readonly orderIntentId: string;
  readonly toStatus: OrderStatus;
  readonly correlationId: string;
  readonly reasonCode?: string;
  readonly venueOrderId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** Serializes transitions by locking the order row inside one transaction. */
export async function transitionOrderIntent(
  db: Db,
  command: TransitionOrderCommand,
): Promise<{ readonly status: OrderStatus; readonly sequence: number }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: orderIntents.id, status: orderIntents.status })
      .from(orderIntents)
      .where(eq(orderIntents.id, command.orderIntentId))
      .limit(1)
      .for("update");
    if (!current) throw new OrderIntentNotFoundError(command.orderIntentId);
    assertOrderTransition(current.status, command.toStatus);

    const [lastTransition] = await tx
      .select({ sequence: orderStateTransitions.sequence })
      .from(orderStateTransitions)
      .where(eq(orderStateTransitions.orderIntentId, current.id))
      .orderBy(desc(orderStateTransitions.sequence))
      .for("update");
    const sequence = (lastTransition?.sequence ?? -1) + 1;

    await tx
      .update(orderIntents)
      .set({
        status: command.toStatus,
        ...(command.venueOrderId ? { venueOrderId: command.venueOrderId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(orderIntents.id, current.id));
    await tx.insert(orderStateTransitions).values({
      orderIntentId: current.id,
      sequence,
      fromStatus: current.status,
      toStatus: command.toStatus,
      ...(command.reasonCode ? { reasonCode: command.reasonCode } : {}),
      metadata: command.metadata ?? {},
    });
    await tx.insert(outboxEvents).values({
      aggregateType: "order-intent",
      aggregateId: current.id,
      eventType: "OrderIntentStateChanged",
      payload: {
        ...outboxPayload(current.id, command.toStatus, command.correlationId),
        fromStatus: current.status,
        sequence,
        reasonCode: command.reasonCode ?? null,
      },
    });
    return { status: command.toStatus, sequence };
  });
}

export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly payload: unknown;
  readonly attempts: number;
}

/** Claims a restart-safe batch. Expired worker locks are reclaimable. */
export async function claimOutboxEvents(
  db: Db,
  workerId: string,
  options: {
    readonly limit?: number;
    readonly lockMs?: number;
    readonly now?: Date;
  } = {},
): Promise<readonly ClaimedOutboxEvent[]> {
  const now = options.now ?? new Date();
  const lockedUntil = new Date(now.getTime() + (options.lockMs ?? 30_000));
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          lte(outboxEvents.availableAt, now),
          or(
            eq(outboxEvents.status, "pending"),
            and(
              eq(outboxEvents.status, "publishing"),
              lte(outboxEvents.lockedUntil, now),
            ),
          ),
        ),
      )
      .limit(options.limit ?? 50)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    await tx
      .update(outboxEvents)
      .set({
        status: "publishing",
        lockedBy: workerId,
        lockedUntil,
        attempts: sql`${outboxEvents.attempts} + 1`,
      })
      .where(
        inArray(
          outboxEvents.id,
          rows.map((row) => row.id),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      aggregateType: row.aggregateType,
      aggregateId: row.aggregateId,
      eventType: row.eventType,
      eventVersion: row.eventVersion,
      payload: row.payload,
      attempts: row.attempts + 1,
    }));
  });
}

export async function markOutboxPublished(
  db: Db,
  eventId: string,
): Promise<void> {
  await db
    .update(outboxEvents)
    .set({
      status: "published",
      publishedAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
    })
    .where(eq(outboxEvents.id, eventId));
}

/** Returns retryable events to the queue with capped exponential backoff. */
export async function markOutboxFailed(
  db: Db,
  eventId: string,
  errorCode: string,
  options: {
    readonly maxAttempts?: number;
    readonly now?: Date;
    readonly baseDelayMs?: number;
  } = {},
): Promise<"pending" | "dead"> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select({ attempts: outboxEvents.attempts })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId))
      .limit(1)
      .for("update");
    if (!event) throw new Error("outbox event was not found");
    const status =
      event.attempts >= (options.maxAttempts ?? 8) ? "dead" : "pending";
    const delay = Math.min(
      (options.baseDelayMs ?? 1_000) * 2 ** Math.max(event.attempts - 1, 0),
      15 * 60_000,
    );
    await tx
      .update(outboxEvents)
      .set({
        status,
        availableAt: new Date((options.now ?? new Date()).getTime() + delay),
        lastErrorCode: errorCode.slice(0, 96),
        lockedBy: null,
        lockedUntil: null,
      })
      .where(eq(outboxEvents.id, eventId));
    return status;
  });
}

function orderIntentRow(
  intent: PlaceOrderIntentV1,
  command: CreateOrderIntentCommand,
) {
  return {
    privyUserId: intent.principalId,
    accountId: intent.accountId,
    marketId: intent.marketId,
    side: intent.side,
    orderType: intent.orderType,
    quantity: intent.quantity,
    limitPrice: intent.limitPrice ?? null,
    reduceOnly: intent.reduceOnly,
    maxSlippageBps: intent.maxSlippageBps,
    network: intent.network,
    nonce: intent.nonce,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    expiresAt: new Date(intent.expiresAt),
  };
}

function outboxPayload(
  orderIntentId: string,
  status: OrderStatus,
  correlationId: string,
) {
  return { orderIntentId, status, correlationId };
}

export class IdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor(readonly key: string) {
    super("idempotency key was already used for a different request");
    this.name = "IdempotencyConflictError";
  }
}

export class IdempotencyInProgressError extends Error {
  readonly code = "IDEMPOTENCY_IN_PROGRESS";
  constructor(readonly key: string) {
    super("idempotent request is still being created");
    this.name = "IdempotencyInProgressError";
  }
}

export class OrderIntentNotFoundError extends Error {
  readonly code = "ORDER_INTENT_NOT_FOUND";
  constructor(readonly orderIntentId: string) {
    super("order intent was not found");
    this.name = "OrderIntentNotFoundError";
  }
}
