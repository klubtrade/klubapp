// packages/db/src/schema.ts
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

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
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    handle: varchar("handle", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    // Geolocation on signup — recorded for compliance, never exposed to user
    signupCountry: varchar("signup_country", { length: 2 }),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    handleIdx: uniqueIndex("users_handle_idx").on(t.handle),
  }),
);

export const waitlist = pgTable(
  "waitlist",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Set when the waitlist entry redeems an invite and becomes a user
    promotedUserId: uuid("promoted_user_id").references(() => users.id),
    // Free-form source tag: "twitter", "farcaster", "friend", etc.
    source: varchar("source", { length: 32 }),
  },
  (t) => ({
    emailIdx: uniqueIndex("waitlist_email_idx").on(t.email),
  }),
);

export const invites = pgTable("invites", {
  code: varchar("code", { length: 64 }).primaryKey(),
  label: varchar("label", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // null for infinite (demo code); integer for capped
  maxRedemptions: integer("max_redemptions"),
  redemptionCount: integer("redemption_count").default(0).notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

export const inviteRedemptions = pgTable("invite_redemptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 64 })
    .notNull()
    .references(() => invites.code),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  // Captured for compliance/fraud investigation
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
});

// ---------------------------------------------------------------------------
// wallets + agent wallets
// ---------------------------------------------------------------------------

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 64 }).notNull(),
    // 'solana' | 'bulk-net' — used to pick the right signer on execute
    chain: varchar("chain", { length: 32 }).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    primary: boolean("primary").default(false).notNull(),
  },
  (t) => ({
    addressIdx: index("wallets_address_idx").on(t.address),
    userWalletUnique: uniqueIndex("wallets_user_address_idx").on(
      t.userId,
      t.address,
    ),
  }),
);

/**
 * Represents an agent wallet the user has authorized KLUB to use on
 * their behalf. We only store the public key and the scope; the private
 * key is held in our secure key service (see comments in
 * `apps/worker/src/signing/bulk-keychain.ts`).
 */
export const agentWallets = pgTable(
  "agent_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publicKey: varchar("public_key", { length: 128 }).notNull(),
    // Scope expressed as a JSON document — see AgentWalletScope type
    scope: jsonb("scope").notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("agent_wallets_user_idx").on(t.userId),
    pubkeyIdx: uniqueIndex("agent_wallets_pubkey_idx").on(t.publicKey),
  }),
);

// ---------------------------------------------------------------------------
// leaders
// ---------------------------------------------------------------------------

export const leaders = pgTable(
  "leaders",
  {
    pubkey: varchar("pubkey", { length: 128 }).primaryKey(),
    handle: varchar("handle", { length: 20 }),
    netPnl24hUsd: real("net_pnl_24h_usd").default(0).notNull(),
    netPnl7dUsd: real("net_pnl_7d_usd").default(0).notNull(),
    netPnl30dUsd: real("net_pnl_30d_usd").notNull(),
    unrealizedPnlUsd: real("unrealized_pnl_usd").notNull(),
    winRate: real("win_rate").notNull(),
    closedTradesCount: integer("closed_trades_count").notNull(),
    maxDrawdownUsd: real("max_drawdown_usd").notNull(),
    maxDrawdownPct: real("max_drawdown_pct").notNull(),
    sharpeRatio: real("sharpe_ratio").notNull(),
    followedEquityUsd: real("followed_equity_usd").default(0).notNull(),
    fillsLast24h: integer("fills_last_24h").default(0).notNull(),
    fillsLast7d: integer("fills_last_7d").default(0).notNull(),
    fillsLast30d: integer("fills_last_30d").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    handleIdx: index("leaders_handle_idx").on(t.handle),
  }),
);

// ---------------------------------------------------------------------------
// Basis yield operator
// ---------------------------------------------------------------------------

