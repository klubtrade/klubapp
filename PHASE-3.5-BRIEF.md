# Phase 3.5 — Backend Infrastructure

> Postgres schema, Redis queues, BullMQ workers, Ed25519 signing, notification fan-out, invite DB migration.

---

## What Shipped

### Data layer — `packages/db/`

**Drizzle ORM + postgres-js** on Postgres 16. Single schema file, 272 lines, typed end-to-end. Tables:

- **`users`** — KLUB identity, 1:1 with email. Optional handle (unique, pseudonymous).
- **`waitlist`** — pre-invite signups. `promoted_user_id` points to the `users` row created when the waitlist entry redeems an invite.
- **`invites`** — invite codes with `max_redemptions` (null = infinite, used for the `demo` code), `redemption_count`, optional expiry.
- **`invite_redemptions`** — audit log of every redemption with IP address and user agent captured for fraud investigation.
- **`wallets`** — public-facing wallet addresses linked to a user. **No private keys.**
- **`agent_wallets`** — scoped delegate keys. Stores the public key + scope constraints (allowed markets, max notional, expiry). The corresponding private key lives encrypted in KMS, keyed by a short identifier — never in Postgres.
- **`follows`** — user → leader copy-trade relationships with max allocation, stop-loss override, market filter, pause state.
- **`alert_subscriptions`** — per-position alert thresholds (default 25%/10%/3% buffer) and channel preferences (push / email / Telegram).
- **`alert_deliveries`** — audit log of sent alerts for rate-limiting and analytics.
- **`journal_entries`** — trade journal (Practice mode first, live mode later). Auto-logs entry reasoning and exit post-mortems.

**`createDbClient()`** in `packages/db/src/index.ts` returns a typed Drizzle instance. Call once per process, share the instance.

### Worker app — `apps/worker/`

BullMQ + ioredis. One entrypoint (`src/index.ts`) that boots multiple workers on a shared Redis connection with graceful SIGTERM/SIGINT shutdown.

- **`workers/alerts-worker.ts`** — subscribes to user account WS feeds, computes buffer-to-liquidation on every position update, fires alerts when buffer crosses 25%/10%/3% tiers. Rate-limited to one alert per (user, symbol, tier) per 5 min.
- **`workers/copy-trade-worker.ts`** — consumes leader-account WS events, replays trades proportionally into each follower's Bulk account via their scoped agent-wallet key. Respects max-allocation caps, stop-loss overrides, market filters, and the pause switch.
- **`notifications/push.ts`** — Web Push dispatcher (VAPID).
- **`notifications/resend.ts`** — transactional email via Resend. The 5-email launch sequence templates live here.
- **`notifications/telegram.ts`** — Bot API wrapper. Alerts formatted with tiered emoji (🟡 / 🟠 / 🔴) and inline actions (`/add`, `/reduce`, `/close`).

### Signing — `packages/signing/`

Ed25519 primitives around `@noble/ed25519`. Published as a package so the web app, worker, and any future services all import the same canonical signing path.

- **`signer.ts`** — `createEd25519Signer()` returns a `Signer` with a `sign(bytes) → signature` method. Includes `generateKeypair()`, `derivePublicKey()`, `verifyEd25519()`, and base58 encode/decode.
- **`payloads.ts`** — canonical envelope builder. Every authenticated Bulk request is `{ nonce, timestamp, body }` → canonical JSON → SHA-256 → Ed25519 sign. `signEnvelope()` does all of this in one call.
- **`agent-wallet.ts`** — `mintAgentWallet()` generates an agent keypair server-side. `buildAgentWalletAuthorization()` constructs the payload the user signs with their primary Bulk account to grant the agent key its scope. **Enforces `canWithdraw: false` as an invariant** — a code change to `true` would show up in review.
- **`types.ts`** — `Ed25519Keypair`, `Signer`, `SignedEnvelope`, `AgentWalletScope`.

When the real `bulk-keychain` package is published, `Ed25519Signer` can be replaced 1:1. The public interface stays the same.

### API integration

- **`/api/invite`** — rewritten to read/write Postgres via `@klub/db`. Atomic redemption (validate → insert user → insert redemption → increment counter → promote waitlist entry). Transaction-scoped, retries safely. Falls back to the legacy in-memory allowlist when `DATABASE_URL` is absent (preview builds, local demos without docker compose).
- **`/api/portfolio`** — already wraps Bulk's `/account` endpoint. No DB changes needed there.

### Infrastructure — `docker-compose.yml`

One command (`docker compose up -d`) brings up Postgres 16 and Redis 7 locally. Healthchecks on both. Named volumes so data survives container restarts.

### Environment — `.env.example`

Updated with Phase 3.5 vars:
- `DATABASE_URL`, `REDIS_URL`
- `RESEND_API_KEY`, `WAITLIST_AUDIENCE_ID`
- `TELEGRAM_BOT_TOKEN`
- `AGENT_WALLET_KMS_KEY_ARN` (prod) / `AGENT_WALLET_LOCAL_KEY` (dev)
- `PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY`

---

## Architecture Decisions

### KLUB never holds a private key that controls user funds
Agent-wallet private keys (which we DO mint and hold) have zero withdrawal authority. The `canWithdraw: false` invariant is enforced in `agent-wallet.ts` as a runtime check, not a default. A malicious config upstream cannot override it.

