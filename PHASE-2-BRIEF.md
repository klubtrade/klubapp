# Phase 2 — Core Trading

> The Math + Portfolio Health + ramp abstraction. Auth wired, wallet adapters in.

## What's Shipped

### New package: `@klub/calc`
Pure, tested math for the two flagship retail features.

- **`calculate(input)`** — the pre-trade calculator.
  - Notional, required margin
  - Liquidation price (isolated linear perp — full derivation documented in source)
  - PnL at target (net of fees)
  - Loss at stop (net of fees, flags when stop is beyond liquidation)
  - Funding cost per 8h / per 24h (signed by side)
  - Breakeven price and move required
  - Reward:risk ratio
- **`healthScore(portfolio)`** — 0–100 overall score with four subscores:
  - Liquidation proximity (40% weight) — anchored to the 25%/10%/3% alert tiers
  - Leverage exposure (25%)
  - Concentration risk (20%, Herfindahl index)
  - Funding burn rate (15%)
  - Plain-English recommendations ranked by severity
- **`stressTest(portfolio, shock)`** — apply a correlated or single-asset shock, get the shocked score, equity after, and list of liquidated positions.
- **23 tests** covering formula correctness, edge cases, band thresholds, and liquidation detection.

### `/calculator` page — *The Math*
- Live-recomputing inputs (side, leverage, entry, size, target, stop, maintenance, fees, funding)
- Liquidation price shown huge in amber with buffer bar and tier label
- **Stop-safety warning** — if your stop price is beyond the liquidation price, we scream about it
- Cost card: notional, margin, round-trip fees, daily funding, breakeven price, R:R
- Zero auth required — runs entirely client-side

### `/health` page — *Portfolio Health*
- Seeded with a 3-position demo portfolio so users can drive it without connecting
- 0–100 score with band label and animated fill bar
- **Stress test slider:** −40% to +40% market move, correlated or single-asset
- Live score delta, equity-after, PnL-from-shock, liquidated-positions list
- Subscore breakdown (four bars, each labeled)
- Plain-English recommendations

### Auth scaffolding
- `Providers` component wrapping the app:
  - `PrivyProvider` (email + wallet + Google + Apple) — gracefully absent if `NEXT_PUBLIC_PRIVY_APP_ID` is unset
  - `ConnectionProvider` + `WalletProvider` with Phantom, Backpack, Solflare adapters
  - Theme aligned with KLUB brand (dark, amber accent)

### Ramp abstraction
Pluggable driver interface at `apps/web/lib/ramp/`:
- **`RampDriver`** interface: `isAvailable()`, `getQuote(input)` → `RampQuote`
- **`coinbaseDriver`** — production. Assembles a real Coinbase Onramp redirect URL with the user's Solana address and USDC as the default asset. Activates when `NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID` is set.
- **`ikaExperimentalDriver`** — experimental stub. Documents the eventual Ika (dWallet 2PC-MPC) + Encrypt (FHE) architecture. Stays unavailable on mainnet per the pre-alpha warnings in both projects' docs. Activates only when `NEXT_PUBLIC_EXPERIMENTAL_IKA_RAMP=true` and on testnet.
- **`pickDriver(params)`** — strategy: testnet + experimental flag → Ika; else first available production driver.

### KLUB rebrand (applied in place)
- Root package: `cockpit` → `klub`
- Scoped packages: `@cockpit/*` → `@klub/*`
- Landing page copy rewritten around the members-only thesis
- Hero widget pivoted from "your position" (cockpit metaphor) to "Now following @alphamamba" (copy-trade metaphor — aligned with KLUB's hero feature)
- Sub-product names: **Basis** (vault), **The Desk** (funding arb), **KLUB Pro** (terminal), **Practice** (testnet), **Follow** (copy trading), **The Math** (calculator)

## What I Decided On Without Asking

Applying "just go" to the five Phase 2 gating questions:
1. **Auth:** Privy + Solana wallet adapter ✓
2. **Waitlist storage:** Logged stub now; Resend + Postgres in Phase 3 once the DB is in play
3. **Deployment:** Vercel for web, Railway for workers (Phase 3+)
4. **Bulk team contact:** Still blocked on your side
5. **Name: KLUB** ✓

## Phase 3 — Preview

Before building anything, Phase 3 needs three answers from you (or the Bulk team via integrator program):

1. **Bulk bridge & USDC deposit mechanics** — how does USDC reach BULK Net? The on-ramp design detail depends on this.
2. **Agent Wallet scope granularity** — can we scope a key to "this symbol, max this notional, expires at X"? Copy trading UX depends on this.
3. **Leaderboard aggregation endpoint** — will Bulk expose a precomputed PnL leaderboard for integrators, or do we build an indexer against the account WS stream?

Scope locked for Phase 3:
- **Follow** — opt-in leader onboarding flow, net-of-fees leaderboard UI, mirror-execution worker
- **Liquidation Alerts** — BullMQ worker consuming the Bulk account WS, dispatching push / email / Telegram, with one-tap action links
- **Practice (Testnet Mode)** — top-of-app toggle that swaps network flags, plus a trade journal that auto-logs entries + user-supplied reasoning
- **Waitlist → Resend + Postgres** — real storage for emails we're already capturing
- **`/trade` screen** — live orderbook + positions + order form, with The Math as a side panel

## What's Blocked

- **Bulk bridge architecture** — unknown, blocks production ramp validation
- **`bulk-keychain` npm availability** — peer dep, may need GitHub install in Phase 3
- **Agent Wallet scope spec** — docs imply granularity but we need confirmation before designing the copy-trade UX

## OPEN QUESTIONS

1. Should `/calculator` and `/health` link from the top nav of the landing page, or only from the footer? Currently footer-only.
2. For the demo portfolio on `/health`, should I add a "Load my Bulk account" button (stub for Phase 3) as a nudge to sign up? Or leave it clean?
3. Do you want a simple `/invite/[code]` page before Phase 3, so you can start handing out pre-launch invites from a Twitter bio or DMs?
