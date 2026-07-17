# KLUB — Deployment Guide

> Local dev in 10 minutes. Production deploy the first time in ~2 hours.

Two paths:
- **Local** — run the full stack on your machine (web + worker + Postgres + Redis)
- **Global / Production** — ship to the public internet (Vercel + Railway + Neon + Upstash + Resend + Cloudflare)

---

## 1. Local Development

### Prerequisites

Install these once:

```bash
# Node 20+  (check: node --version)
# pnpm 9+   (install: npm i -g pnpm)
# Docker Desktop (download from docker.com)
# git
```

Verify:

```bash
node --version    # v20.x or later
pnpm --version    # 9.x or later
docker --version  # 27.x or later
```

### Step-by-step

```bash
# 1. Clone + install
git clone https://github.com/your-org/klub.git
cd klub
pnpm install

# 2. Boot Postgres + Redis via Docker
docker compose up -d
docker compose ps    # both services should say "healthy" after ~10s

# 3. Copy the example env file
cp .env.example .env.local
# Leave DATABASE_URL and REDIS_URL matching docker-compose defaults.
# Leave NEXT_PUBLIC_BULK_WS_URL UNSET — the app runs in demo mode
# locally, which is what you want until you have live credentials.

# 4. Generate Drizzle migrations from the schema
pnpm --filter @klub/db generate

# 5. Apply migrations to the local database
pnpm --filter @klub/db migrate

# 6. (Optional) Inspect + seed data via Drizzle Studio
pnpm --filter @klub/db studio    # http://localhost:4983
# → use the UI to insert rows into `invites` for testing the invite flow

# 7. Start the web app
pnpm --filter @klub/web dev      # http://localhost:3000

# 8. In another terminal, start the background worker
pnpm --filter @klub/worker dev
```

### What you should see

- `http://localhost:3000` — landing page with scroll fly-ins
- Click **Enter the app** → `/home` dashboard (first visit redirects to `/onboarding`)
- The **Markets** ticker strip on `/home` shows a **Demo** pill and ticks every ~1.8s
- The worker terminal prints `[klub-worker] live · 0 account streams, alerts + copy-trade queues ready`

### Troubleshooting

**"Port 5432 already in use"** — another Postgres is running. Either stop it (`brew services stop postgresql` on macOS) or change the docker-compose port mapping.

**"Module not found @klub/db"** — run `pnpm install` at the repo root, not inside `apps/web/`.

**"DATABASE_URL is not set"** — you skipped `cp .env.example .env.local`. Restart `pnpm dev` after creating it.

**Migrations fail with "permission denied"** — the Postgres user in docker-compose is `klub`, not `postgres`. Check `DATABASE_URL` in your `.env.local`.

**Worker exits immediately with "Missing required env"** — worker needs `DATABASE_URL`. `REDIS_URL` is optional until queue-based alerts/copy execution are enabled. Pass env via `.env.local` or export it inline:
```bash
DATABASE_URL=... pnpm --filter @klub/worker dev
```

---

## 2. Production Deployment

### Architecture at a glance

| Surface | Host | Why |
|---|---|---|
| Web app (Next.js) | Vercel | Zero-config for Next 14, edge network, preview deploys per PR |
| Background worker | Railway | Persistent process — BullMQ needs an always-on host |
| Postgres | Railway Postgres | System of record for handles, profiles, onboarding, follows, alerts |
| Redis | Railway Redis or Upstash | Queues, short-lived cache entries, rate limits, idempotency locks |
| Email | Resend | Transactional + waitlist audiences |
| DNS + SSL | Cloudflare | Free, fast, handles the `klub.trade` domain |
| Monitoring | Sentry + PostHog | Errors + product analytics |
| KMS (Phase 3.5 signing) | AWS KMS | Wraps agent-wallet private keys at rest |

### 2.1 Database — Railway Postgres

1. In Railway, create or open the `klub` project.
2. Add a **Postgres** service.
3. Copy the public `DATABASE_URL` for local migration runs.
4. Attach the same `DATABASE_URL` to the web/worker services through Railway variables.
5. Add `DATABASE_URL` to Vercel Production env vars if the web app remains hosted on Vercel.

Apply the schema from your local machine:

```bash
DATABASE_URL='<prod connection string>' \
  pnpm --filter @klub/db migrate
```

Current migrations include durable onboarding/profile state and one active handle per wallet. Do not deploy production onboarding without running migrations.

### 2.2 Redis — Railway Redis or Upstash

1. Add a Railway Redis service or create an Upstash Redis database.
2. Copy the Redis URL.
3. Set `REDIS_URL` on the worker service.
4. Use Redis for queues, short-lived cache entries, rate limits, and idempotency locks only. Postgres remains authoritative for user state.

### 2.3 Email — Resend

