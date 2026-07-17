CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"handle" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email_verified_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"signup_country" varchar(2)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_handle_idx" ON "users" USING btree ("handle");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_user_id" uuid,
	"source" varchar(32)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_promoted_user_id_users_id_fk" FOREIGN KEY ("promoted_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_email_idx" ON "waitlist" USING btree ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invites" (
	"code" varchar(64) PRIMARY KEY NOT NULL,
	"label" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"max_redemptions" integer,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invite_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_code_invites_code_fk" FOREIGN KEY ("code") REFERENCES "public"."invites"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"address" varchar(64) NOT NULL,
	"chain" varchar(32) NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"primary" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallets_address_idx" ON "wallets" USING btree ("address");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallets_user_address_idx" ON "wallets" USING btree ("user_id","address");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" varchar(128) NOT NULL,
	"scope" jsonb NOT NULL,
	"label" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_wallets" ADD CONSTRAINT "agent_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_wallets_user_idx" ON "agent_wallets" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_wallets_pubkey_idx" ON "agent_wallets" USING btree ("public_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_id" uuid NOT NULL,
	"leader_handle" varchar(20) NOT NULL,
	"max_allocation_pct" integer NOT NULL,
	"stop_override_pct" real,
	"copy_all_symbols" boolean DEFAULT true NOT NULL,
	"agent_wallet_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follows" ADD CONSTRAINT "follows_agent_wallet_id_agent_wallets_id_fk" FOREIGN KEY ("agent_wallet_id") REFERENCES "public"."agent_wallets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follows_follower_idx" ON "follows" USING btree ("follower_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "follows_leader_idx" ON "follows" USING btree ("leader_handle");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "follows_follower_leader_idx" ON "follows" USING btree ("follower_id","leader_handle");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"user_pubkey" varchar(64),
	"channels" jsonb NOT NULL,
	"telegram_chat_id" varchar(64),
	"buffer_tiers" jsonb DEFAULT '[0.25,0.1,0.03]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_subscriptions" ADD CONSTRAINT "alert_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "alert_subscriptions"
ADD COLUMN IF NOT EXISTS "telegram_chat_id" varchar(64);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"tier" real NOT NULL,
	"channel" varchar(16) NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_deliveries_user_time_idx" ON "alert_deliveries" USING btree ("user_id","delivered_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" varchar(16) NOT NULL,
	"symbol" varchar(32) NOT NULL,
	"side" varchar(5) NOT NULL,
	"entry_price" real NOT NULL,
	"size_base" real NOT NULL,
	"leverage" real NOT NULL,
	"entry_reason" text NOT NULL,
	"exit_price" real,
	"exit_reason" text,
	"realized_pnl_usd" real,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_user_idx" ON "journal_entries" USING btree ("user_id");
