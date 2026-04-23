# KLUB — Team Review

> What to look at, what to ignore, what to push back on. This is an architectural and design review, not a beta. The product is built end-to-end as a working prototype; real transactions and live Bulk data are the next 8 weeks of backend work.

---

## What you're reviewing

A members-only retail front-end for on-chain perpetuals on Bulk Exchange. Fourteen in-app pages, minimalist design, working backend worker, Drizzle schema, signing primitives, background alert system. Every screen is real TypeScript — nothing is mocked up in Figma.

**What's done:** UX flows, copy, information hierarchy, mobile responsiveness, design system, database schema, worker architecture, signing envelope, live-data wiring pattern.

**What's stubbed:** Real order submission to Bulk, copy-trade execution, agent-wallet KMS storage, portfolio snapshot from the user's real account, Basis vault contract. Every "Buy" / "Deposit" / "Follow" button shows a success toast without actually executing.

Treat it as an extremely high-fidelity working prototype waiting for five backend integrations.

---

## Get it running locally (15 minutes)

### Prerequisites

- Node 20+ (`node --version` should show `v20.x` or later)
- pnpm 9+ (install with `npm i -g pnpm`)
- A free [Neon](https://neon.tech) account (Postgres — takes 2 minutes to create)
- A free [Upstash](https://upstash.com) account (Redis — takes 2 minutes to create)

### Steps

```bash
# 1. Unzip and enter the repo
unzip klub-full-project.zip && cd klub

# 2. Install all workspace dependencies
pnpm install

# 3. Set up environment file
cp .env.example .env.local
# open .env.local in your editor and paste:
#   DATABASE_URL="<your Neon connection string>"
#   REDIS_URL="<your Upstash redis:// URL, NOT the REST URL>"

# 4. Create the database tables
pnpm --filter @klub/db generate
pnpm --filter @klub/db migrate

# 5. Start the web app
pnpm --filter @klub/web dev

# → open http://localhost:3000
# → tap "Enter the app"
# → first visit redirects to /onboarding
```

**Optional — to see the alerts worker boot:** in another terminal run `pnpm --filter @klub/worker dev`. It will try to subscribe to a Bulk WebSocket; without a `BULK_WS_URL` env var it'll log connection failures and keep retrying — that's expected in the prototype state.

### "What about Docker?"

You don't need it. Docker was used during development for local Postgres + Redis; the cloud-hosted free tiers (Neon + Upstash) replace it cleanly. Skip any instruction that mentions `docker compose`.

### The fastest way to see it without installing anything

Open `klub-preview.html` directly in your browser. It's a single static HTML file showing the five key retail pages (Home, Trade, Basis, Desk, Follow) with the real theme and navigation drawer. Good for a 90-second walkthrough before anyone invests setup time.

---

## Feature inventory

Everything the project ships, honest status on each.

### Retail surfaces (minimalist, mobile-first)

| Feature | Route | Status |
|---|---|---|
| Landing page | `/` | Real. Waitlist form hits `/api/waitlist` → Postgres. |
| Home dashboard | `/home` | Real shell. Equity/PnL/positions/health are hardcoded; needs `/api/portfolio`. |
| Onboarding wizard | `/onboarding` | Real. 3 steps, localStorage-persisted. |
| Quick Trade | `/quick-trade` | Real flow + real math. Submit fires a toast; doesn't sign or send. |
| The Math calculator | `/calculator` | Fully real. Uses `@klub/calc`, 23 unit tests pass. |
| Portfolio Health | `/health` | Real engine (`@klub/calc` `healthScore`) on stubbed input. |
| Follow (leaderboard) | `/follow` | Real UI. 6 mock leaders — no leader indexer yet. |
| Leader profile + copy config | `/follow/[handle]` | Real UI. Copy-trade intent saves to localStorage. |
| Practice journal | `/practice` | Fully real. localStorage-backed. |
| Settings | `/settings` | Real. Risk profile / alerts toggle / clear-data all work. |
| Invite redemption | `/invite/[code]` | Real. Validates code via `/api/invite` against Postgres. |
| Add funds (ramp) | `/ramp` | Real Coinbase Onramp URL construction. Needs `COINBASE_ONRAMP_APP_ID` env. |

### Earn surfaces

| Feature | Route | Status |
|---|---|---|
| Basis vault | `/basis` | Real UI, stubbed contract calls. **On-chain contract does not exist yet.** |
| The Desk (funding monitor) | `/desk` | Real UI, live funding hooks wired, demo-mode fallback. Opportunities list is hardcoded. |

### Expert surface — the Bloomberg-style terminal

**`/pro` — KLUB Pro.** 824 lines. Desktop-only (mobile redirects to Quick Trade). What's there:

- **Six-panel persistent grid:** watchlist (12 markets), chart, orderbook (15 levels per side with cumulative size bars), tape (40 recent prints), positions, order form
- **⌘K / Ctrl+K command palette.** Opens a searchable overlay. Commands: navigate to any market, jump to any app route (`/home`, `/basis`, `/desk`, `/ramp`), close-all-positions action. Extensible to any future command via one array.
- **Order form with full controls:** long/short, limit/market, price, size, leverage slider 1–50×, size% presets (10/25/50/100%), live notional/margin/fee footer
- **Live ticker subscriptions** via `useTickers(12 symbols)` singleton WebSocket
- **Connection state pill** in the status bar: Live / Reconnecting / Demo
- **Keyboard shortcuts** throughout — ⌘K, Esc to close palette, click-outside dismiss

What's genuinely live right now:
- Watchlist prices and active-symbol mark in the header tick from `useTickers` — real when Bulk WS is wired, demo-simulated otherwise

What looks live but isn't:
- **Orderbook depth** — generated from a `useMemo(() => generateBook(mark, 15))`. Needs the `book` stream subscription from `@klub/api-client` (20-line wire-up, blocked on Bulk schema confirmation).
- **Tape prints** — generated from a `useMemo(() => Array.from(...))`. Same `trades` stream wire-up pending.
- **Positions panel** — uses one hardcoded demo position. Needs `useAccountStream(pubkey)` which depends on authenticated WS (Phase 3.5).
- **Equity / used margin / free margin** in the status bar — hardcoded strings.

This is the single most impressive-looking surface in the app. Worth showing your team first if you want the "this is real" reaction.

### Backend infrastructure

| Piece | Status |
|---|---|
| `packages/api-client` — Bulk REST + WebSocket + typed errors | Fully implemented. 12 tests. |
| `packages/calc` — pre-trade calculator + health score | Fully implemented. 23 tests. |
| `packages/db` — Drizzle schema (9 tables) + migrations | Fully implemented. |
| `packages/signing` — Ed25519 signer, canonical JSON, agent-wallet wrap | Primitives done. KMS integration stubbed. |
| `apps/worker/alerts-worker` | Real. Consumes BullMQ queue, dispatches push/email/Telegram. |
| `apps/worker/account-subscriber` | Real. Opens Bulk WS per user, detects tier crossings, enqueues alerts. |
| `apps/worker/copy-trade-worker` | Scaffolded. Doesn't replay trades yet. |

---

## Things to look at, by role

### If you're reviewing design

- `klub-preview.html` — 90-second tour of the five core retail pages
- Run locally and tap through: `/home` → `/quick-trade` → `/follow` → `/basis` → `/desk`
- The hamburger menu (top-left) is the ONLY navigation; open it on every page and confirm it stays consistent
- Tap "Show details" / "Show math" / "Learn more" on any page to see the disclosure pattern
- On mobile viewport (375px) every page should work; `/pro` gates to Quick Trade
- **Push back on:** any page where your eye doesn't land on one thing within 2 seconds. The minimalist pass was about single-focus-per-page.

### If you're reviewing engineering / architecture

- Start with `packages/api-client/src/websocket.ts` — the `BulkWebSocket` class. Reconnect logic, topic multiplexing, transport abstraction.
- Then `apps/web/lib/market-data/client.ts` — the singleton that wraps the WebSocket for the browser, with demo-mode fallback.
- Then `apps/web/hooks/` — three React hooks (`useTickers`, `useFundingRates`, `useConnectionState`) that everything consumes.
- Then `apps/worker/src/workers/account-subscriber.ts` — the Node-side WS subscriber that fires real alerts.
- Then `packages/db/src/schema.ts` — the Drizzle schema. Nine tables. Read comments; question any relation or index choice.
- **Push back on:** the copy-trade-worker scaffold. It's the least-finished backend piece. If you see a better architecture, now's the time.

### If you're reviewing product / strategy

- `/home` — is the "greeting + two buttons + Show details" really enough? Or should something else be visible on first load?
- `/follow` — the leaderboard. Does ranking by 30d PnL feel right? What if a leader had one lucky week?
- `/basis` — delta-neutral funding yield. Do you buy the 14.8% target APY framing? Are the risks disclosed plainly enough?
- `/pro` — desktop terminal. Who's the user? Is ⌘K the right affordance?
- `/ramp` — 3-tap on-ramp. Is the fee breakdown behind "Show breakdown" or should it be visible by default?
- **Push back on:** anything that feels like a feature we built because we could, not because retail asked.

### If you're reviewing growth / GTM

- `docs/beta-outreach.md` — the 20-tester recruitment playbook. Is the three-group split right?
- `marketing/blog/*` — three drafted blog posts. Read one and tell me if the voice is right.
- The invite-code gate — is it a growth lever or a friction we should drop at launch?
- **Push back on:** the whole "members-only" framing if you think a public waitlist without gating converts better.

### If you're reviewing legal / compliance

- `docs/legal/terms-of-service.md`, `privacy-policy.md`, `risk-disclosure.md` — all drafted with `[COUNSEL]` flags where we need real lawyers.
- The geoblock (US / UK / OFAC) is only mentioned in copy. No IP detection wired yet.
- The non-custodial framing — we say KLUB never holds user funds. Confirm the Agent Wallet architecture actually delivers on that (`packages/signing/src/agent-wallet.ts`, `canWithdraw: false` invariant).
- **Push back on:** anywhere the copy overpromises vs the actual on-chain reality.

---

## Hard blockers before a real user clicks "Buy"

Five things, ordered by dependency:

1. **Bulk WebSocket schema confirmation** (1 email, 1–3 business days for reply). Draft is in `docs/bulk-schema-confirmation-email.md`. Until they reply, every "live" surface stays in demo mode.

2. **Real order submission.** When a user taps Buy BTC in Quick Trade, nothing is signed or sent. Wiring: `packages/signing` → Bulk REST `/order` endpoint. Estimated 2–3 days.

3. **KMS wrap/unwrap for agent-wallet keys.** ~80 lines in `packages/signing/src/agent-wallet.ts`. Uses AWS KMS. Before any agent wallet touches production.

4. **Portfolio API (`/api/portfolio`).** Reads positions + equity from Bulk REST using the connected wallet's pubkey. Replaces hardcoded `/home` snapshot. Estimated 1 day.

5. **Basis vault smart contract.** Doesn't exist. Needs to be written, audited, deployed. 6–8 weeks separately from everything else. The `/basis` page ships with deposits disabled until this lands.

---

## Medium gaps (shippable without, but visibly incomplete)

- Copy-trade worker doesn't replay leader trades yet
- Leader indexer doesn't exist — leaderboard is seeded mock data
- Funding-rate arb opportunities on `/desk` are hardcoded, not computed from live funding
- `/pro` orderbook depth, tape, and positions panels show generated data, not live feeds
- `/settings/alerts` per-channel and per-tier config UI is a stub link
- Push notification permission + service worker registration flow doesn't exist
- Onboarding handle choice doesn't write to Postgres (only localStorage)

---

## Cosmetic / polish backlog

- Loading skeletons instead of "Loading…" text across every page
- Custom `not-found.tsx` and `error.tsx` instead of Next.js defaults
- Public `/terms`, `/privacy`, `/risk` routes wired to the drafted legal pages
- Haptic feedback on mobile CTAs via `navigator.vibrate()`
- Celebratory micro-interactions on first trade / first follow / first deposit
- Rate-limiting on `/api/invite` and `/api/waitlist`
- Sentry + PostHog wiring (env vars exist, code doesn't)

---

## Eight-week roadmap to first 10 real users

**Week 1** — Unblock live data. Send Bulk schema email. Reconcile payload field names once they reply. Flip `NEXT_PUBLIC_BULK_WS_URL` on staging; watch `/desk` and `/pro` go Live.

**Week 2** — Real transactions. Wire order submission in Quick Trade + expert Trade through the signing package. Add KMS wrap/unwrap. Build `/api/portfolio`. End-to-end test with one $50 testnet trade.

**Week 3** — Copy trading. Wire the copy-trade worker to subscribe to leader account streams. Build agent-wallet provisioning on first follow. Instrument `leader_fill_ts → worker_enqueue_ts → bulk_ack_ts` latency. One real leader (a founder), one follower at $25.

**Week 4** — Alerts. Service worker registration + VAPID push subscription. Per-channel per-tier alert config at `/settings/alerts`. Daily synthetic canary position that always triggers tier-3.

**Week 5** — Close production gaps. Loading skeletons. `not-found.tsx` + `error.tsx`. Legal pages live at `/terms`, `/privacy`, `/risk`. Sentry + PostHog wired. Rate-limiting on public API routes. Legal counsel review of drafted pages.

**Week 6** — Closed beta: 10 people. Production deploy (Vercel + Railway + Neon + Upstash). Invite 10 from your Group A list per `docs/beta-outreach.md`. Daily Sentry review, weekly 30-min feedback call. Fix whatever breaks first.

**Week 7** — Widen to 30. Add 8 founder-friend testers + 4 CT traders. Ship `/settings/alerts` v2 based on Week 6 feedback. Ship 1–2 top-requested features. Leader indexer MVP so the leaderboard shows real traders, not mocks.

**Week 8** — Open waitlist. Remove invite gating; invite codes become a first-come queue. Ship Basis vault **only if contract audit complete** (otherwise defer to week 14+). ProductHunt launch. Measure: landing → invite acceptance → first trade funnel in PostHog.

**Explicitly NOT in the 8-week plan:** Basis vault (blocked on contract + audit), KLUB Pro orderbook/tape subscriptions beyond the Week 1 wire-up, mobile native apps, advanced leader analytics, token work. Those come after Week 8 if the first 30 testers actually use the product.

---

## Questions to bring to our next team meeting

1. **Who owns Bulk's relationship?** We need one person on that thread; the schema email should come from whoever's already in touch with them if possible.
2. **Who writes the Basis vault contract?** In-house, audit firm, or fork an existing delta-neutral primitive? This is the single longest-lead item.
3. **How aggressive should the 10-person beta be?** All founders and their friends, or mix in a few external retail traders early?
4. **Geoblock approach?** Hard IP-block at the edge (Cloudflare Workers), soft block with ToS acceptance, or defer until Week 5?
5. **Do we launch with the `/pro` terminal visible to everyone, or behind a feature flag until orderbook + tape are wired to real data?**
6. **Are we shipping on BULK Net (Solana-adjacent L1) only, or planning EVM support for V2?** The current code assumes BULK Net throughout.

---

## Bottom line

The prototype is complete. Every screen, every flow, every disclosure is built. What's missing is transactionality — the last mile where buttons become orders, follows become mirrored trades, and demo pills become Live pills.

Six to eight weeks of focused backend work gets us to a 10-person closed beta. Everything on the frontend side — the UX that determines whether users want to trade on KLUB — is testable today.

Push back on anything. Nothing here is precious.