1. Sign up at [resend.com](https://resend.com).
2. Add your sending domain (`klub.trade`). Verify DNS records (SPF, DKIM, DMARC — Resend gives you copy-paste values).
3. Create an API key with `Full access` scope, name it `klub-prod`.
4. Create an Audience called `waitlist`. Copy its ID.

### 2.4 Web app — Vercel

1. Sign up at [vercel.com](https://vercel.com). Connect GitHub.
2. **Import** the `klub` repo.
3. Configure the project:
   - **Framework preset:** Next.js
   - **Root directory:** `apps/web`
   - **Build command:** `cd ../.. && pnpm --filter @klub/web build`
   - **Install command:** `cd ../.. && pnpm install --frozen-lockfile`
   - **Output directory:** `apps/web/.next`
4. **Environment Variables** — add these from `.env.example`:

   | Name | Scope | Notes |
   |---|---|---|
   | `DATABASE_URL` | Production | Railway Postgres URL |
   | `REDIS_URL` | Production | Railway Redis or Upstash URL |
   | `RESEND_API_KEY` | Production | |
   | `WAITLIST_AUDIENCE_ID` | Production | |
   | `NEXT_PUBLIC_BULK_NETWORK` | Production | `mainnet` |
   | `BULK_HTTP_URL` | Production | `https://exchange-api.bulk.trade/api/v1` |
   | `NEXT_PUBLIC_BULK_WS_URL` | Production | `wss://exchange-ws1.bulk.trade` — **flips pages from Demo → Live** |
   | `NEXT_PUBLIC_PRIVY_APP_ID` | Production | From Privy dashboard |
   | `PRIVY_APP_SECRET` | Production | From Privy dashboard |
   | `NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID` | Production | From Coinbase Onramp |
   | `SENTRY_DSN` | Production | |
   | `NEXT_PUBLIC_POSTHOG_KEY` | Production | |

   For `Preview` environment, use staging Railway/Redis URLs and leave `NEXT_PUBLIC_BULK_WS_URL` unset so PRs get Demo mode.

5. **Deploy.** First build ~4 minutes. Subsequent deploys ~90 seconds.

### 2.5 Worker — Railway

The worker runs the Postgres-backed copy-follow scanner with only `DATABASE_URL`. When `REDIS_URL` is present, it also starts the alerts queue consumer, copy-trade queue consumer, and account-stream subscriber.

1. Sign up at [railway.app](https://railway.app).
2. **New Project → Deploy from GitHub repo** → select `klub`.
3. Configure the service:
   - **Root directory:** `/`
   - **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @klub/worker build`
   - **Start command:** `pnpm --filter @klub/worker start`
4. **Environment Variables** (most are the same as Vercel minus the `NEXT_PUBLIC_*` ones, plus worker-specific):

   | Name | Notes |
   |---|---|
   | `DATABASE_URL` | Railway Postgres URL |
   | `REDIS_URL` | Optional until queues are active; Railway Redis or Upstash URL |
   | `BULK_WS_URL` | `wss://exchange-ws1.bulk.trade` — required for real alerts once Redis queues are active |
   | `RESEND_API_KEY` | For email alerts |
   | `TELEGRAM_BOT_TOKEN` | From @BotFather |
   | `AGENT_WALLET_KMS_KEY_ARN` | AWS KMS key ARN (see §2.7) |
   | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` | IAM user scoped to KMS |
   | `PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` |
   | `SENTRY_DSN` | Errors |

5. Deploy. Railway auto-restarts on push to `main`.
6. **Critical:** verify in the Railway logs that you see:
   ```
   [klub-worker] boot
   [copy-follow-scanner] indexed N follows
   [klub-worker] live · copy-follow scanner ready
   ```
   If `REDIS_URL` is configured, you should also see account-stream and queue logs. If the WS state never reaches `open`, check `BULK_WS_URL` and Bulk's integrator docs.

### 2.6 Domain + SSL — Cloudflare

1. Buy `klub.trade` (or use existing) and move DNS to Cloudflare.
2. In Vercel → project settings → Domains → add `klub.trade` and `www.klub.trade`.
3. Vercel shows two CNAME records. Paste them into Cloudflare.
4. Cloudflare → SSL/TLS → set mode to **Full (strict)**. Vercel provisions the cert.
5. Wait 5–10 min for DNS propagation. Verify: `curl -I https://klub.trade`.

### 2.7 KMS — AWS (for agent-wallet keys, Phase 3.5)

The agent-wallet private keys KLUB mints to copy-trade on user behalf must be wrapped at rest. **Not optional — do this before mainnet.**

1. AWS Console → **KMS** → create a symmetric key named `klub-agent-wallets-prod`. Key policy: only the worker's IAM role can `Encrypt` / `Decrypt`.
2. Copy the key ARN. Set as `AGENT_WALLET_KMS_KEY_ARN` on Railway.
3. Create an IAM user with `kms:Encrypt` + `kms:Decrypt` permissions on that key ARN only. Generate access keys. Set `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` on Railway.

**Never** use the `AGENT_WALLET_LOCAL_KEY` (local dev fallback) in production env vars.

### 2.8 Monitoring

**Sentry (errors):**
1. Create projects `klub-web` + `klub-worker` at [sentry.io](https://sentry.io).
2. Add the DSNs to Vercel / Railway env vars.
3. Run `npx @sentry/wizard@latest -i nextjs` in `apps/web`.

**PostHog (product analytics):**
1. Create a project at [posthog.com](https://posthog.com). Add the public key to Vercel.
2. Auto-captures clicks, pageviews, feature-flag exposures.
3. Create funnels:
   - `landing → /home → /quick-trade → trade_confirmed`
   - `/invite/[code] → /onboarding → /home`

**Axiom or Datadog (logs):**
1. Pipe logs from Vercel and Railway. One-click integrations for Axiom on both.
2. Set alerts on:
   - `copy-trade job status = failed` count per hour
   - `[account-sub] ws state = reconnecting` for more than 5 minutes
   - 5xx rate on `/api/*` above 1%

---

## 3. Release Checklist (Every Deploy)

Before pushing to `main`:

- [ ] `pnpm typecheck` passes across all workspaces
- [ ] `pnpm --filter @klub/calc test` green (math must not drift)
- [ ] `pnpm --filter @klub/api-client test` green
- [ ] `pnpm --filter @klub/web build` succeeds locally
- [ ] `.env.example` updated if you added a new env var
- [ ] Drizzle migration diff reviewed (if schema changed)

Before announcing user-visible changes:

- [ ] Test on mobile (375px, 414px, 768px breakpoints)
- [ ] Test with reduced motion (`prefers-reduced-motion: reduce` in devtools)
- [ ] Test empty state of every affected page
- [ ] Click every primary CTA; confirm it routes somewhere useful
- [ ] Confirm the toast fires on the action and is readable
- [ ] Run Lighthouse — target Performance > 85, Accessibility > 95

---

## 4. Rollback Plan

**Web app:** Vercel keeps every deploy forever. Deployments → click previous → **Promote to Production**. Rollback in ~30s.

**Worker:** Railway keeps the last 10 deploys. Service → Deployments → **Rollback**. ~45s.

**Database:** Neon has point-in-time restore for the last 7 days on free tier. Don't run destructive migrations without `BEGIN; ... ROLLBACK;` testing locally first.

**Redis:** BullMQ jobs replay cleanly. If you need to drain a queue fast, open Redis CLI and `DEL klub.alerts:*`.

---

## 5. First-Week Operations

**Day 1:**
- Deploy to production, verify all health checks
- Insert 5 invite codes into the `invites` table (via Drizzle Studio or psql)
- Smoke-test with yourself + 2 founders

**Week 1:**
- Monitor Sentry daily; fix regressions within 24h
- Watch PostHog funnel — where do users drop between `/home` and `/quick-trade`?
- Seed first 3 real leaders (opt-in from your outreach list)
- Send the Bulk schema confirmation email (`docs/bulk-schema-confirmation-email.md`)

**Week 2–4:**
- Gradually increase worker concurrency on copy-trade jobs: 1 → 10 → 100
- Add a synthetic canary position in the alerts subscriber that always triggers a tier-3 alert; daily check that alerts arrive on every channel
- Ship the three blog posts on ProductHunt, Farcaster, and your newsletter

---

## 6. What Will Break First (Priority Watch)

1. **Copy-trade latency.** Leader fills land; followers' signed orders lag. Instrument `leader_fill_ts → worker_enqueue_ts → bulk_ack_ts`; alarm if median crosses 500ms.
2. **Alert delivery silently fails.** Resend throttles, Telegram IP-blocks, VAPID cert expires. Synthetic canary + daily check.
3. **Drizzle migration lock.** Two Vercel deploys race to run migrations. Fix: migrations run from the worker boot, not the web app.
4. **Postgres connection exhaustion.** Each Vercel serverless function opens its own pool. Use Neon's pooler endpoint (`...pooler.neon.tech`) for `DATABASE_URL` in Vercel specifically.
5. **Ramp provider terms.** Coinbase Onramp occasionally restricts territories or fee schedules. Watch their changelog monthly.

---

## 7. Cost Estimate (Month 1–3)

| Service | Plan | Cost |
|---|---|---|
| Vercel | Pro | $20/mo |
| Railway | Hobby | $5/mo + usage (~$10 total) |
| Neon | Pro | $19/mo |
| Upstash | Pay-as-you-go | ~$5/mo at low volume |
| Resend | Free tier | $0 (up to 3k emails/mo) |
| Cloudflare | Free | $0 |
| Sentry | Team | $26/mo |
| PostHog | Free | $0 (up to 1M events/mo) |
| AWS KMS | Pay-per-use | ~$1/mo |
| **Total** | | **~$86/mo** |

At 10k users scale Neon to `Scale` ($69/mo) and Vercel to Enterprise if your build minutes spike. Upstash + Sentry scale smoothly.

---

*Deployment is the boring part. Shipping something people want is the hard part. This guide gets you through step one so you can focus on step two.*
