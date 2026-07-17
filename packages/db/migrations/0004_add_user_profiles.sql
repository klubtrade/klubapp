CREATE TABLE "user_profiles" (
	"pubkey" varchar(128) PRIMARY KEY NOT NULL,
	"handle" varchar(30),
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"risk_profile" varchar(16) DEFAULT 'balanced' NOT NULL,
	"preferred_trade_mode" varchar(16) DEFAULT 'simple' NOT NULL,
	"default_copy_alloc_pct" integer DEFAULT 20 NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "user_profiles_handle_idx" ON "user_profiles" USING btree ("handle");
