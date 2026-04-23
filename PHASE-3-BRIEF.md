# Phase 3 — Differentiators

> Follow (copy trading), Practice (testnet + journal), /trade screen, invite-gated signup.

## What's Shipped

### Shared infrastructure
- **`<TopNav>`** component — single source of truth for nav on every page. Landing uses `variant="landing"`, in-app routes use `variant="app"`. Amber underline on the active route.
- **`/api/portfolio`** — typed wrapper around Bulk's `/account` endpoint. Maps the response into `HealthInput` shape so `/health` can drop a live portfolio straight into the score math.
- **`/api/invite`** — GET validates an invite code, POST redeems it. Phase 3 uses an in-memory allowlist; Phase 3.5 swaps to Postgres with redemption tracking.
- **`apps/web/lib/mock-data/leaders.ts`** — six seeded leader profiles with distinct styles (trend, basis, swing, scalper, macro, systematic), realistic net-of-fees PnL spreads, recent trade tapes.

### `/follow` — leaderboard
- Filter by trading style (trend / swing / scalp / basis / all)
- Sort by net-30d-PnL, win rate, drawdown, or followers
- Avatar + handle + style badge + PnL (absolute and %) + win rate + max DD + avg holding + follower count
- Every row links to a leader profile
- Explicit net-of-fees disclaimer above the table

### `/follow/[handle]` — leader profile
- 16x16 handle avatar with deterministic hue
- Bio + favorite markets + 30d net PnL, shown huge
- Eight-stat grid: win rate, avg hold, max DD, worst month, trades/30d, followers, copy AUM, member-since
- **Copy configuration panel** with:
  - Max allocation slider (1–100%)
  - Stop-loss override field (optional %)
  - Market filter (all leader's markets vs BTC/ETH only)
  - Live PnL projection ("on $5k at 20% alloc, 30d return")
  - "Start following" stores intent in localStorage (full wiring to Agent Wallet executor lands in Phase 3.5)
- Recent trade tape with entry/exit/PnL + time-ago
- Risk disclosure block

### `/practice` — testnet + trade journal
- Testnet status card with direct link to Bulk's faucet endpoint
- **Trade journal** that persists to localStorage:
  - New-entry form requires ≥8 chars of reasoning ("Why this trade?")
  - Open trades list with inline "Close" action
  - Close-trade flow prompts for exit reason and learnings (post-mortem baked in)
  - Closed trades history with full PnL + both reasoning notes
- Stats strip: total trades, win rate, total PnL, best/worst single trade
- `cryptoRandom()` uses `crypto.randomUUID()` where available

### `/trade` — central trading screen
- Symbol selector across BTC/ETH/SOL/HYPE
- Mark price with simulated drift (~900ms tick; swappable for Bulk WS in Phase 3.5)
- 10-level orderbook with cumulative-size heat bars
- Chart placeholder (SVG gradient sketch) — lightweight-charts lands in 3.5
- Positions table seeded with one demo long
- Order form: long/short, limit/market, price, size, leverage, TP, SL
- **The Math side panel** — recomputes live as you type, flags stop-beyond-liquidation
- Submit button prompts "signing lands in Phase 3.5" (honest about what's wired)

### `/invite/[code]`
- Server-component validates code at request time; invalid codes 404
- Client flow captures email + optional handle with validation pattern
- Success panel with next-step CTAs to The Math and the leaderboard
- Shows "X seats left" warning when code has ≤3 remaining
- Seeded codes: `demo` (infinite), `klub-0001` through `klub-0005` (single-use)

### `/health` updates (Q2 answer)
- "Load my Bulk account" button hooks into `useWallet()` from `@solana/wallet-adapter-react`
- If wallet disconnected → opens WalletModal
- If connected → POSTs to `/api/portfolio` and swaps demo data for live
- Source badge shows "Demo" or "Live · Fu…PQh7" with shortened pubkey
- "Reset to demo" button to go back

### Landing updates (Q1 answer)
- TopNav with Trade / Follow / The Math / Health / Practice links
- Inline HudStrip removed — unified nav component renders everywhere

## What I Decided Without Asking

- **Invite redemption UX**: email + optional handle. No wallet required at invite time — we want the email captured even if the user bounces before wallet connect.
- **Copy config projection math**: I show the dollar return assuming the user allocates `max_alloc` of a reference $5,000 equity at the leader's *exact* 30d return. Not "annualized," not "projected" — just "if you'd been copying at this alloc the last 30 days." More honest.
- **/trade simulated data**: gentle random walk, clearly labeled "Simulated" in the header strip. Not mocked orderbook "for screenshots" — actually ticks so the screen feels alive in demos.

## Phase 3.5 — What Still Needs Backend Infra

The front-end surface is mostly in place. Phase 3.5 is where we wire the plumbing that turns clicks into trades.

### Required before mainnet:
1. **BullMQ alerts worker** — subscribes to Bulk account WS, dispatches push/email/Telegram at 25/10/3% buffer tiers. Redis + worker app (`apps/worker`).
2. **Copy-trade execution engine** — consumes leader's trades via account WS, replays proportionally to each follower's account via their scoped Agent Wallet key. Depends on confirmation of Agent Wallet scope granularity from the Bulk team.
3. **Waitlist → Resend + Postgres** — currently a console.log; needs real storage + Resend audience sync + double-opt-in.
4. **`bulk-keychain` wiring** — signed operations (placeOrders, manageAgentWallet, requestFaucet) stub-out today. Plug the npm package (or GitHub dep) into `BulkClient.postSigned`'s signer.
5. **Leader indexer** — if Bulk doesn't give integrators a precomputed leaderboard, we run an indexer that watches all opt-in leaders' accounts via WS and rolls up PnL net-of-fees.
6. **Real chart integration** — swap the SVG sketch for `lightweight-charts` with Bulk's `/klines` as the data source.

### Nice-to-have:
- `/follow` search box by handle
- Leader onboarding flow (`/apply-as-leader`) with auto-verification against a PnL threshold + 30-day history
- "My follows" dashboard showing every active copy relationship with pause/edit/unfollow
- Cascading stress test on `/health` that models correlated moves across BTC/ETH (not just same-% across all assets)

## What's Blocked (unchanged from Phase 2)

These are the three answers that unlock Phase 3.5. All of them come from the Bulk integrator program — faster to ask them than to guess.

1. **Bulk bridge mechanics** — how USDC lands on BULK Net. Blocks production ramp validation.
2. **Agent Wallet scope granularity** — "symbol=X, maxNotional=$Y, expiresAt=Z" confirmation. Blocks copy-trade executor design.
3. **Leaderboard data** — integrator-program endpoint or self-indexing?

## OPEN QUESTIONS

1. **Seeding real leaders**: when we launch, the leaderboard needs ≥20 real traders to not look empty. Do we have an outbound list? Twitter/Farcaster DMs to current on-chain whales with a pitch deck? Worth starting Phase 3.5 alongside this outreach.
2. **Invite code distribution**: with the seeded `klub-0001..0005` codes, where do they go first? Your network? A Twitter drop? A podcast appearance?
3. **The /trade screen's "Submit" alert** — I put a plain `window.alert()` for honest "not wired yet" signaling. Do you want a prettier stub modal instead for demos, or keep it brutally honest?
