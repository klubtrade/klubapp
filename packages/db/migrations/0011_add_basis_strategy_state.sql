CREATE TABLE IF NOT EXISTS "basis_strategy_controls" (
  "source_account" varchar(128) PRIMARY KEY NOT NULL,
  "paused" boolean DEFAULT false NOT NULL,
  "pause_reason" text,
  "consecutive_errors" integer DEFAULT 0 NOT NULL,
  "peak_equity_usd" real DEFAULT 0 NOT NULL,
  "last_equity_usd" real DEFAULT 0 NOT NULL,
  "last_reconciled_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "basis_strategy_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_account" varchar(128) NOT NULL,
  "state" varchar(32) NOT NULL,
  "long_symbol" varchar(32) NOT NULL,
  "short_symbol" varchar(32) NOT NULL,
  "long_size" real NOT NULL,
  "short_size" real NOT NULL,
  "target_notional_usd" real NOT NULL,
  "expected_annual_pct" real NOT NULL,
  "order_ids" jsonb,
  "venue_response" jsonb,
  "risk_snapshot" jsonb NOT NULL,
  "error" text,
  "opened_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "basis_strategy_runs_state_check" CHECK ("state" IN ('discovered','validated','submitting','open','closing','closed','reconciliation_required','paused','failed'))
);
CREATE INDEX IF NOT EXISTS "basis_strategy_runs_account_state_idx" ON "basis_strategy_runs" ("source_account", "state", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leader_candidates" (
  "pubkey" varchar(128) PRIMARY KEY NOT NULL,
  "source" varchar(32) DEFAULT 'trade_stream' NOT NULL,
  "observed_at" timestamp with time zone NOT NULL,
  "last_indexed_at" timestamp with time zone,
  "index_failures" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
