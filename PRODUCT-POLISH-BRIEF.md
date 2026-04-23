# Retail UX Polish

> Six new surfaces, four new components, one new CSS system. Goal: make KLUB feel A++ the moment a retail trader lands on it.

---

## What Shipped

### New surfaces

**`/home`** — the new destination after "Enter the app." Greets the user by time of day, shows their equity / 24h PnL / open positions / health score in a four-card snapshot, offers a hero "Open a trade" action with a risk-profile card beside it, four quick-action tiles (Trade / Follow / Math / Practice), and a "From leaders you follow" feed that falls back to a welcoming empty state when the user hasn't started copy-trading yet. Redirects first-time visitors to `/onboarding`.

**`/onboarding`** — a three-step wizard that sets the user's risk profile and picks their first action. Step 1 collects a handle. Step 2 presents three risk profiles (Conservative / Balanced / Aggressive) with each one's derived defaults visible (max leverage, default leverage, copy cap). Step 3 offers four first-action tiles, with "Practice first" marked as Recommended. Framer Motion transitions between steps. Writes `onboardingComplete: true` on finish and fires a success toast before redirecting.

**`/quick-trade`** — simplified retail trade flow. Three questions in plain English: Which way (Up ↗ / Down ↘)? Which market (BTC / ETH / SOL)? How much ($ slider, 1–50% of account)? The math summary reads as bullet points: "If BTC moves 10% in your favor, you'd make +$15. If it hits your stop, you'd lose -$8. Liquidation kicks in at 12% adverse move." Leverage is pulled from the user's risk profile, invisible by default. Confirmation modal before submit. Link at the bottom to the expert `/trade` view for users who want the orderbook.

**`/settings`** — user preferences. Six sections: Risk profile, Trade mode (simple/expert default), Copy defaults (allocation cap slider, capped by risk profile), Alerts (master toggle with configure-channels link), Wallet (Connect stub), Danger zone (clear-local-data with confirm prompt). Every change fires a toast. Settings persist via the user-prefs system.

### New components

**`<BottomNav />`** — mobile-only tab bar (hidden on desktop via `md:hidden`). Four destinations: Home, Trade (→ /quick-trade), Follow, Profile (→ /settings). Inline SVG icons that fill when active. Active route shows the accent color. Safe-area-inset padding so it sits above the iOS home indicator.

**`<ToastProvider />` + `useToast()`** — four kinds: success, info, error, warning. Auto-dismiss after 4 seconds, hover to pause the timer, Esc to clear all. Slides up from the bottom on mobile, top-right on desktop. Used for "Trade placed," "Following @x," settings saves, and errors.

**`<EmptyState />`** — reusable welcoming template for no-data scenarios. Icon (optional), title, description, primary CTA, secondary CTA. Used on `/home` (when no follows), `/practice` (when no open trades). Every empty state is welcoming and offers a next action, never "nothing here."

**`<useUserPrefs />`** — localStorage-backed preferences hook. Stores risk profile, onboarding status, preferred trade mode, default copy allocation, alerts on/off. Phase 3.5 will mirror these to the DB when the user is authenticated; the hook is the single source of truth that both paths read through.

### New CSS system — button utilities

Four reusable button classes in `globals.css` so every CTA across the app feels consistent:

- **`.btn-primary`** — filled purple, main action. Hover: lifts 1px + brightens. Active: scales to 98%. Focus: purple ring.
- **`.btn-secondary`** — bordered, secondary action. Hover: darker border + subtle bg.
- **`.btn-ghost`** — text-only, tertiary.
- **`.btn-danger`** — red, for destructive actions (close position, revoke key, clear data).

Plus size variants `.btn-sm` / `.btn-lg` and `.btn-block` for full-width. All respect `prefers-reduced-motion`.

### Updated existing

- **Landing page** — CTAs now route to `/home` (was `/trade`), so first-time visitors see the dashboard, not the raw trading screen.
- **TopNav** — added Home as the first link, renamed "The Math" to "Math" for brevity, added a Settings gear icon next to the Connect button on desktop.
- **`/practice`** — bare "No open paper trades yet" string upgraded to an `<EmptyState>` with a "See The Math first" CTA.

