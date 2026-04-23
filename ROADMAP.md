# KLUB — Full Roadmap

> Every feature of the app, placed on a week-by-week timeline with explicit status and dependencies. Updated at the end of each execution week.
>
> **Legend:**
> - ✅ shipped and working against real Bulk
> - 🟡 scaffolded, stubbed, or wired to demo data
> - 🔴 not started
> - 🔒 blocked on external dependency (Bulk, audit, legal)

---

## Week 1 — Real Bulk integration foundations

**Theme:** stop being a demo. Every screen that claims to be live becomes live against Bulk testnet.

### Day 1 — Reality-check ✅
- Verify every Bulk assumption against `docs.bulk.trade`
- Install `bulk-keychain` (worker / Node) + `bulk-keychain-wasm` (web / browser) + `bs58`
- Rewrite `docs/bulk-integration-notes.md` as authoritative reference
- Start `docs/week-1-log.md`
- Delete obsolete schema-confirmation email (docs are public)

### Day 2 — WebSocket client reconciliation 🔴
- Update `packages/api-client/src/types.ts`: real `Ticker` (20 fields including `markPrice`, `oraclePrice`, `fundingRate`, `regime`), real `Trade` compact fields (`s/px/sz/time/side/maker/taker/reason/liq`)
- Update `websocket.ts`: wait for `subscriptionResponse` before marking sub active; add explicit rate-limit guards (100 subs, 1000 msg/s); verify `ws` library auto-pongs
- Rewire `useTickers` to read `markPrice` (not `mark`)
- Derive `useFundingRates` from the ticker stream (drop the separate subscription assumption)
- Set `NEXT_PUBLIC_BULK_WS_URL=wss://exchange-ws1.bulk.trade` locally
- Manual test: `/desk` Live pill stays green against real Bulk feed

### Day 3 — Real order submission 🔴
- Build `apps/web/lib/bulk/orders.ts` using Mode A:
  - `prepareOrder → prepared.messageBytes → wallet.signMessage → prepared.finalize(bs58.encode(signature))`
- Replace toast stub in `/quick-trade` submit handler
- Same treatment for `/trade` expert screen
- Handle rejection reasons (`rejectedRiskLimit`, `rejectedCrossing`, `rejectedInvalid`) in plain English
- Toast includes Bulk order ID + "view on Bulk" link to `early.bulk.trade`
- Manual test: place one real $5 SOL-USD testnet order, verify on `early.bulk.trade`

### Day 4 — Portfolio API for /home 🔴
- Build `/api/portfolio/route.ts` → POST to Bulk `/account` with `{type:'fullAccount', user:pubkey}`
- Transform into `{equityUsd, pnl24hUsd, positions, healthScore}` shape
- Cache in Redis 3s (`portfolio:{pubkey}`)
- Replace hardcoded `DEMO_*` constants on `/home` with a fetch hook
- Graceful no-wallet state

### Day 5 — Agent wallets + faucet bootstrap + handoff 🔴
- `/api/testnet-faucet` route → signed `requestFaucet` call
- "Get testnet USDC" button on `/home` when equity = 0
- First `/follow/[handle]` confirm provisions a real agent wallet:
  - Generate ephemeral Ed25519 keypair in memory (Week 1 uses in-memory keys; KMS wrapping is Week 2)
  - Signed `manageAgentWallet` with `canWithdraw:false`
  - Persist `{userPubkey, agentPubkey, handle, maxAllocPct, createdAt}` in `userAgentWallets`
- Update `TEAM-REVIEW.md`: remove "Real order submission", "Portfolio API", "Agent wallet provisioning" from the hard-blockers list
- Demo Loom of end-to-end testnet flow

---

## Week 2 — Risk engine + copy-trade execution

**Theme:** stop lying to users about their liquidation price. Start copying leader trades for real.

### Risk surfaces 🔴
- Subscribe to the `risk:{symbol}` WebSocket stream via `@klub/api-client`
- Build `@klub/calc/src/bulk-margin.ts` implementing Bulk's portfolio margin math:
  - Correlation-adjusted effective notional
  - Per-position lambda lookup from the grid
  - Portfolio maintenance margin = `√(Σ M_i² + 2 · Σ_{i<j} M_i · M_j · ρ_{ij})`
