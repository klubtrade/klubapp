CREATE UNIQUE INDEX IF NOT EXISTS "handles_pubkey_active_unique_idx"
ON "handles" USING btree ("pubkey")
WHERE "revoked_at" IS NULL;
