CREATE TABLE "leaders" (
  "pubkey" varchar(128) PRIMARY KEY NOT NULL,
  "handle" varchar(20),
  "net_pnl_30d_usd" real NOT NULL,
  "unrealized_pnl_usd" real NOT NULL,
  "win_rate" real NOT NULL,
  "closed_trades_count" integer NOT NULL,
  "max_drawdown_usd" real NOT NULL,
  "max_drawdown_pct" real NOT NULL,
  "sharpe_ratio" real NOT NULL,
  "followed_equity_usd" real DEFAULT 0 NOT NULL,
  "fills_last_30d" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "leaders_handle_idx" ON "leaders" ("handle");