- Replace the naive `maintenanceMarginFrac: 0.005` parameter across all 23 calc tests
- Add regime indicator pill to `/health` (e.g. "Current regime: bearish-high-vol")

### KMS wrap/unwrap for agent keys 🔴 🔒 (AWS KMS access)
- **Week 2 scope — stepping stone, not the end state.** Agent-wallet architecture via KMS now; Ika-dWallet-based agent wallets in Week 10 supersede this for trading authority. KMS still holds the worker's fee-sponsor keypair indefinitely.
- Agent-wallet private keys written through AWS KMS `Encrypt` on creation
- Retrieved via `Decrypt` only inside the worker process at signing time
- Local-dev path: symmetric AES wrap using `AGENT_WALLET_LOCAL_KEY` env var
- Existing in-memory keys from Week 1 are evicted; migration script rotates them
- **Migration note:** when Week 10 ships, existing KMS-backed agent wallets are revoked in favor of fresh Ika dWallet agent wallets, users re-approve their follows via clear-sign once

### Copy-trade execution 🔴
- Wire `apps/worker/src/workers/copy-trade-worker.ts`:
  - Subscribe to each followed leader's `user_trades:{pubkey}` stream
  - On fill: compute follower's mirror order (scaled to `maxAllocPct`, skipping if leader's symbol isn't copy-whitelisted)
  - Load follower's KMS-wrapped agent key, sign with `NativeSigner`, POST to Bulk
  - Write `copyTradeExecutions` row: `{leaderFillTs, workerEnqueueTs, bulkAckTs, followerPubkey, leaderPubkey, symbol, size, status}`
- Latency metric exposed at `/api/metrics/copy-latency`
- Acceptance: one real leader (founder) → one $25 follower account mirroring within 2s

### Pro terminal — real orderbook + tape 🔴
- Replace `useMemo(() => generateBook(...))` with `useL2Delta(symbol)` hook subscribed to `l2Delta:{symbol}`
- Replace tape generator with `useTrades(symbol)` subscribed to `trades:{symbol}`
- Connect positions panel to `useAccountPositions(pubkey)` via `account_positions:{pubkey}` topic
- Status-bar equity/margin/free hooked to `useAccountOverview(pubkey)`

---

## Week 3 — Alerts infrastructure

**Theme:** users hear from us when their position is at risk, through the channel they chose.

### Push notifications 🔴
- Service worker registration + VAPID subscription flow at `/settings/alerts`
- On subscribe: POST public-key → `pushSubscriptions` table
- Worker dispatches via `web-push` npm library
- iOS PWA push flag handling (iOS requires home-screen install)

### Alert config UI 🔴
- `/settings/alerts` — three channels (Push / Email / Telegram), three tiers (25% / 10% / 3% buffer-to-liq)
- Per-tier per-channel on/off matrix
- Telegram: deep-link to start conversation with KLUB bot, bot receives `/start <userId>` and writes `telegramChats` row
- Quiet hours toggle (no alerts between 11pm–7am user-local)
- Test-fire button per channel

### Canary subscriber 🔴
- Daily cron enqueues a synthetic $0.01 testnet position that always triggers tier-3
- If the tier-3 alert fails to fire within 60s on any channel, PagerDuty wake

### Onboarding handle → Postgres 🔴
- `/onboarding` step 1 writes handle to `users` table via signed-in session, not localStorage
- Handle uniqueness check via `/api/users/check-handle`

---

## Week 4 — Leader indexer + discovery

**Theme:** the leaderboard is real, ranked off real on-chain performance.

### Leader indexer 🔴 🔒 (Bulk historical-trades endpoint — confirm REST `/userTrades` pagination at start of week)
- `apps/worker/src/workers/leader-indexer.ts` — runs every 15 minutes
- For each whitelisted leader pubkey: pull last 30d of trades via Bulk REST, compute:
  - 30d net PnL (USD, net of fees + funding)
  - Win rate (% of profitable round-trip trades)
  - Max drawdown
  - Sharpe (daily returns)
  - Followed-equity (sum of follower allocations)
- Write to `leaders` table (new migration)
- `/follow` and `/desk` read from `leaders` instead of `MOCK_LEADERS`

### Leader opt-in flow 🔴
- `/leaders/apply` page — wallet connect + explainer + application form
- Admin review (manual) in Week 4; automated in Week 10+
- Approved leaders get visibility on `/follow`, a `@handle` reserved, and the 10% performance-fee split