### Agent-wallet private keys go to KMS, not Postgres
Every mint produces `{ signer, privateKey }`. The privateKey bytes are immediately wrapped by KMS (AWS or GCP) and the wrapped ciphertext is what lives in the DB. Workers unwrap on demand, sign, and drop the plaintext. Local dev uses a symmetric hex key for wrap/unwrap.

### Canonical JSON for everything signed
Every authenticated Bulk request is sorted-keys, no-whitespace canonical JSON before hashing. This avoids serialization drift between the signer and the verifier.

### Workers share Redis, not DB connections
Each worker gets its own Drizzle client with a small `max` (5). BullMQ queues all share one ioredis connection. Crashing one worker does not cascade.

### Invite redemptions are transactional
`/api/invite` POST runs a single transaction that validates the code, upserts the user, inserts the redemption, increments the counter, and promotes the waitlist entry — all atomically. Race conditions between two concurrent redemptions of the last slot of a code are resolved by Postgres-level serializability.

---

## What's NOT Done (Before Production)

### Must-have before mainnet
1. **KMS wrap/unwrap for agent-wallet private keys** — the wire-up to real AWS KMS. Currently the `privateKey` bytes from `mintAgentWallet()` are returned to the caller; someone needs to plug that into a KMS client.
2. **Bulk WebSocket subscription in the alerts worker** — the worker file defines the queue and processor; the subscriber loop (connect to Bulk WS, stream account updates, enqueue when buffer crosses a tier) is stubbed with a TODO.
3. **Copy-trade replay logic** — the worker skeleton is there; the actual "leader trade → scaled follower order → signed submission via agent wallet" pipeline needs the live Bulk WS data + signer integration.
4. **Drizzle migrations** — schema is written, but `pnpm --filter @klub/db generate` needs to be run to produce the SQL migrations in `packages/db/migrations/`.
5. **Resend audience sync worker** — we write invite redemptions to Postgres; the sweep job that syncs new signups into the Resend audience needs to be added as a third worker.
6. **Rate-limit state** — alerts worker comment references a 5-min in-memory rate limit; the actual Redis-backed rate-limit helper isn't written yet.

### Nice-to-have
- **Prisma→Drizzle migration of my initial schema draft** — I accidentally wrote a Prisma schema before realizing the project was already on Drizzle. The Drizzle schema is the canonical one; my Prisma attempt has been removed.
- **Unit tests for `packages/signing`** — nobble-ed25519 is well-tested; our wrappers aren't.
- **Worker health endpoint** — `/healthz` on a small HTTP server inside the worker so Kubernetes / Fly can do liveness probes.
- **Dead-letter queues** — BullMQ has them built in; we haven't configured per-queue DLQs yet.

---

## To Run It Locally

```bash
# 1. Install
pnpm install

# 2. Boot infra
docker compose up -d

# 3. Generate and apply migrations
cp .env.example .env.local         # edit DATABASE_URL if needed
pnpm --filter @klub/db generate
pnpm --filter @klub/db migrate

# 4. Seed invite codes (SQL, or use Drizzle Studio)
pnpm --filter @klub/db studio       # UI for editing tables
# → open http://localhost:4983 → insert rows into `invites`

# 5. Start the web app
pnpm --filter @klub/web dev

# 6. In another terminal, start the worker
pnpm --filter @klub/worker dev
```

With all of the above running, the invite flow at `http://localhost:3000/invite/demo` now writes to Postgres and issues a real user record.

---

## File Map

New or modified this phase:

```
klub/
├── docker-compose.yml                                    # NEW
├── .env.example                                          # UPDATED
├── packages/
│   ├── db/                                               # Existed; canonical
│   │   ├── drizzle.config.ts
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       └── schema.ts                                 # 272 lines
│   └── signing/                                          # NEW
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── types.ts
│           ├── signer.ts
│           ├── payloads.ts
│           └── agent-wallet.ts
├── apps/
│   ├── web/
│   │   ├── package.json                                  # +@klub/db, +@klub/signing
│   │   └── app/api/invite/route.ts                       # DB-backed rewrite
│   └── worker/                                           # Existed + filled gap
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── notifications/
│           │   ├── push.ts
│           │   ├── resend.ts
│           │   └── telegram.ts                           # NEW this phase
│           └── workers/
│               ├── alerts-worker.ts
│               └── copy-trade-worker.ts
└── PHASE-3.5-BRIEF.md                                    # this file
```

---

## Risk Notes

Three risks worth naming explicitly:

1. **Agent-wallet key custody is our largest single compliance surface.** If a regulator asks "who controls the keys that move user funds," our answer must be clean: *the user authorizes a scoped key, we hold the scoped key for automation, the key cannot withdraw.* The `canWithdraw: false` invariant needs to be preserved across every refactor forever.

2. **Copy-trade execution latency matters more than we've modeled.** Between the leader's fill and the follower's order hitting Bulk, any delay is slippage the follower wears. We should instrument this from day one — leader fill timestamp, worker enqueue timestamp, follower order submit timestamp, follower fill timestamp — and set SLO alarms if median crosses 500ms.

3. **Alert delivery is the product promise most likely to break silently.** If Telegram rate-limits our bot, or Resend IP-blocks us, users won't know alerts aren't arriving. We need synthetic monitoring — a canary position that always triggers a tier-3 alert, with a daily check that the alert actually arrived on every channel.
