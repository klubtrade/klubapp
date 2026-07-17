CREATE TABLE IF NOT EXISTS "copy_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_pubkey" varchar(128) NOT NULL,
	"leader_pubkey" varchar(128) NOT NULL,
	"label" varchar(64),
	"allocation_pct" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "copy_follows_follower_idx" ON "copy_follows" USING btree ("follower_pubkey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "copy_follows_leader_idx" ON "copy_follows" USING btree ("leader_pubkey");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "copy_follows_follower_leader_idx" ON "copy_follows" USING btree ("follower_pubkey","leader_pubkey");
