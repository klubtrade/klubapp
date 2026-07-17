CREATE TABLE IF NOT EXISTS "worker_heartbeats" (
	"worker_name" varchar(64) PRIMARY KEY NOT NULL,
	"instance_id" varchar(128) NOT NULL,
	"status" varchar(16) DEFAULT 'starting' NOT NULL,
	"active_copy_follows" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "copy_follow_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_follow_id" uuid NOT NULL,
	"follower_pubkey" varchar(128) NOT NULL,
	"leader_pubkey" varchar(128) NOT NULL,
	"label" varchar(64),
	"allocation_pct" integer NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "copy_follow_snapshots" ADD CONSTRAINT "copy_follow_snapshots_source_follow_id_copy_follows_id_fk" FOREIGN KEY ("source_follow_id") REFERENCES "public"."copy_follows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "copy_follow_snapshots_source_idx" ON "copy_follow_snapshots" USING btree ("source_follow_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "copy_follow_snapshots_follower_idx" ON "copy_follow_snapshots" USING btree ("follower_pubkey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "copy_follow_snapshots_leader_idx" ON "copy_follow_snapshots" USING btree ("leader_pubkey");
