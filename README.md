# KLUB

Members-only on-chain perps front-end, built on Bulk Exchange.

## Quick start

```bash
pnpm install
pnpm dev
# → http://localhost:3000
```

Landing page is at `/`. Entering the app routes to `/trade`. In-app surfaces live at `/trade`, `/follow`, `/calculator`, `/health`, `/practice`, and `/invite/demo` for the invite flow.

## Structure

```
apps/web/                 — Next.js 14 App Router app
  app/
    page.tsx              — / landing (minimalist, purple, Framer Motion fly-ins)
    trade/                — /trade, the main app entry
    follow/               — /follow leaderboard + /follow/[handle] profiles
    calculator/           — /calculator (The Math)
    health/               — /health portfolio score + stress test
    practice/             — /practice testnet + journal
    invite/[code]/        — invite-gated signup
    api/                  — /api/portfolio, /api/invite, /api/waitlist
  components/
    top-nav.tsx           — shared in-app nav (landing has its own)
  lib/
    mock-data/            — seeded leaders for /follow
    ramp/                 — Coinbase + experimental Ika drivers

packages/
  api-client/             — typed wrapper around Bulk Exchange API (+ WS)
  calc/                   — pure-math liquidation / PnL / health engine

deck/                     — investor deck, demo script, tearsheet
marketing/                — founding blog, content calendar, email sequence
docs/                     — leader outreach playbook
klub-preview.html         — standalone landing preview (opens in any browser)
```

## Design tokens

- **Palette:** near-black matte (`#0A0A0B`) with light-purple accent (`#A78BFA`).
- **Type:** Inter (UI), JetBrains Mono (numerics + labels).
- **Radii:** `rounded-klub` (10px), `rounded-klub-lg` (16px).
- **Motion:** Framer Motion `whileInView` on the landing; CSS `.reveal` utility elsewhere. Respects `prefers-reduced-motion`.

## Phase status

- **Phase 1 — Foundations** ✓
- **Phase 2 — Core math** ✓
- **Phase 3 — Differentiators** ✓
- **Phase 4 — Go-to-market** ✓
- **Phase 3.5 — Backend** (alerts worker, copy-trade engine, Postgres, bulk-keychain signing) — next

See `PHASE-*-BRIEF.md` files for per-phase detail.