### Funding-rate arb detector for /desk 🔴
- Background job: compute pairwise funding spreads across symbols, rank top 5 by annualized net spread
- Surface on `/desk` under a "Opportunities" disclosure
- Each opportunity links to `/quick-trade` with the long/short pre-filled

### Search/filter on /follow 🔴
- Server-side sort/filter instead of client-side `useMemo`
- URL-synced state (`/follow?style=trend&sort=winRate`)

---

## Week 5 — Production polish

**Theme:** the cosmetic layer that separates prototype from production.

### Loading states 🔴
- Skeleton components: `<TickerSkeleton>`, `<PositionRowSkeleton>`, `<StatCardSkeleton>`
- Replace every `Loading…` text placeholder across 14 pages
- Suspense boundaries around data-fetching children

### Error boundaries 🔴
- `apps/web/app/error.tsx` — branded error page, Sentry beacon, "Back to home" CTA
- `apps/web/app/not-found.tsx` — branded 404
- Per-route error boundaries for `/pro` (so a failing panel doesn't crash the terminal)

### Legal pages 🔴
- `/terms`, `/privacy`, `/risk` routes wired to `docs/legal/*.md` drafts
- Counsel review of drafts (initiated Week 4)
- Footer link update across landing + drawer footer

### Observability 🔴
- Sentry wiring on web + worker (env-gated)
- PostHog wiring: core funnels tracked (landing → invite → onboarding → first trade)
- Request-ID propagation through `/api/*` routes for correlation

### Rate limiting 🔴
- `/api/invite`, `/api/waitlist`, `/api/testnet-faucet` — 5 req/min per IP via Upstash sliding-window
- `/api/portfolio` — 20 req/min per pubkey

### Geoblock 🔴 🔒 (counsel + Cloudflare Worker config)
- IP geolocation at edge (Cloudflare Worker)
- US / UK / OFAC jurisdictions blocked with explainer page
- Allowlist override for team testing

### Haptic feedback 🔴
- `navigator.vibrate(10)` on successful trade submit, successful follow, successful deposit
- Only on touch devices (feature-detect)

---

## Week 6 — Closed beta (10 people)

**Theme:** ship to production, watch 10 real people use it, fix what breaks first.

### Production deploy 🔴
- Vercel: `apps/web` with env vars for all secrets
- Railway: `apps/worker` as background service
- Neon: Postgres (migrate from dev branch to production branch)
- Upstash: Redis (separate production instance)
- Sentry + PostHog project switches to production
- Cloudflare DNS for `app.klub.trade`

### Beta cohort A — 10 users 🔴
- Hand-pick from Group A of `docs/beta-outreach.md` (founder-network traders)
- Personalized invite links (5-spot codes each)
- Onboarding call (30 min) per user — watch them use the app
- Daily Sentry review in a standing channel
- Friday retro → top 3 issues to fix next week

### Beta-tracking instrumentation 🔴
- `betaSessions` table — every session rolled up: pages visited, errors thrown, trades placed, follows created
- Beta-only "Report a bug" floating button → Sentry `user feedback` API

### Support channel 🔴
- Private Telegram group for Cohort A + founders
- On-call schedule (rotating, founders-only)
- Canned responses for the 10 most likely questions

---

## Week 7 — Widen beta to 30 + Pro terminal V2

**Theme:** expand feedback pool, ship the top Week 6 requests, complete the expert surface.

### Beta cohort B + C — add 20 users 🔴
- 8 founder-friends (Group B)
- 4 CT (Crypto Twitter) traders with verified track records (Group C)
- 8 open-waitlist signups from Weeks 1-6
- Per-group slack channel for segmented feedback

### Pro terminal V2 🔴
- Charting: wire TradingView Lightweight Charts to `candle:{symbol}:{interval}` stream
- Chart drawing tools (trend lines, fib retracements, horizontal support/resistance)
- Saved layouts (per-wallet): panel sizes, active symbol set, timeframe
- Keyboard-first order entry: `b`/`s` to pre-fill buy/sell on active symbol, number keys for size presets

### Quick Trade V2 🔴 (based on Week 6 feedback)
- Real `rng` (OCO) orders — one atomic submit for entry + stop + target
- Trailing stop option (Bulk `trl`)
- Leverage slider with visual liquidation-distance indicator
- "Risk of ruin" badge: probabilistic estimate given position size + volatility

### Follow V2 🔴
- Leader detail page: equity curve chart, per-symbol breakdown, drawdown chart
- Copy-trade dashboard at `/following` — list of active follows, toggle pause, view mirror history
- Notification when a followed leader closes a position

---

## Week 8 — Open waitlist + initial public launch

**Theme:** remove the invite gate, launch publicly, measure the funnel.

### Remove invite gating 🔴
- `/invite/[code]` still works (becomes "skip the queue" rather than "only way in")
- Default landing CTA changes: "Enter the app" instead of "Request access"
- Fresh signups go into a first-come queue; 100 new spots/day

### Public launch 🔴
- ProductHunt launch (need `graphics/producthunt-*.png` assets — Week 7 design task)
- Farcaster announcement via founder accounts
- KLUB blog post #1 published (`marketing/blog/klub-launch.md` — not written yet)
- Newsletter announcement if founders have one

### Analytics 🔴
- Funnel dashboard: landing → signup → onboarding complete → first trade → first follow → retained-30d
- Per-channel attribution (UTM + referrer)
- Cohort retention curves (D1 / D7 / D30)

### Fee tier + points 🔴 🔒 (Bulk points/referral program confirmation)
- Bulk fee tiers applied to user trades based on 30d volume (Bulk computes, we surface)
- Aura points display at `/settings/points` — pulled from Bulk's points endpoint
- Referral code landing: `klub.trade/r/<code>` → signup → Bulk's referral endpoint credits inviter

---

## Weeks 9–12 — Universal ramp via Ika dWallets

**Theme:** the most differentiated user-visible feature. Users deposit from any chain they already have crypto on (BTC, ETH, ERC-20s, Solana) without KLUB ever holding their funds, via Ika 2PC-MPC dWallets bound to on-chain clear-sign multisigs.

**Depends on:** `docs/ika-encrypt-architecture.md`. Read that before any Week 9–12 code. The underlying stack is pre-alpha — real user funds do NOT touch this flow until Ika Alpha 1. Week 9–12 work runs against testnet only; Coinbase Onramp (Week 0) remains the shipped fallback until Ika Alpha 1 lands.

### Week 9 — Solana program foundations 🔴 🔒 (Ika + Encrypt in pre-alpha — we are dev-building against their testnet)
- Fork `clear-msig-ika` into `programs/klub-wallet/` as our Solana program
- Add `@klub/ika-client` package with typed bindings: types, DKG flow, sign flow, chain preimage builders mirrored TS↔Rust
- Wire `solana-curve25519` deps, Agave v3.1+ toolchain, Quasar build
- Define the KLUB intent library:
  - `ramp_in` — detect inbound deposit on source chain, swap to USDC on Solana, credit user's Bulk account
  - `copy_trade_from_leader` — user authorizes worker to mirror a leader, capped at `max_alloc_pct`
  - `withdraw_to_origin` — user-initiated return of funds to a source chain
- Deploy to Solana devnet; local Litesvm test harness in place

### Week 10 — First cross-chain deposit (EVM) 🔴
- User onboarding creates a `KlubWallet` PDA with three default intents
- `bind_dwallet` wires a Sepolia testnet dWallet to the user's wallet via Ika DKG
- EVM preimage builder (EIP-1559 RLP): identical Rust on-chain and TypeScript off-chain, byte-exact verified
- `/ramp` adds "Deposit from Ethereum (testnet)" option → shows user their dWallet's ETH address
- User sends 0.01 testnet ETH from Phantom (EVM side) → KLUB program sees it → proposes `ramp_in` intent → user clear-signs in browser → Ika produces the signature → swap-to-USDC-and-credit completes
- **Migrate agent wallets to Ika:** replace the Week-2 KMS-wrapped Ed25519 keypairs with dWallet-based agent wallets. Copy-trade authority becomes an on-chain intent, not a KMS-held key. `canWithdraw:false` becomes "withdraw intent does not exist" — enforced at consensus, not at the worker.
- Week 6 beta users (Cohort A) get the "Deposit from ETH" button visible on testnet builds only

### Week 11 — Bitcoin + ERC-20 support 🔴
- Bitcoin BIP143 P2WPKH preimage builder (on-chain + off-chain mirrored)
- ERC-20 transfer preimage builder (for users depositing USDC/USDT/etc. from Ethereum L1/L2s)
- `/ramp` UI grows to include "Deposit from Bitcoin" and "Deposit from ERC-20s"
- Per-chain rate limits and sanity checks on deposit detection
- Ledger clear-sign support (advanced-settings toggle)

### Week 12 — Withdraw-to-origin + hardening 🔴
- `withdraw_to_origin` intent: user can pull funds back to any chain they've deposited from
- One-shot `--broadcast` flow: sign + post to destination RPC in a single action
- Human-readable message templates audited for ambiguity (is "1000000000 wei" clearly 0.000001 ETH? yes, we use the `{N:10^18}` decimal-shift format)
- Deposit-detection canary: test dollar every 6 hours to validate the pipeline end-to-end
- Week 6+ cohort gets access to full ramp flow on testnet
- Update `TEAM-REVIEW.md`: replace "Basis vault" as the blocking Earn item with "Universal ramp" as the blocking deposit item

---

## Weeks 9–12 — Basis vault (PARALLEL TRACK)

**Theme:** the Earn surface, running alongside the ramp track with different engineers.

**This is a parallel 4-week track that runs at the same time as Weeks 9–12 above.** The PM coordinates both; the engineering tracks are independent.

### Basis vault contract 🔴 🔒 (smart-contract engineer + audit firm)
- Contract design: delta-neutral paired positions (BTC/ETH, ETH/SOL, etc.)
- Rebalancing logic (threshold-triggered, not time-triggered)
- Fee model: 2% mgmt + 20% performance above high-water mark
- Week 9–10: contract authoring
- Week 11: audit (OtterSec or equivalent)
- Week 12: audit fixes + testnet deploy

### /basis becomes real 🔴
- Currently stubbed UI; Week 12 wires real deposit/withdraw to the audited contract
- Vault APY hydrated from on-chain data
- Allocation breakdown from on-chain positions

### KLUB Pro V3 — algo-trading primitives 🔴
- Strategy builder: simple if-this-then-that (e.g. "if funding > 0.02%, close long")
- Backtest runner (on historical candles)
- Paper-trade mode for new strategies

---

## Weeks 13–16 — Confidentiality, native mobile, revenue, scale

**Theme:** confidential positions via Encrypt FHE, native apps, sustainable economics, prep for scale.

### Encrypt FHE V3 — confidential positions 🔴 🔒 (Encrypt Alpha 1 required; timing not yet set by dWallet Labs)

**Depends on:** Encrypt program transitioning from pre-alpha (plaintext-on-chain) to Alpha 1 (real FHE). Until Alpha 1, this section sits as a planning document with a functional mock. Same `docs/ika-encrypt-architecture.md` remains the reference.

- `@klub/encrypt-client` package: wrap the `encrypt-grpc` TypeScript client, typed `EUint*` ciphertext handles
- Define the FHE programs our Solana code imports:
  - `encrypted_position_update` — apply a fill's delta to a position ciphertext
  - `encrypted_pnl_accumulate` — roll realized PnL into the user's encrypted total
  - `encrypted_leaderboard_compare` — rank two leaders' PnL ciphertexts without revealing either
- User-facing flow: positions display is only visible to the user via a signed decryption request; indexers, validators, and KLUB itself see ciphertexts
- Private copy-configs: the `(leader, follower, maxAllocPct)` tuple stored as ciphertext; only the follower's client can decrypt to render the /following page
- Encrypted leaderboard UI at `/follow` — ranks visible, raw PnL values hidden behind a "Show me mine" unlock

### Multi-venue adapter interface 🔴
- Refactor `@klub/api-client` → `@klub/venue-adapter-bulk`
- Define `VenueAdapter` interface (`placeOrder`, `cancelOrder`, `getPositions`, `streamTicker`, ...)
- Bulk stays as first impl; future Hyperliquid / dYdX / GMX slot in

### iOS + Android native apps 🔴
- React Native via Expo
- Push notifications native (APNs / FCM)
- Biometric unlock for clear-sign approval (connect to the same clear-wallet PDAs)
- Same agent-wallet model via Ika — keys in Secure Enclave / Android Keystore just back the clear-sign identity, not the trading keys themselves

### KLUB revenue share program 🔴
- 10/10% split on copy-trade performance fees (taker / maker)
- 2/20 on Basis vault
- Bulk PFOF integrator share (once Bulk confirms we're in the program)
- `apps/web/app/(app)/settings/earnings` — transparent breakdown

### Token design decision 🔴
- Memo (with counsel review): do we need a token? If yes, what does it unlock that revenue share can't?
- If yes → separate 8-week track for token design + distribution
- If no → formal "no token" public statement

### Scale hardening 🔴
- Database read-replicas
- WS connection pooling per region (US-East, EU-West, Asia-Southeast)
- Load test: 10,000 concurrent users, 1M msg/hour

---

## Feature index — where each feature lives

Exhaustive list of features described in the project, cross-referenced to their shipping week.

### Trade surfaces
| Feature | Week | Status after week |
|---|---|---|
| Landing page | 0 | ✅ |
| Home dashboard (stub numbers) | 0 | ✅ |
| Home dashboard (real Bulk data) | 1 | ✅ (end Day 4) |
| Onboarding wizard (localStorage) | 0 | ✅ |
| Onboarding wizard (Postgres-backed) | 3 | ✅ |
| Quick Trade UI | 0 | ✅ |
| Quick Trade real order submission | 1 | ✅ (end Day 3) |
| Quick Trade OCO / trailing | 7 | ✅ |
| Expert `/trade` real submission | 1 | ✅ (end Day 3) |
| Pro terminal — shell + palette | 0 | ✅ |
| Pro terminal — real orderbook + tape | 2 | ✅ |
| Pro terminal — V2 (charts + layouts) | 7 | ✅ |
| Pro terminal — V3 (strategy builder) | 9–12 | ✅ |

### Social + discovery
| Feature | Week | Status after week |
|---|---|---|
| Follow leaderboard UI | 0 | ✅ |
| Follow leaderboard (real indexer) | 4 | ✅ |
| Leader profile UI | 0 | ✅ |
| Agent wallet provisioning (testnet) | 1 | ✅ (end Day 5) |
| Agent wallet KMS wrapping | 2 | ✅ |
| Copy-trade execution | 2 | ✅ |
| Leader opt-in application | 4 | ✅ |
| /following dashboard | 7 | ✅ |

### Earn
| Feature | Week | Status after week |
|---|---|---|
| Basis vault UI (stubbed) | 0 | 🟡 |
| Basis vault contract | 9–12 | 🔴 |
| Basis vault real deposits | 12 | ✅ |
| The Desk — funding monitor UI | 0 | ✅ |
| The Desk — real funding (Bulk WS) | 2 | ✅ |
| The Desk — opportunities detector | 4 | ✅ |

### Safety + risk
| Feature | Week | Status after week |
|---|---|---|
| The Math calculator (naive) | 0 | ✅ |
| Portfolio-margin calculator (Bulk lambda) | 2 | ✅ |
| Portfolio Health score | 0 | ✅ (single-pos approximation) |
| Portfolio Health (real Bulk math) | 2 | ✅ |
| Practice journal | 0 | ✅ |
| Risk regime indicator | 2 | ✅ |

### Alerts
| Feature | Week | Status after week |
|---|---|---|
| Alerts worker scaffold | 0 | ✅ |
| Account subscriber (tier detection) | 0 | ✅ |
| Push notifications (service worker) | 3 | ✅ |
| Email notifications (Resend) | 3 | ✅ |
| Telegram notifications | 3 | ✅ |
| Alert config UI (`/settings/alerts`) | 3 | ✅ |
| Canary subscriber | 3 | ✅ |

### Fiat ramps + universal deposit
| Feature | Week | Status after week |
|---|---|---|
| /ramp Coinbase Onramp flow (fallback, always available) | 0 | ✅ |
| Testnet faucet button | 1 | ✅ (end Day 5) |
| Ika client package (`@klub/ika-client`) scaffold | 9 | ✅ |
| `klub-wallet` Solana program (fork of clear-msig-ika) | 9 | ✅ |
| DKG-via-Ika for first-time user dWallet | 10 | ✅ |
| Per-user `DwalletOwnership` lock | 10 | ✅ |
| EVM preimage builder (on-chain + off-chain, byte-exact) | 10 | ✅ |
| Bitcoin P2WPKH preimage builder | 11 | ✅ |
| ERC-20 preimage builder | 11 | ✅ |
| Multi-chain deposit addresses on /ramp | 11 | ✅ |
| Detect inbound deposit + propose swap-to-USDC | 12 | ✅ |
| One-shot sign-and-broadcast flow | 12 | ✅ |
| Withdraw-back-to-origin intent | 12 | ✅ |
| Ledger clear-sign support for treasury-size users | 12 | ✅ |
| Ika Alpha 1 migration (2PC-MPC real) | when Ika ships | 🔒 |

### Agent wallets (worker-signs-for-user)
| Feature | Week | Status after week |
|---|---|---|
| Agent wallet provisioning (Bulk native API, testnet) | 1 | ✅ (end Day 5) |
| Agent wallet KMS wrapping (AWS KMS) | 2 | ✅ |
| **Ika-backed agent wallet migration** — replaces KMS approach | 10 | ✅ |
| `copy_trade_from_leader` intent (on-chain policy, not app policy) | 10 | ✅ |
| User revokes copy by removing intent (worker physically can't sign) | 10 | ✅ |

### Confidentiality (Encrypt FHE track)
| Feature | Week | Status after week |
|---|---|---|
| Plaintext positions in Postgres for leaderboard math | 4 | ✅ |
| Encrypt client package (`@klub/encrypt-client`) scaffold | 14 | ✅ |
| Position size stored as FHE ciphertext | 15 | ✅ |
| Private copy-trade configs (leader + alloc hidden) | 15 | ✅ |
| Encrypted leaderboard compare (rank without revealing PnL) | 16 | ✅ |
| Encrypt Alpha 1 migration | when Encrypt ships | 🔒 |

### Infrastructure + ops
| Feature | Week | Status after week |
|---|---|---|
| Drizzle schema (9 tables) | 0 | ✅ |
| BullMQ job queues | 0 | ✅ |
| WebSocket client scaffold | 0 | ✅ |
| WebSocket client (reconciled with real Bulk) | 1 | ✅ (end Day 2) |
| Loading skeletons | 5 | ✅ |
| Error boundaries / 404 / 500 | 5 | ✅ |
| Sentry + PostHog | 5 | ✅ |
| Rate limiting | 5 | ✅ |
| Geoblocking (edge) | 5 | ✅ |
| Production deploy | 6 | ✅ |
| Multi-venue adapter | 9–12 | ✅ |
| Native mobile apps | 13–16 | ✅ |

### Settings + account
| Feature | Week | Status after week |
|---|---|---|
| Settings UI | 0 | ✅ |
| Invite redemption (Postgres) | 0 | ✅ |
| Invite gating removal | 8 | ✅ |
| Referral codes | 8 | ✅ |
| Aura points display | 8 | ✅ |
| Earnings breakdown | 13–16 | ✅ |

### Legal + compliance
| Feature | Week | Status after week |
|---|---|---|
| Terms / Privacy / Risk drafts | 0 | 🟡 (drafted, not counsel-reviewed) |
| Counsel-reviewed legal pages | 5 | ✅ |
| `/terms` `/privacy` `/risk` routes | 5 | ✅ |
| Geoblock US/UK/OFAC | 5 | ✅ |

---

## What's explicitly NOT on this roadmap

- KLUB token — pending Week 13+ decision memo
- DAO governance — post-token, or never
- DeFi lending integrations — not our product
- NFT features — not our product
- Social feed / activity stream — hinted at in early blog drafts but intentionally deferred until user demand is proven

## What IS on the roadmap but depends on third-party pre-alpha timing

- **Ika-based universal ramp (Weeks 9–12)** — depends on Ika moving from pre-alpha (mock MPC) to Alpha 1 (real 2PC-MPC). Our Weeks 9–12 work runs against pre-alpha testnet; real user funds gate on Ika Alpha 1. Coinbase Onramp (Week 0) remains shipped as fallback indefinitely.
- **Encrypt FHE confidential positions (Weeks 14–16+)** — depends on Encrypt moving from pre-alpha (plaintext-on-chain) to Alpha 1 (real FHE). We ship a functional mock first; cutover when Encrypt Alpha 1 lands.
- **Both pre-alpha environments wipe state at each phase transition.** Nothing we build against pre-alpha ever holds real user value.

See `docs/ika-encrypt-architecture.md` for the canonical architecture reference.

---

## Update discipline

This file is updated **at the end of each week**, by the PM, with:
- Which items shipped
- Which items slipped and why
- What moved up / down
- One-line retro note

Never update mid-week. The plan either holds or it visibly doesn't.
