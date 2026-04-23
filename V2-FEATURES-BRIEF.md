# V2 Features + Market Impact

> Wallet connection wired. Four new product surfaces (Basis, The Desk, KLUB Pro, Ramp). Product video script. Beta outreach playbook. Everything mobile-responsive.

---

## What Shipped

### Wallet connection (real)

`<WalletButton />` component uses the existing Privy + Solana wallet adapter stack. Three states: not-ready, disconnected, connected. Safe-Privy wrapper so the component degrades gracefully when `NEXT_PUBLIC_PRIVY_APP_ID` isn't configured.

- Connected state shows a shortened address (`Fu…PQh7` form) with a green live-dot
- Click to disconnect
- Slot-fitted into TopNav (desktop) and `/settings` wallet section

The providers file was already wired correctly from Phase 2 — Privy with purple accent color, Solana wallet adapter with Phantom/Backpack/Solflare. This turn exposed the real connect flow in the UI.

### Basis vault — `/basis`

Delta-neutral funding-yield vault. Deposit USDC, vault runs paired long/short perpetuals to harvest funding without directional exposure. Page structure:

- Hero metrics: target APY, last-30d actual, TVL, member count
- Deposit/withdraw form with preset amounts, projected yield display
- Your-position card (principal, accrued, your APY)
- Live allocation breakdown with weight bars + per-leg APY
- How-it-works (3 plain-English steps)
- Explicit risks section (funding flip, liquidation edge cases, smart-contract risk) — not buried
- Fees: 2% management + 20% performance above high-water mark

Mobile-responsive: two-column grid collapses to stacked cards under 1024px.

### The Desk — `/desk`

Funding-rate monitor + arb opportunity list. Live funding across every Bulk market, ticking every 2.2s. Spread opportunities ranked by annualized yield with confidence tier (High/Med/Low) and execution route (via Basis or manual). Desktop shows a proper table; mobile collapses to stacked cards with the same data.

Pairs with Basis: when an opportunity has `via: 'basis'`, the CTA routes to the vault. When `via: 'manual'`, it routes to `/trade` for hands-on execution.

### KLUB Pro — `/pro`

Terminal-grade trading screen. Desktop-only — mobile shows a gate suggesting Quick Trade. Six panels in a persistent grid:

1. **Watchlist** (12 markets, mark + 24h chg, click to switch)
2. **Chart** (large central, 7 timeframes, OHLC footer)
3. **Orderbook** (15 levels each side, cumulative size bars)
4. **Tape** (last 40 prints with aggressor side)
5. **Positions** (open position rows with close button)
6. **Order form** (long/short, limit/market, size, leverage slider, preset size %, notional/margin/fees footer)

**⌘K command palette** — opens on ⌘K or Ctrl+K. Searches: markets (switches the chart), navigation shortcuts (/home, /basis, /desk, /ramp), actions (close-all). Full keyboard-first flow.

Status bar at the bottom: connection state, latency, equity, used margin, free margin, version.

### Ramp — `/ramp`

3-tap fiat on-ramp. Amount → method → confirm. Four preset amounts ($50/$100/$500/$1000) + custom input. Three payment methods (Apple Pay recommended at 2.5% fee, card at 2.9%, bank at 0.5% with 1–3d settlement). Final step shows you-pay / fee / you-receive breakdown and redirects to Coinbase Onramp with a properly-constructed URL (real query params, ready to fire when `NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID` is set).

Experimental Ika ZK-KYC ramp behind the `NEXT_PUBLIC_EXPERIMENTAL_IKA_RAMP` flag — shown as an alternative on the confirm screen when enabled.

Mobile-first design throughout; this is the page retail will most likely use on phone.

### TopNav — reshuffled

Added Basis as a first-class link. New "More" dropdown surfaces KLUB Pro, The Desk, The Math, Health, Practice, and Add funds without cramming them into the top bar. Click-outside dismisses the dropdown. Active state bubbles up to the More trigger when any of its children is active.

### Home dashboard — updated QuickActions

Eight tiles now instead of four. New additions: Basis, The Desk, KLUB Pro (all with V2 badge), and Add funds. Quick Trade retains the accent-purple "primary" styling.

### Product video script — `marketing/product-video-script.md`

90-second landing-page hero video, scene-by-scene. Voice is founder-first-person, conversational. Shot list includes both clean-pass (no cursor) and cursor-pass (with clicks) instructions. Placements documented: landing autoplay, pitch emails, Farcaster/Twitter clips, Product Hunt headline, demo day opener. Explicitly no music in v1; no founder face on camera.

### Beta outreach playbook — `docs/beta-outreach.md`

How to recruit 20 real beta testers in 5 days. Three target groups (friends who trade, adjacent founders, retail traders you admire on CT/Farcaster) with DM templates for each, a day-by-day timeline, onboarding flow, feedback capture system, and success/failure signals after 2 weeks.

---

## Mobile Responsiveness Audit

Every surface tested at 375px (iPhone SE), 414px (iPhone 14 Pro Max), 768px (iPad mini portrait), 1024px+ (desktop).

