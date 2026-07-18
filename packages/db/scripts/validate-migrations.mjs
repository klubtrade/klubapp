import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationsDir = join(root, "migrations");
const names = (await readdir(migrationsDir))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

if (names.length === 0) throw new Error("no migrations found");

const migrations = await Promise.all(
  names.map(async (name) => ({
    name,
    sql: await readFile(join(migrationsDir, name), "utf8"),
  })),
);

await validateEmptyDatabase();
await validatePriorSchemaUpgrade();

async function validateEmptyDatabase() {
  const db = new PGlite();
  try {
    for (const migration of migrations) await executeMigration(db, migration);
    await assertSecuritySchema(db);
  } finally {
    await db.close();
  }
}

async function validatePriorSchemaUpgrade() {
  const db = new PGlite();
  try {
    for (const migration of migrations.slice(0, -1)) {
      await executeMigration(db, migration);
    }
    const latest = migrations.at(-1);
    if (!latest) throw new Error("latest migration missing");
    await executeMigration(db, latest);
    // The latest migration deliberately uses IF NOT EXISTS and replaces its
    // trigger so a Railway release retry is safe.
    await executeMigration(db, latest);
    await assertSecuritySchema(db);
  } finally {
    await db.close();
  }
}

async function executeMigration(db, migration) {
  const statements = migration.sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    try {
      await db.exec(statement);
    } catch (cause) {
      throw new Error(`migration ${migration.name} failed`, { cause });
    }
  }
}

async function assertSecuritySchema(db) {
  const required = [
    "privy_accounts",
    "privy_wallets",
    "api_rate_limits",
    "security_audit_events",
    "security_audit_heads",
    "idempotency_records",
    "order_intents",
    "order_state_transitions",
    "outbox_events",
    "reconciliation_items",
    "faucet_claims",
  ];
  const result = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
  );
  const found = new Set(result.rows.map((row) => row.tablename));
  for (const table of required) {
    if (!found.has(table)) throw new Error(`required table ${table} missing`);
  }

  const correlation = "00000000-0000-4000-8000-000000000001";
  await db.exec(`
    INSERT INTO security_audit_events
      (chain_key, action, decision, correlation_id, event_hash)
    VALUES ('system', 'migration.test', 'allowed', '${correlation}',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  `);
  let mutationRejected = false;
  try {
    await db.exec("UPDATE security_audit_events SET action = 'tampered'");
  } catch {
    mutationRejected = true;
  }
  if (!mutationRejected)
    throw new Error("audit append-only trigger did not reject update");

  await db.exec(`
    INSERT INTO privy_accounts (privy_user_id) VALUES ('did:privy:migration-test')
  `);
  let invalidOrderRejected = false;
  try {
    await db.exec(`
      INSERT INTO order_intents
        (privy_user_id, account_id, market_id, side, order_type, quantity,
         max_slippage_bps, network, nonce, idempotency_key, correlation_id,
         expires_at)
      VALUES
        ('did:privy:migration-test', 'account', 'BTC-USD', 'buy', 'market',
         '-1', 10, 'bulk-testnet', 'nonce', 'idempotency', '${correlation}',
         now() + interval '1 minute')
    `);
  } catch {
    invalidOrderRejected = true;
  }
  if (!invalidOrderRejected)
    throw new Error("invalid quantity constraint did not fire");
}
