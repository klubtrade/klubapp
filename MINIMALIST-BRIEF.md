# KLUB — Minimalist Redesign

> Every in-app page stripped to one focus. Secondary information lives behind a tap. One navigation drawer replaces every prior nav surface. No marketing chrome — pure product work.

---

## Design rules

Four rules applied everywhere:

1. **One focus per page.** Every page answers exactly one question on first view. Anything else is a tap away.
2. **Disclosure over density.** Details live behind "Show X" buttons — a text link, not a card. When closed, the page stays quiet.
3. **One menu, one place.** Navigation is a single hamburger button in the top-left that opens a slide-in drawer. No top-nav pills, no bottom tab bar, no More dropdowns.
4. **Max-width 448px for most pages.** Mobile-first by construction. Desktop users get a comfortable reading measure, not a sprawling grid.

---

## Changes per page

### Chrome
- **`<NavDrawer />`** — one hamburger top-left, KLUB wordmark top-right. Same UI on web and mobile. Drawer groups: **Trade** · **Earn** · **More**. Wallet pinned to the drawer footer. Escape + click-outside + route-change auto-dismiss.
- **`(app)/layout.tsx`** — simplified to `<ToastProvider> + <NavDrawer />`. Nothing else.
- **Deleted:** `top-nav.tsx`, `bottom-nav.tsx`, `empty-state.tsx`. Components folder is now three files.

### `/home`
Before: greeting + 4-card snapshot + live ticker strip + hero action card + risk profile card + 8-tile quick actions + activity feed. **Seven sections.**
After: greeting + two buttons (*Open a trade* / *Follow a leader*). **Show details** reveals equity/PnL/positions/health/markets.

### `/quick-trade`
Before: header + kicker + step numbers + titled sections + math panel always visible + expert-view link with trust strip.
After: direction toggle + market row + amount slider + submit. **Show math** reveals target/stop/liquidation. Expert-view link at the bottom.

### `/basis`
Before: hero metrics grid + deposit form + position card + allocation + how-it-works 3-card + risk warning block + FAQ footer.
After: APY number + mode toggle + amount + submit. **Learn more** reveals how it works, allocation, fees, risks.

### `/desk`
Before: hero APY + ranked opportunity cards + desktop table + mobile cards + dual Live/Demo pill.
After: quiet list — market, 8h funding, annualized. Tap a row to trade. One Live/Demo pill in the header.

### `/follow` (leaderboard)
Before: headline + filter-chip row + sort dropdown + dense table with rank/leader/style/PnL/win/DD/followers.
After: small label + quiet list (avatar, handle, style tag, PnL). **Filter** reveals style + sort.

### `/follow/[handle]` (leader profile)
Before: big-avatar header + bio + favorite markets + stats grid + recent trades + copy-config panel always rendered.
After: small avatar + handle + one-line style + headline PnL + Follow button. **About · Stats · Recent trades** each behind their own disclosure. Copy config opens in a slide-up modal.

### `/calculator`
Before: two-column layout + "The Math" hero + dense side-panel result + explanation cards.
After: single column — direction toggle + 4 inputs + inline result rows. Warning banner surfaces only when stop is past liquidation.

### `/health`
Before: score dial + 4-factor chart + recommendations list + stress-test panel always visible.
After: big score + band label. **Show breakdown** / **What should I do?** as separate disclosures.

### `/practice`
Before: open trades table + stats dashboard + closed-history table + always-visible log form.
After: open trades list + **Log a trade** button (opens form). **Show stats** / **Show history** as disclosures.

### `/onboarding`
Before: progress bar + "Step N of 3" label + H1 + descriptive paragraph + form.
After: progress bar + H1 ("Pick a handle." / "How much risk?" / "Where do you start?") + form. No step labels, no explanatory paragraphs.

### `/settings`
Before: intro paragraph + 6 sections with descriptions + danger-zone framing.
After: four labeled rows — Wallet, Risk profile, Alerts, Local data. No section descriptions.

### `/ramp`
Before: kicker + H1 + 3-step progress bar + step-numbered sections + trust strip footer.
After: Amount + method + submit. **Show breakdown** reveals fees and settlement time.

### `/invite/[code]`
Before: label + H1 + handle and email side-by-side + spots-remaining badge + redundant copy.
After: label + H1 + single email field + submit. Success is one line + continue link.

### Intentionally kept dense
- **`/pro`** — expert terminal, six-panel grid, ⌘K command palette. The whole point is "give me everything on one screen." Minimalism would defeat it. Mobile gate redirects to `/quick-trade`.
- **`/trade`** — expert trade screen. Orderbook + chart + order form + positions. Users who open `/trade` have opted out of Quick Trade.

---

## What's in the repo now

```
apps/web/
├── app/
│   └── (app)/
│       ├── layout.tsx              ← NavDrawer + ToastProvider
│       ├── home/page.tsx           ← greeting + 2 buttons + details disclosure
│       ├── quick-trade/page.tsx    ← direction, market, amount, submit
│       ├── follow/
│       │   ├── page.tsx            ← quiet list + filter disclosure
│       │   └── [handle]/
│       │       ├── page.tsx        ← profile + headline PnL
│       │       └── copy-config.tsx ← LeaderDetails (disclosures + modal)
│       ├── basis/page.tsx          ← APY + form + learn more
│       ├── desk/page.tsx           ← quiet funding list
│       ├── calculator/page.tsx     ← single column math
│       ├── health/page.tsx         ← big score + disclosures
│       ├── practice/page.tsx       ← journal with disclosures
│       ├── onboarding/page.tsx     ← one question per step
│       ├── settings/page.tsx       ← four rows
│       ├── ramp/page.tsx           ← amount + method + submit
│       ├── invite/[code]/
│       │   ├── page.tsx            ← server validator
│       │   └── invite-flow.tsx     ← single email → submit
│       ├── pro/page.tsx            ← expert terminal (unchanged)
│       └── trade/page.tsx          ← expert trade (unchanged)
└── components/
    ├── nav-drawer.tsx              ← hamburger + slide-in panel
    ├── toast.tsx
    └── wallet-button.tsx
```

---

## To run locally

```bash
unzip klub-full-project.zip && cd klub
pnpm install
docker compose up -d
cp .env.example .env.local
pnpm --filter @klub/db generate && pnpm --filter @klub/db migrate
pnpm --filter @klub/web dev
# → localhost:3000
# → tap hamburger top-left to see the drawer
# → every page opens with one focus; tap disclosures to dig in
```

To open the HTML preview without running the app: open `klub-minimal-preview.html` in any browser.

---

## What this is not

- Not a style redesign. Colors, fonts, spacing tokens are unchanged — same purple accent, same Inter + JetBrains Mono, same rounded-klub radii.
- Not a content removal. Every number and feature that was on a page before is still on that page — just behind a disclosure instead of visible by default.
- Not marketing polish. No new copy, no hero animations, no testimonial strips. Product-only work.

---

## What to look at first

1. Open `klub-minimal-preview.html` — 30 seconds to get the feel across five surfaces (Home, Trade, Basis, Desk, Follow).
2. Tap the hamburger menu top-left in the preview — that's now the ONLY navigation anywhere in the app.
3. If the feel is right, unzip `klub-full-project.zip` and run it locally — every in-app route matches this language.
4. If something still feels too busy, point at a specific page and I'll tighten it further.