export const basisOperatorStates = pgTable("basis_operator_states", {
  sourceAccount: varchar("source_account", { length: 128 }).primaryKey(),
  highWaterPnlRaw: bigint("high_water_pnl_raw", { mode: "bigint" })
    .default(0n)
    .notNull(),
  creditedYieldRaw: bigint("credited_yield_raw", { mode: "bigint" })
    .default(0n)
    .notNull(),
  sourceTimestamp: bigint("source_timestamp", { mode: "bigint" })
    .default(0n)
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const basisYieldCredits = pgTable(
  "basis_yield_credits",
  {
    idempotencyKey: varchar("idempotency_key", { length: 180 }).primaryKey(),
    sourceAccount: varchar("source_account", { length: 128 }).notNull(),
    owner: varchar("owner", { length: 128 }).notNull(),
    position: varchar("position", { length: 128 }).notNull(),
    amountRaw: bigint("amount_raw", { mode: "bigint" }).notNull(),
    sourcePnlRaw: bigint("source_pnl_raw", { mode: "bigint" }).notNull(),
    status: varchar("status", { length: 24 })
      .$type<
        | "pending"
        | "submitting"
        | "confirmed"
        | "reconciliation_required"
        | "failed"
      >()
      .default("pending")
      .notNull(),
    signature: varchar("signature", { length: 128 }),
    wireTransaction: text("wire_transaction"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    sourceIdx: index("basis_yield_credits_source_idx").on(
      table.sourceAccount,
      table.createdAt,
    ),
    signatureIdx: uniqueIndex("basis_yield_credits_signature_idx").on(
      table.signature,
    ),
  }),
);

export const basisStrategyControls = pgTable("basis_strategy_controls", {
  sourceAccount: varchar("source_account", { length: 128 }).primaryKey(),
  paused: boolean("paused").default(false).notNull(),
  pauseReason: text("pause_reason"),
  consecutiveErrors: integer("consecutive_errors").default(0).notNull(),
  peakEquityUsd: real("peak_equity_usd").default(0).notNull(),
  lastEquityUsd: real("last_equity_usd").default(0).notNull(),
  lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const basisStrategyRuns = pgTable(
  "basis_strategy_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceAccount: varchar("source_account", { length: 128 }).notNull(),
    state: varchar("state", { length: 32 })
      .$type<
        | "discovered"
        | "validated"
        | "submitting"
        | "open"
        | "closing"
        | "closed"
        | "reconciliation_required"
        | "paused"
        | "failed"
      >()
      .notNull(),
    longSymbol: varchar("long_symbol", { length: 32 }).notNull(),
    shortSymbol: varchar("short_symbol", { length: 32 }).notNull(),
    longSize: real("long_size").notNull(),
    shortSize: real("short_size").notNull(),
    targetNotionalUsd: real("target_notional_usd").notNull(),
    expectedAnnualPct: real("expected_annual_pct").notNull(),
    orderIds: jsonb("order_ids").$type<readonly string[]>(),
    venueResponse: jsonb("venue_response"),
    riskSnapshot: jsonb("risk_snapshot").notNull(),
    error: text("error"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    accountStateIdx: index("basis_strategy_runs_account_state_idx").on(
      table.sourceAccount,
      table.state,
      table.createdAt,
    ),
  }),
);

export const leaderCandidates = pgTable("leader_candidates", {
  pubkey: varchar("pubkey", { length: 128 }).primaryKey(),
  source: varchar("source", { length: 32 }).default("trade_stream").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  indexFailures: integer("index_failures").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const leaderApplications = pgTable("leader_applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userPubkey: varchar("user_pubkey", { length: 128 }).notNull(),
  handle: varchar("handle", { length: 20 }).notNull(),
  status: varchar("status", { length: 16 })
    .$type<"pending" | "approved" | "rejected">()
    .default("pending")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// handles — KLUB-wide @username registry
// ---------------------------------------------------------------------------

/**
 * Handles power the social layer of the Super App: pay-by-link
 * (`klub.app/pay/@micah`), leader display, future profile URLs.
 *
 * Claim flow:
 *   - User signs the message `claim:${handle}` with their wallet.
 *   - POST /api/handles/claim verifies the signature and inserts.
 *   - Handles are immutable after claim. To "rename" you revoke (TBD)
 *     and re-claim a different handle.
 *
 * Charset is conservative — lowercase a-z, 0-9, underscore — and
 * length-bounded 3-30 to fit in a URL without escaping.
 */
export const handles = pgTable(
  "handles",
  {
    handle: varchar("handle", { length: 30 }).primaryKey(),
    pubkey: varchar("pubkey", { length: 128 }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    pubkeyIdx: index("handles_pubkey_idx").on(t.pubkey),
  }),
);

// ---------------------------------------------------------------------------
// user_profiles — durable wallet-scoped app state
// ---------------------------------------------------------------------------

export const userProfiles = pgTable(
  "user_profiles",
  {
    pubkey: varchar("pubkey", { length: 128 }).primaryKey(),
    handle: varchar("handle", { length: 30 }),
    onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
    riskProfile: varchar("risk_profile", { length: 16 })
      .$type<"conservative" | "balanced" | "aggressive">()
      .default("balanced")
      .notNull(),
    preferredTradeMode: varchar("preferred_trade_mode", { length: 16 })
      .$type<"simple" | "expert">()
      .default("simple")
      .notNull(),
    defaultCopyAllocPct: integer("default_copy_alloc_pct")
      .default(20)
      .notNull(),
    alertsEnabled: boolean("alerts_enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    handleIdx: index("user_profiles_handle_idx").on(t.handle),
  }),
);

// ---------------------------------------------------------------------------
// follows (copy trading)
// ---------------------------------------------------------------------------

export const follows = pgTable(
  "follows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leaderHandle: varchar("leader_handle", { length: 20 }).notNull(),
    // Percentage 1-100
    maxAllocationPct: integer("max_allocation_pct").notNull(),
    // Optional override stop-loss, e.g. 8 = close at 8% adverse move
    stopOverridePct: real("stop_override_pct"),
    // If false, only BTC/ETH mirror; if true, all leader's markets
    copyAllSymbols: boolean("copy_all_symbols").default(true).notNull(),
    agentWalletId: uuid("agent_wallet_id").references(() => agentWallets.id),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => ({
    followerIdx: index("follows_follower_idx").on(t.followerId),
    leaderIdx: index("follows_leader_idx").on(t.leaderHandle),
    followerLeaderUnique: uniqueIndex("follows_follower_leader_idx").on(
      t.followerId,
      t.leaderHandle,
    ),
  }),
);

/**
 * Wallet-scoped copy-follow preferences used by the web app before
 * the Railway worker owns execution. This is intentionally keyed by
 * Bulk/Solana pubkeys instead of `users.id` because Privy onboarding
 * is wallet-first and does not require email.
 */
export const copyFollows = pgTable(
  "copy_follows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    followerPubkey: varchar("follower_pubkey", { length: 128 }).notNull(),
    leaderPubkey: varchar("leader_pubkey", { length: 128 }).notNull(),
    label: varchar("label", { length: 64 }),
    allocationPct: integer("allocation_pct").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    followerIdx: index("copy_follows_follower_idx").on(t.followerPubkey),
    leaderIdx: index("copy_follows_leader_idx").on(t.leaderPubkey),
    followerLeaderUnique: uniqueIndex("copy_follows_follower_leader_idx").on(
      t.followerPubkey,
      t.leaderPubkey,
    ),
  }),
);

// ---------------------------------------------------------------------------
// worker runtime state
// ---------------------------------------------------------------------------

export const workerHeartbeats = pgTable("worker_heartbeats", {
  workerName: varchar("worker_name", { length: 64 }).primaryKey(),
  instanceId: varchar("instance_id", { length: 128 }).notNull(),
  status: varchar("status", { length: 16 })
    .$type<"starting" | "ok" | "degraded" | "error">()
    .default("starting")
    .notNull(),
  activeCopyFollows: integer("active_copy_follows").default(0).notNull(),
  lastError: text("last_error"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const copyFollowSnapshots = pgTable(
  "copy_follow_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceFollowId: uuid("source_follow_id")
      .notNull()
      .references(() => copyFollows.id, { onDelete: "cascade" }),
    followerPubkey: varchar("follower_pubkey", { length: 128 }).notNull(),
    leaderPubkey: varchar("leader_pubkey", { length: 128 }).notNull(),
    label: varchar("label", { length: 64 }),
    allocationPct: integer("allocation_pct").notNull(),
    status: varchar("status", { length: 16 })
      .$type<"active" | "paused">()
      .default("active")
      .notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    sourceIdx: uniqueIndex("copy_follow_snapshots_source_idx").on(
      t.sourceFollowId,
    ),
    followerIdx: index("copy_follow_snapshots_follower_idx").on(
      t.followerPubkey,
    ),
    leaderIdx: index("copy_follow_snapshots_leader_idx").on(t.leaderPubkey),
  }),
);

// ---------------------------------------------------------------------------
// alerts
// ---------------------------------------------------------------------------

export const alertSubscriptions = pgTable("alert_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // User's Bulk account pubkey — what the account-WS subscriber uses
  // to open the subscription. Null until the user connects a wallet.
  userPubkey: varchar("user_pubkey", { length: 64 }),
  // Channels the user wants — array of: 'push' | 'email' | 'telegram'
  channels: jsonb("channels").notNull(),
  // Stored only after the user links the KLUB bot. Required for Telegram delivery.
  telegramChatId: varchar("telegram_chat_id", { length: 64 }),
  // Tier thresholds (default [0.25, 0.10, 0.03]) — user may widen/tighten
  bufferTiers: jsonb("buffer_tiers").default([0.25, 0.1, 0.03]).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // e.g. "BTC-USD" — the position this alert was about
    symbol: varchar("symbol", { length: 32 }).notNull(),
    tier: real("tier").notNull(), // 0.25 | 0.10 | 0.03
    channel: varchar("channel", { length: 16 }).notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    // null if delivery succeeded; error string otherwise
    error: text("error"),
  },
  (t) => ({
    userTimeIdx: index("alert_deliveries_user_time_idx").on(
      t.userId,
      t.deliveredAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// journal
// ---------------------------------------------------------------------------

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 'paper' for testnet practice, 'live' for real (future)
    mode: varchar("mode", { length: 16 }).notNull(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    side: varchar("side", { length: 5 }).notNull(),
    entryPrice: real("entry_price").notNull(),
    sizeBase: real("size_base").notNull(),
    leverage: real("leverage").notNull(),
    entryReason: text("entry_reason").notNull(),
    exitPrice: real("exit_price"),
    exitReason: text("exit_reason"),
    realizedPnlUsd: real("realized_pnl_usd"),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("journal_user_idx").on(t.userId),
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
  readonly purpose: "copy-trade" | "liquidation-defense" | "basis-vault";
  readonly symbols: readonly string[] | "all";
  /** Canonical decimal strings; never authoritative JavaScript floats. */
  readonly maxNotionalUsd: string;
  readonly maxLeverage: string;
  readonly allowedActions: readonly (
    | "placeOrder"
    | "cancelOrder"
    | "reducePosition"
  )[];
}

// ---------------------------------------------------------------------------
// Security identity, audit, idempotency, and financial workflow state
// ---------------------------------------------------------------------------

/** Canonical Privy identity. Wallet ownership is resolved server-side. */
export const privyAccounts = pgTable("privy_accounts", {
  privyUserId: varchar("privy_user_id", { length: 128 }).primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastAuthenticatedAt: timestamp("last_authenticated_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

export const privyWallets = pgTable(
  "privy_wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    privyUserId: varchar("privy_user_id", { length: 128 })
      .notNull()
      .references(() => privyAccounts.privyUserId, { onDelete: "cascade" }),
    address: varchar("address", { length: 128 }).notNull(),
    chain: varchar("chain", { length: 16 }).notNull(),
    firstVerifiedAt: timestamp("first_verified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
  },
  (t) => ({
    userWalletUnique: uniqueIndex("privy_wallets_user_address_idx").on(
      t.privyUserId,
      t.address,
    ),
    addressIdx: index("privy_wallets_address_idx").on(t.address),
  }),
);

/** Fixed-window counters. Redis may accelerate these; Postgres is durable. */
export const apiRateLimits = pgTable("api_rate_limits", {
  key: varchar("key", { length: 256 }).primaryKey(),
  count: integer("count").default(0).notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/** Append-only security record. Migration triggers reject UPDATE and DELETE. */
export const securityAuditEvents = pgTable(
  "security_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chainKey: varchar("chain_key", { length: 128 }).notNull(),
    principalId: varchar("principal_id", { length: 128 }),
    sessionId: varchar("session_id", { length: 128 }),
    action: varchar("action", { length: 96 }).notNull(),
    resource: varchar("resource", { length: 128 }),
    decision: varchar("decision", { length: 16 })
      .$type<"allowed" | "denied" | "error">()
      .notNull(),
    reasonCodes: jsonb("reason_codes").default([]).notNull(),
    correlationId: uuid("correlation_id").notNull(),
    previousHash: varchar("previous_hash", { length: 64 }),
    eventHash: varchar("event_hash", { length: 64 }).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    eventHashIdx: uniqueIndex("security_audit_events_hash_idx").on(t.eventHash),
    principalTimeIdx: index("security_audit_events_principal_time_idx").on(
      t.principalId,
      t.createdAt,
    ),
    correlationIdx: index("security_audit_events_correlation_idx").on(
      t.correlationId,
    ),
  }),
);

/** Serialized head prevents two concurrent writers from forking an audit chain. */
export const securityAuditHeads = pgTable("security_audit_heads", {
  chainKey: varchar("chain_key", { length: 128 }).primaryKey(),
  eventHash: varchar("event_hash", { length: 64 }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: varchar("scope", { length: 64 }).notNull(),
    key: varchar("key", { length: 192 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<"processing" | "completed" | "failed">()
      .default("processing")
      .notNull(),
    responseCode: integer("response_code"),
    responseBody: jsonb("response_body"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    scopeKeyUnique: uniqueIndex("idempotency_records_scope_key_idx").on(
      t.scope,
      t.key,
    ),
    expiryIdx: index("idempotency_records_expiry_idx").on(t.expiresAt),
  }),
);

export const orderIntents = pgTable(
  "order_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    privyUserId: varchar("privy_user_id", { length: 128 })
      .notNull()
      .references(() => privyAccounts.privyUserId),
    accountId: varchar("account_id", { length: 128 }).notNull(),
    marketId: varchar("market_id", { length: 64 }).notNull(),
    side: varchar("side", { length: 4 }).$type<"buy" | "sell">().notNull(),
    orderType: varchar("order_type", { length: 8 })
      .$type<"market" | "limit">()
      .notNull(),
    quantity: varchar("quantity", { length: 80 }).notNull(),
    limitPrice: varchar("limit_price", { length: 80 }),
    reduceOnly: boolean("reduce_only").default(false).notNull(),
    maxSlippageBps: integer("max_slippage_bps").notNull(),
    network: varchar("network", { length: 32 }).notNull(),
    nonce: varchar("nonce", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 192 }).notNull(),
    status: varchar("status", { length: 32 })
      .$type<
        | "CREATED"
        | "VALIDATED"
        | "POLICY_APPROVED"
        | "SUBMISSION_PENDING"
        | "SUBMITTED"
        | "ACKNOWLEDGED"
        | "PARTIALLY_FILLED"
        | "FILLED"
        | "REJECTED"
        | "EXPIRED"
        | "CANCEL_PENDING"
        | "CANCELLED"
        | "RECONCILIATION_REQUIRED"
        | "MANUAL_REVIEW"
      >()
      .default("CREATED")
      .notNull(),
    venueOrderId: varchar("venue_order_id", { length: 128 }),
    correlationId: uuid("correlation_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    idempotencyUnique: uniqueIndex("order_intents_idempotency_idx").on(
      t.idempotencyKey,
    ),
    nonceUnique: uniqueIndex("order_intents_account_nonce_idx").on(
      t.accountId,
      t.nonce,
      t.network,
    ),
    statusIdx: index("order_intents_status_idx").on(t.status, t.updatedAt),
  }),
);

export const orderStateTransitions = pgTable(
  "order_state_transitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderIntentId: uuid("order_intent_id")
      .notNull()
      .references(() => orderIntents.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    fromStatus: varchar("from_status", { length: 32 }),
    toStatus: varchar("to_status", { length: 32 }).notNull(),
    reasonCode: varchar("reason_code", { length: 96 }),
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    sequenceUnique: uniqueIndex("order_state_transitions_sequence_idx").on(
      t.orderIntentId,
      t.sequence,
    ),
  }),
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
    aggregateId: varchar("aggregate_id", { length: 128 }).notNull(),
    eventType: varchar("event_type", { length: 96 }).notNull(),
    eventVersion: integer("event_version").default(1).notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 16 })
      .$type<"pending" | "publishing" | "published" | "dead">()
      .default("pending")
      .notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedBy: varchar("locked_by", { length: 128 }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 96 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pendingIdx: index("outbox_events_pending_idx").on(t.status, t.availableAt),
  }),
);

export const reconciliationItems = pgTable(
  "reconciliation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }).notNull(),
    localVersion: varchar("local_version", { length: 128 }),
    venueVersion: varchar("venue_version", { length: 128 }),
    difference: jsonb("difference").notNull(),
    resolutionStatus: varchar("resolution_status", { length: 24 })
      .$type<"open" | "rechecking" | "resolved" | "manual_review">()
      .default("open")
      .notNull(),
    correlationId: uuid("correlation_id").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    entityIdx: index("reconciliation_items_entity_idx").on(
      t.entityType,
      t.entityId,
    ),
    openIdx: index("reconciliation_items_open_idx").on(
      t.resolutionStatus,
      t.detectedAt,
    ),
  }),
);

export const faucetClaims = pgTable(
  "faucet_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    faucet: varchar("faucet", { length: 32 }).notNull(),
    wallet: varchar("wallet", { length: 128 }).notNull(),
    mint: varchar("mint", { length: 128 }).notNull(),
    amountBaseUnits: varchar("amount_base_units", { length: 80 }).notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    transactionSignature: varchar("transaction_signature", { length: 128 }),
    status: varchar("status", { length: 16 })
      .$type<"processing" | "confirmed" | "failed">()
      .default("processing")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    windowUnique: uniqueIndex("faucet_claims_window_idx").on(
      t.faucet,
      t.wallet,
      t.mint,
      t.windowStartedAt,
    ),
    walletTimeIdx: index("faucet_claims_wallet_time_idx").on(
      t.wallet,
      t.createdAt,
    ),
  }),
);
