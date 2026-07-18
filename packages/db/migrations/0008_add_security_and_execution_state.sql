CREATE TABLE IF NOT EXISTS "privy_accounts" (
  "privy_user_id" varchar(128) PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_authenticated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "privy_wallets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "privy_user_id" varchar(128) NOT NULL REFERENCES "privy_accounts"("privy_user_id") ON DELETE cascade,
  "address" varchar(128) NOT NULL,
  "chain" varchar(16) NOT NULL,
  "first_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "unlinked_at" timestamp with time zone,
  CONSTRAINT "privy_wallets_chain_check" CHECK ("chain" IN ('solana'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "privy_wallets_user_address_idx" ON "privy_wallets" ("privy_user_id", "address");
CREATE INDEX IF NOT EXISTS "privy_wallets_address_idx" ON "privy_wallets" ("address");
CREATE UNIQUE INDEX IF NOT EXISTS "privy_wallets_active_address_idx" ON "privy_wallets" ("address") WHERE "unlinked_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_rate_limits" (
  "key" varchar(256) PRIMARY KEY NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "api_rate_limits_count_check" CHECK ("count" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chain_key" varchar(128) NOT NULL,
  "principal_id" varchar(128),
  "session_id" varchar(128),
  "action" varchar(96) NOT NULL,
  "resource" varchar(128),
  "decision" varchar(16) NOT NULL,
  "reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "correlation_id" uuid NOT NULL,
  "previous_hash" varchar(64),
  "event_hash" varchar(64) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "security_audit_events_decision_check" CHECK ("decision" IN ('allowed', 'denied', 'error'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "security_audit_events_hash_idx" ON "security_audit_events" ("event_hash");
CREATE INDEX IF NOT EXISTS "security_audit_events_principal_time_idx" ON "security_audit_events" ("principal_id", "created_at");
CREATE INDEX IF NOT EXISTS "security_audit_events_correlation_idx" ON "security_audit_events" ("correlation_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "security_audit_heads" (
  "chain_key" varchar(128) PRIMARY KEY NOT NULL,
  "event_hash" varchar(64),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION klub_reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_events is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS security_audit_events_append_only ON "security_audit_events";
CREATE TRIGGER security_audit_events_append_only
  BEFORE UPDATE OR DELETE ON "security_audit_events"
  FOR EACH ROW EXECUTE FUNCTION klub_reject_audit_mutation();
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "idempotency_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scope" varchar(64) NOT NULL,
  "key" varchar(192) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'processing' NOT NULL,
  "response_code" integer,
  "response_body" jsonb,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "idempotency_records_status_check" CHECK ("status" IN ('processing', 'completed', 'failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_scope_key_idx" ON "idempotency_records" ("scope", "key");
CREATE INDEX IF NOT EXISTS "idempotency_records_expiry_idx" ON "idempotency_records" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_intents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "privy_user_id" varchar(128) NOT NULL REFERENCES "privy_accounts"("privy_user_id"),
  "account_id" varchar(128) NOT NULL,
  "market_id" varchar(64) NOT NULL,
  "side" varchar(4) NOT NULL,
  "order_type" varchar(8) NOT NULL,
  "quantity" varchar(80) NOT NULL,
  "limit_price" varchar(80),
  "reduce_only" boolean DEFAULT false NOT NULL,
  "max_slippage_bps" integer NOT NULL,
  "network" varchar(32) NOT NULL,
  "nonce" varchar(128) NOT NULL,
  "idempotency_key" varchar(192) NOT NULL,
  "status" varchar(32) DEFAULT 'CREATED' NOT NULL,
  "venue_order_id" varchar(128),
  "correlation_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "order_intents_side_check" CHECK ("side" IN ('buy', 'sell')),
  CONSTRAINT "order_intents_type_check" CHECK ("order_type" IN ('market', 'limit')),
  CONSTRAINT "order_intents_limit_check" CHECK (("order_type" = 'market' AND "limit_price" IS NULL) OR ("order_type" = 'limit' AND "limit_price" IS NOT NULL)),
  CONSTRAINT "order_intents_quantity_check" CHECK ("quantity" ~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$' AND "quantity"::numeric > 0),
  CONSTRAINT "order_intents_slippage_check" CHECK ("max_slippage_bps" BETWEEN 0 AND 1000),
  CONSTRAINT "order_intents_status_check" CHECK ("status" IN ('CREATED','VALIDATED','POLICY_APPROVED','SUBMISSION_PENDING','SUBMITTED','ACKNOWLEDGED','PARTIALLY_FILLED','FILLED','REJECTED','EXPIRED','CANCEL_PENDING','CANCELLED','RECONCILIATION_REQUIRED','MANUAL_REVIEW'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "order_intents_idempotency_idx" ON "order_intents" ("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "order_intents_account_nonce_idx" ON "order_intents" ("account_id", "nonce", "network");
CREATE INDEX IF NOT EXISTS "order_intents_status_idx" ON "order_intents" ("status", "updated_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_state_transitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_intent_id" uuid NOT NULL REFERENCES "order_intents"("id") ON DELETE cascade,
  "sequence" integer NOT NULL,
  "from_status" varchar(32),
  "to_status" varchar(32) NOT NULL,
  "reason_code" varchar(96),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "order_state_transitions_sequence_check" CHECK ("sequence" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "order_state_transitions_sequence_idx" ON "order_state_transitions" ("order_intent_id", "sequence");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "aggregate_type" varchar(64) NOT NULL,
  "aggregate_id" varchar(128) NOT NULL,
  "event_type" varchar(96) NOT NULL,
  "event_version" integer DEFAULT 1 NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_by" varchar(128),
  "locked_until" timestamp with time zone,
  "last_error_code" varchar(96),
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "outbox_events_status_check" CHECK ("status" IN ('pending', 'publishing', 'published', 'dead')),
  CONSTRAINT "outbox_events_attempts_check" CHECK ("attempts" >= 0)
);
CREATE INDEX IF NOT EXISTS "outbox_events_pending_idx" ON "outbox_events" ("status", "available_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reconciliation_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entity_type" varchar(32) NOT NULL,
  "entity_id" varchar(128) NOT NULL,
  "local_version" varchar(128),
  "venue_version" varchar(128),
  "difference" jsonb NOT NULL,
  "resolution_status" varchar(24) DEFAULT 'open' NOT NULL,
  "correlation_id" uuid NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  CONSTRAINT "reconciliation_items_status_check" CHECK ("resolution_status" IN ('open', 'rechecking', 'resolved', 'manual_review'))
);
CREATE INDEX IF NOT EXISTS "reconciliation_items_entity_idx" ON "reconciliation_items" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "reconciliation_items_open_idx" ON "reconciliation_items" ("resolution_status", "detected_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "faucet_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "faucet" varchar(32) NOT NULL,
  "wallet" varchar(128) NOT NULL,
  "mint" varchar(128) NOT NULL,
  "amount_base_units" varchar(80) NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "transaction_signature" varchar(128),
  "status" varchar(16) DEFAULT 'processing' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "faucet_claims_status_check" CHECK ("status" IN ('processing', 'confirmed', 'failed')),
  CONSTRAINT "faucet_claims_amount_check" CHECK ("amount_base_units" ~ '^[1-9][0-9]*$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "faucet_claims_window_idx" ON "faucet_claims" ("faucet", "wallet", "mint", "window_started_at");
CREATE INDEX IF NOT EXISTS "faucet_claims_wallet_time_idx" ON "faucet_claims" ("wallet", "created_at");
