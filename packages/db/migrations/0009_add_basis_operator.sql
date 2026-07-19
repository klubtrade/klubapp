CREATE TABLE IF NOT EXISTS "basis_operator_states" (
  "source_account" varchar(128) PRIMARY KEY NOT NULL,
  "high_water_pnl_raw" bigint DEFAULT 0 NOT NULL,
  "credited_yield_raw" bigint DEFAULT 0 NOT NULL,
  "source_timestamp" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "basis_yield_credits" (
  "idempotency_key" varchar(180) PRIMARY KEY NOT NULL,
  "source_account" varchar(128) NOT NULL,
  "owner" varchar(128) NOT NULL,
  "position" varchar(128) NOT NULL,
  "amount_raw" bigint NOT NULL,
  "source_pnl_raw" bigint NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "signature" varchar(128),
  "wire_transaction" text,
  "error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "basis_yield_credits_source_idx"
  ON "basis_yield_credits" ("source_account", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "basis_yield_credits_signature_idx"
  ON "basis_yield_credits" ("signature") WHERE "signature" IS NOT NULL;