---

## Why These Changes

Retail traders bounce when the first thing they see is an orderbook. The pivot is:

1. **Dashboard before trading screen.** Put a "here's you, here's what to do" greeting in front of them.
2. **Simple trade mode before expert mode.** The vast majority of retail wants "direction, market, amount" — not limit-price, size-base, leverage-slider, TP, SL.
3. **Risk profile as a global default.** Once you've said you're Conservative, the rest of the app caps leverage, widens stops, and sets copy allocation ceilings automatically. No retail user should type `leverage: 50` before they've seen what leverage means.
4. **Mobile nav that works.** Retail trades from their phone. A top-nav with five text links is a usability landmine under 768px; a bottom tab bar is what Coinbase, Robinhood, and every app they already know uses.
5. **Toasts for every meaningful action.** Placing a trade, following a leader, saving settings — all give instant visual feedback. Without it, users second-guess whether the button worked.
6. **Empty states as onboarding surfaces.** "You're not following any leaders yet — here's how it works" is a better use of pixels than "No data."
7. **Tactile buttons.** The press-to-scale, hover-to-lift, focus-ring-purple treatment communicates "this is a real button" at a glance. It's the smallest thing that makes cheap products feel expensive.

---

## What's Still Not Done

Called out honestly so nothing's a surprise:

1. **No real wallet connection yet** — the `/settings` wallet section shows a stub. Phase 3.5 wires Privy + Solana wallet adapter.
2. **`/home` data is still demo** — equity, PnL, health score are hardcoded. They pull from `/api/portfolio` once the user is signed in.
3. **Alerts config page at `/settings/alerts`** — stub link. The per-tier / per-channel config UI is a next-turn item.
4. **Learn/education drawer** — mentioned in the scope, deferred. A side drawer that pops up with "What is leverage?" explanations would be a strong addition.
5. **Celebratory micro-interactions** — first-trade, first-follow, first-100%-health should feel like small wins. Confetti, haptic-style pulses, sound on opt-in. Deferred.
6. **Loading skeletons** — currently every page shows "Loading…" text. Proper shimmering skeletons would be a polish win.
7. **Haptic feedback on mobile taps** — `navigator.vibrate()` for primary CTAs on supported devices.

---

## Local Run

```bash
git clone <your-repo-url>
cd klub
pnpm install
docker compose up -d
cp .env.example .env.local
pnpm --filter @klub/db generate
pnpm --filter @klub/db migrate
pnpm --filter @klub/web dev
# → http://localhost:3000
# → click "Enter the app" → lands on /home
# → fresh install redirects to /onboarding
```

Full deployment steps (local + production on Vercel + Railway + Neon + Upstash + Resend + Cloudflare + Sentry) are in [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

---

## File Map (this turn)

```
apps/web/
├── lib/
│   └── user-prefs.ts               # NEW — risk profile + prefs hook
├── components/
│   ├── toast.tsx                   # NEW — ToastProvider + useToast
│   ├── bottom-nav.tsx              # NEW — mobile tab bar
│   ├── empty-state.tsx             # NEW — reusable empty template
│   └── top-nav.tsx                 # UPDATED — Home + Settings
└── app/
    ├── globals.css                 # UPDATED — .btn-* utility classes
    ├── (marketing)/
    │   └── page.tsx                # UPDATED — CTAs → /home
    └── (app)/
        ├── layout.tsx              # UPDATED — ToastProvider + BottomNav
        ├── home/page.tsx           # NEW — dashboard
        ├── onboarding/page.tsx     # NEW — 3-step wizard
        ├── quick-trade/page.tsx    # NEW — simplified trade
        ├── settings/page.tsx       # NEW — user prefs UI
        └── practice/page.tsx       # UPDATED — EmptyState
docs/
└── DEPLOYMENT.md                   # NEW — step-by-step deploy guide
```

---

*The UX pivot is done. Next natural move is wiring the real wallet + live data, which is the last Phase 3.5 piece. After that, the product is mainnet-ready subject to counsel review.*
