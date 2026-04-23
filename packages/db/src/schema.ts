// packages/db/src/schema.ts
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * KLUB Postgres schema — single source of truth for the data model.
 *
 * Tables:
 *   users                  — KLUB account identity; 1:1 with email
 *   waitlist               — pre-invite signups; upgraded to users on redeem
 *   invites                — batch-issued codes; tracks remaining/redemptions
 *   invite_redemptions     — audit log of every code redemption
 *   wallets                — wallet addresses linked to a user (public data)
 *   agent_wallets          — scoped keys authorized by the user (no priv keys)
 *   follows                — user → leader copy-trade relationships
 *   alert_subscriptions    — per-position alert thresholds (25/10/3%)
 *   alert_deliveries       — audit log of sent alerts
 *   journal_entries        — practice-mode trade journal (post Phase 3.5)
 *
 * No private keys are ever stored. Agent wallets are represented by their
 * public key and scope; the private key lives in our secure key service.
 */

// ---------------------------------------------------------------------------
// users + waitlist + invites
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 254 }).notNull(),
    handle: varchar('handle', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    // Geolocation on signup — recorded for compliance, never exposed to user
    signupCountry: varchar('signup_country', { length: 2 }),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    handleIdx: uniqueIndex('users_handle_idx').on(t.handle),
  }),
);

export const waitlist = pgTable(
  'waitlist',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 254 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    // Set when the waitlist entry redeems an invite and becomes a user
    promotedUserId: uuid('promoted_user_id').references(() => users.id),
    // Free-form source tag: "twitter", "farcaster", "friend", etc.
    source: varchar('source', { length: 32 }),
  },
  (t) => ({
    emailIdx: uniqueIndex('waitlist_email_idx').on(t.email),
  }),
);

export const invites = pgTable(
  'invites',
  {
    code: varchar('code', { length: 64 }).primaryKey(),
    label: varchar('label', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    // null for infinite (demo code); integer for capped
    maxRedemptions: integer('max_redemptions'),
    redemptionCount: integer('redemption_count').default(0).notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
  },
);

export const inviteRedemptions = pgTable('invite_redemptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 64 })
    .notNull()
    .references(() => invites.code),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }).defaultNow().notNull(),
  // Captured for compliance/fraud investigation
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
});

// ---------------------------------------------------------------------------
// wallets + agent wallets
// ---------------------------------------------------------------------------

export const wallets = pgTable(
  'wallets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    address: varchar('address', { length: 64 }).notNull(),
    // 'solana' | 'bulk-net' — used to pick the right signer on execute
    chain: varchar('chain', { length: 32 }).notNull(),
    addedAt: timestamp('added_at', { withTimezone: true }).defaultNow().notNull(),
    primary: boolean('primary').default(false).notNull(),
  },
  (t) => ({
    addressIdx: index('wallets_address_idx').on(t.address),
    userWalletUnique: uniqueIndex('wallets_user_address_idx').on(t.userId, t.address),
  }),
);

/**
 * Represents an agent wallet the user has authorized KLUB to use on
 * their behalf. We only store the public key and the scope; the private
 * key is held in our secure key service (see comments in
 * `apps/worker/src/signing/bulk-keychain.ts`).
 */
export const agentWallets = pgTable(
  'agent_wallets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    publicKey: varchar('public_key', { length: 128 }).notNull(),
    // Scope expressed as a JSON document — see AgentWalletScope type
    scope: jsonb('scope').notNull(),
    label: varchar('label', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('agent_wallets_user_idx').on(t.userId),
    pubkeyIdx: uniqueIndex('agent_wallets_pubkey_idx').on(t.publicKey),
  }),
);

// ---------------------------------------------------------------------------
// follows (copy trading)
// ---------------------------------------------------------------------------

export const follows = pgTable(
  'follows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    leaderHandle: varchar('leader_handle', { length: 20 }).notNull(),
    // Percentage 1-100
    maxAllocationPct: integer('max_allocation_pct').notNull(),
    // Optional override stop-loss, e.g. 8 = close at 8% adverse move
    stopOverridePct: real('stop_override_pct'),
    // If false, only BTC/ETH mirror; if true, all leader's markets
    copyAllSymbols: boolean('copy_all_symbols').default(true).notNull(),
    agentWalletId: uuid('agent_wallet_id').references(() => agentWallets.id),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => ({
    followerIdx: index('follows_follower_idx').on(t.followerId),
    leaderIdx: index('follows_leader_idx').on(t.leaderHandle),
    followerLeaderUnique: uniqueIndex('follows_follower_leader_idx').on(
      t.followerId,
      t.leaderHandle,
    ),
  }),
);

// ---------------------------------------------------------------------------
// alerts
// ---------------------------------------------------------------------------

export const alertSubscriptions = pgTable('alert_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // User's Bulk account pubkey — what the account-WS subscriber uses
  // to open the subscription. Null until the user connects a wallet.
  userPubkey: varchar('user_pubkey', { length: 64 }),
  // Channels the user wants — array of: 'push' | 'email' | 'telegram'
  channels: jsonb('channels').notNull(),
  // Tier thresholds (default [0.25, 0.10, 0.03]) — user may widen/tighten
  bufferTiers: jsonb('buffer_tiers').default([0.25, 0.1, 0.03]).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const alertDeliveries = pgTable(
  'alert_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // e.g. "BTC-USD" — the position this alert was about
    symbol: varchar('symbol', { length: 32 }).notNull(),
    tier: real('tier').notNull(), // 0.25 | 0.10 | 0.03
    channel: varchar('channel', { length: 16 }).notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }).defaultNow().notNull(),
    // null if delivery succeeded; error string otherwise
    error: text('error'),
  },
  (t) => ({
    userTimeIdx: index('alert_deliveries_user_time_idx').on(t.userId, t.deliveredAt),
  }),
);

// ---------------------------------------------------------------------------
// journal
// ---------------------------------------------------------------------------

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // 'paper' for testnet practice, 'live' for real (future)
    mode: varchar('mode', { length: 16 }).notNull(),
    symbol: varchar('symbol', { length: 32 }).notNull(),
    side: varchar('side', { length: 5 }).notNull(),
    entryPrice: real('entry_price').notNull(),
    sizeBase: real('size_base').notNull(),
    leverage: real('leverage').notNull(),
    entryReason: text('entry_reason').notNull(),
    exitPrice: real('exit_price'),
    exitReason: text('exit_reason'),
    realizedPnlUsd: real('realized_pnl_usd'),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => ({
    userIdx: index('journal_user_idx').on(t.userId),
  }),
);

// ---------------------------------------------------------------------------
// Agent Wallet scope type (stored in agent_wallets.scope jsonb)
// ---------------------------------------------------------------------------

/**
 * Scope schema for an agent wallet.
 *
 * Conservative by default. The user must explicitly widen any field.
 * Scoping granularity beyond symbol/maxNotional/expiration depends on
 * what Bulk's integrator program confirms — this type tracks the
 * strictest possible scope for the copy-trade MVP. Wider variants will
 * need discriminator fields.
 */
export interface AgentWalletScope {
  readonly purpose: 'copy-trade' | 'liquidation-defense' | 'basis-vault';
  readonly symbols: readonly string[] | 'all';
  readonly maxNotionalUsd: number;
  readonly maxLeverage: number;
  readonly allowedActions: readonly ('placeOrder' | 'cancelOrder' | 'reducePosition')[];
}
