CREATE TABLE "handles" (
	"handle" varchar(30) PRIMARY KEY NOT NULL,
	"pubkey" varchar(128) NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "handles_pubkey_idx" ON "handles" USING btree ("pubkey");
