# KLUB

**Members-only on-chain perps. Built on Bulk Exchange.**

*Trade with the klub. Skip the tuition. Keep your own keys.*

---

## The Problem

**~60% of retail traders on on-chain perps are liquidated within their first 30 days.** Not "lose money." Liquidated. Four compounding causes: they can't size positions, they don't understand funding, they have no safe way to practice, and they have no on-ramp that respects them.

## The Product

A consumer-facing front-end to on-chain perpetual futures that does for retail what professional desks already do for themselves.

**V1 features (shipping Q2 2026):**
- **Follow** — opt-in, net-of-fees copy trading leaderboard with one-click mirroring and user-set guardrails
- **The Math** — live pre-trade calculator: liquidation price, PnL, funding cost, breakeven, R:R
- **Liquidation Alerts** — tiered (25% / 10% / 3%) push / email / Telegram, one-tap actions
- **Portfolio Health** — 0–100 score + plain-English stress test
- **Practice** — real Bulk testnet + auto-logged trade journal
- **3-Tap Ramp** — card → USDC on Bulk, no bridges

**V2 roadmap:** Basis (funding-harvest vault), The Desk (funding arbitrage engine), KLUB Pro (Bloomberg-style terminal).

## Architecture

Non-custodial throughout. User funds remain in the user's own Bulk account; KLUB executes via scoped, revocable Agent Wallet keys. No KLUB wallet holds user USDC at any point in the stack.

Built on [Bulk Exchange](https://bulk.trade) — BULK Net L1, 5–20ms matching latency, Ed25519 signing via `bulk-keychain`. Integrator-program partnership.

## Business Model

- **Performance fees** on copy trading (proposed 20%: 10% leader / 10% platform)
- **Management fees** on Basis vault (proposed 2/20)
- **Ramp rebate** from provider (~10–30 bps)
- **PFOF integrator share** from Bulk (pending integrator program terms)

No token at launch.

## Market

TAM: global retail perpetual-futures traders, ex-US/UK at launch (~95% of addressable market by jurisdiction). Early-adopter segment estimate: 1–3M active retail perp traders today across CEX + DEX, growing with on-chain volume share.

## Traction

- **Engineering:** Monorepo built. V1 front-end surfaces shipped (landing, calculator, health, trade, follow, practice, invite). Typed Bulk API client with tests. Pure-math engine with unit-tested liquidation / health / stress-test formulas.
- **Partnership:** Bulk integrator program accepted.
- **Waitlist:** Open, pre-launch.
- **Leaders:** Manually onboarding first 20 in parallel with Phase 3.5 backend build.

## What's Next (Funding Use)

1. Complete Phase 3.5 backend: copy-trade execution engine, liquidation alerts worker (BullMQ + Redis), waitlist → Postgres + Resend, `bulk-keychain` wiring
2. Onboard 20 opt-in leaders with verified PnL histories
3. Launch testnet batch 1 to waitlist
4. Mainnet launch with V1 feature set
5. Begin V2 (Basis vault) development alongside early mainnet users

## Disclosures

Perpetual futures involve substantial risk of loss. KLUB is not the counterparty; all trades execute on Bulk. Copy trading and pooled yield products carry additional risks disclosed at product-level. Not available in the United States, United Kingdom, or sanctioned jurisdictions at launch.

---

**Contact:** [founder name] · [founder@klub.trade] · [twitter/farcaster]
**Website:** klub.trade
**Docs:** [link]