**Pages that work cleanly on mobile:**
- `/` (landing)
- `/home`, `/onboarding`, `/quick-trade`, `/settings`
- `/calculator`, `/health`, `/practice`, `/follow`, `/follow/[handle]`
- `/invite/[code]`
- `/basis`, `/desk`, `/ramp`

**Pages gated for desktop:**
- `/pro` — shows a mobile gate with a "use Quick Trade instead" CTA. Terminals don't work on phones.

**Pages that stay dense on desktop but still work on mobile:**
- `/trade` — orderbook + chart + order form + Math panel stack vertically under lg breakpoint. Expert users mostly on desktop anyway.

---

## File Map (this turn)

```
apps/web/
├── components/
│   ├── wallet-button.tsx           # NEW — real connect/disconnect
│   └── top-nav.tsx                 # UPDATED — More dropdown, WalletButton
└── app/
    └── (app)/
        ├── basis/page.tsx          # NEW — delta-neutral vault
        ├── desk/page.tsx           # NEW — funding rate monitor
        ├── pro/page.tsx            # NEW — terminal screen + ⌘K
        ├── ramp/page.tsx           # NEW — 3-tap deposit
        ├── home/page.tsx           # UPDATED — 8 QuickActions w/ V2 tags
        └── settings/page.tsx       # UPDATED — real WalletButton
marketing/
└── product-video-script.md         # NEW
docs/
└── beta-outreach.md                # NEW
```

---

## Status by Product Promise

| Feature | Front-end | Backend | Mainnet-ready? |
|---|---|---|---|
| Landing + marketing | ✅ Redesigned | — | Yes |
| Home dashboard | ✅ Live | Demo data | Needs `/api/portfolio` auth |
| Onboarding | ✅ 3-step wizard | localStorage | Yes |
| Quick Trade | ✅ | Stub submit | Needs signer |
| Expert Trade | ✅ | Stub submit | Needs signer |
| The Math | ✅ | Pure client | Yes |
| Portfolio Health | ✅ | Stubbed | Needs live Bulk connection |
| Follow | ✅ | Seeded mock | Needs leader indexer |
| Copy trading | ✅ Config UI | Worker skeleton | **Needs KMS + Bulk WS** |
| Practice | ✅ | localStorage | Yes |
| Invites | ✅ | DB-backed | Yes |
| **Basis vault** | ✅ **New** | Stub contract calls | Needs vault contract |
| **The Desk** | ✅ **New** | Simulated ticks | Needs Bulk funding feed |
| **KLUB Pro** | ✅ **New** | Simulated data | Needs everything trade-screen needs |
| **Ramp** | ✅ **New** | Coinbase URL wired | Needs `NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID` |
| Wallet connect | ✅ **New** | Privy + adapter | Yes |
| Liquidation Alerts | ✅ Config UI | Worker skeleton | **Needs Bulk WS subscriber** |

---

## What's Still Not Done

Three genuinely blocking things before mainnet:

1. **Bulk WebSocket subscribers.** Alerts worker + copy-trade worker + Desk + Pro watchlist all need real data. The integration point is `@klub/api-client/websocket.ts`; plugging it in lights up alerts, copy-trade execution, and live feeds across three product surfaces simultaneously.

2. **KMS wrap/unwrap for agent-wallet keys.** Every minted agent wallet's private-key bytes need to go directly to KMS at creation. AWS KMS client wiring in `packages/signing/src/agent-wallet.ts` — roughly 80 lines.

3. **Basis vault contract.** UI assumes a deposit/withdraw contract on BULK Net. The contract itself isn't written; the `/basis` page routes to a stub on submit. This is a real engineering task separate from anything else here.

Nice-to-haves, ordered:

- Privy embedded-wallet setup flow (email sign-in → auto-created wallet)
- PostHog events on every CTA so the beta cohort generates real funnel data
- `/healthz` endpoint on the worker for production liveness probes
- Loading skeletons instead of "Loading…" text across every page
- Celebratory micro-interactions on first trade / first follow / first deposit

---

## To Run It

```bash
unzip klub-full-project.zip
cd klub
pnpm install
docker compose up -d
cp .env.example .env.local
pnpm --filter @klub/db generate && pnpm --filter @klub/db migrate
pnpm --filter @klub/web dev
# → localhost:3000 landing
# → click "Enter the app" → /home dashboard (8 quick actions now)
# → try /basis, /desk, /pro (desktop), /ramp on mobile
```

Full local + production deployment steps in [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

---

## What to Ship Next (my honest take)

The product is broad enough now. The next turn isn't another feature — it's depth on two things:

1. **Real data on the surfaces that exist.** Wire up the Bulk WebSocket feed so `/pro` watchlist ticks with real prices, `/desk` shows real funding, `/home` snapshot is your actual account, `/quick-trade` confirms against a real order. That's one integration that unblocks five surfaces.

2. **Run the beta.** Use `docs/beta-outreach.md`. Recruit twenty people this week. The product's been broad enough to run through a full retail beta for three phases now; every week you wait is a week without real usage data.

Tell me which.
