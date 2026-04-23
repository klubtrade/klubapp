# Live Data — Wired Across the Product

> Five pages now consume real market data via the singleton WebSocket + hooks pattern. Connection state is visible on every surface. Demo-mode fallback renders clean when no backend is reachable. Pattern is proven; remaining wiring is Phase 3.5 account-stream work.

---

## What Landed This Turn

### Pages wired to live market data

| Page | Hooks used | Connection pill | What ticks |
|---|---|---|---|
| `/desk` | `useTickers` + `useFundingRates` + `useConnectionState` | Header pill | Mark prices, funding rates, OI across 6 markets |
| `/pro` | `useTickers` + `useConnectionState` | Status bar + header mark | Watchlist (12 markets), active-symbol price in header |
| `/trade` | `useTickers` + `useConnectionState` | Market header pill | Mark price, replaces simulated tick loop |
| `/quick-trade` | `useTickers` | (inherits connection state via the hook) | Market picker tiles + entry/stop/target math |
| `/home` | `useTickers` + `useConnectionState` | Ticker strip badge | BTC/ETH/SOL/HYPE ticker strip |

### Connection pill — one convention, three states

Every page that reads live data shows the same three-state pill:

- **Live** (green pulsing dot, `text-pnl-long`) — connected to real Bulk WS
- **Reconnecting** (orange pulse, `text-alert-orange`) — backing off after a drop
- **Demo** (grey dot, `text-fg-muted`) — no `NEXT_PUBLIC_BULK_WS_URL`, running the simulator

Placement varies by page (header, status bar, section label), but the visual grammar is identical. A retail user learns it once.

### Seeded fallback everywhere

Every page that pulls from `useTickers()` has a seeded fallback constant for each symbol. Before the first tick arrives — which is only a few frames on live, but potentially forever on demo-mode initialization — the UI renders the seed. So:

- The `/trade` orderbook always has a mid price to center around
- The `/quick-trade` math never shows zeros at mount
- The `/pro` chart and order form have a price to render against
- The `/home` ticker strip renders immediately with recognizable values

This is the difference between "feels alive" and "feels broken for the first 500ms."

---

## The Pattern (Canonical, for Future Pages)

```tsx
'use client';

import { useMemo } from 'react';

import { useConnectionState } from '@/hooks/use-connection-state';
import { useTickers } from '@/hooks/use-tickers';

const SYMBOLS = ['BTC-USD', 'ETH-USD'] as const;
const SEED: Record<string, number> = { 'BTC-USD': 67_420, 'ETH-USD': 3_284 };

export default function YourPage() {
  // Stable symbol array avoids effect churn
  const symbols = useMemo(() => [...SYMBOLS], []);
  const prices = useTickers(symbols);
  const { isLive, isDemo, isReconnecting } = useConnectionState();

  // Always resolve to *something* — seed is the last-resort fallback
  const btcPrice = prices['BTC-USD']?.mark ?? SEED['BTC-USD'];

  return (
    <div>
      <ConnectionPill isLive={isLive} isDemo={isDemo} isReconnecting={isReconnecting} />
      <span>${btcPrice.toFixed(2)}</span>
    </div>
  );
}
```

Three rules that matter:

1. **Subscribe once, at the top**, with a stable `useMemo`'d symbol array. Don't call `useTickers` conditionally inside children.
2. **Always have a seeded fallback.** The hook returns `undefined` until the first tick. Zero is never the right fallback; render a plausible seed.
3. **Use `useConnectionState` as a sibling, not a child.** It's a lightweight observer — subscribing to it twice is fine, but don't prop-drill isLive/isDemo everywhere.

---

## What's Left (Backend-Gated)

Three integrations remain, all Phase 3.5:

### 1. Account streams (requires signer)
Once the wallet is connected and the agent-wallet authorization lands on Bulk, the `/home` dashboard's equity/PnL/positions/health stop being stubs. The hook to write is `useAccountStream(pubkey)` → `{ equity, positions, realizedPnl24h }`. Follows the same pattern — just subscribes to `{ type: 'account', user: pubkey }` instead of `{ type: 'ticker' }`.

### 2. Worker-side subscribers (real alerts + copy trades)
`apps/worker/src/workers/alerts-worker.ts` and `copy-trade-worker.ts` both stub the WS subscription. Two 5-line changes to pass a `WebSocketImpl` (from the `ws` npm package) to `BulkWebSocket` and subscribe to the account stream for each active user/leader. This single wiring lights up real liquidation alerts and real copy-trade replay.

### 3. Schema confirmation with Bulk
I implemented `funding` and `ticker` payloads against `docs.bulk.trade` spec shapes. Field names and casing may drift from live. A 5-minute pairing with someone holding live Bulk credentials — or a single testnet connection attempt — surfaces any mismatches to fix.

---

## What the User Sees Today

- **Without `NEXT_PUBLIC_BULK_WS_URL` set** (default for local dev, preview deploys, untouched staging): every page shows Demo pill, prices update every 1.8s with plausible simulated drift. Nothing feels empty.
- **With the env var set** to a Bulk WS URL: pages flip to Live pill on successful handshake. Real marks flow in. If the socket drops, pill → Reconnecting, data freezes at last-known values, backoff up to 30s before retry.
- **During the transition from Reconnecting → Live**: UI doesn't stutter; the seeded fallback bridges any gap between "last known" and "first new tick."

---

## File Map (this turn)

```
apps/web/app/(app)/
├── desk/page.tsx         # already wired last turn — this turn's exemplar
├── home/page.tsx         # NEW: LiveTickerStrip component
├── pro/page.tsx          # watchlist, header mark, status bar pill
├── quick-trade/page.tsx  # market picker tiles + math use livePrice
└── trade/page.tsx        # removed setInterval loop, added TradeConnectionPill
```

No changes to `packages/api-client/`, `packages/signing/`, or the hooks themselves. The pattern established in the previous turn worked without modification.

---

## Next Move

Three options now, in decreasing technical cost:

1. **Worker WS wiring** — 2-page change (alerts + copy-trade workers). Lights up real liquidation alerts and copy trades on the backend side. Requires the `ws` npm package dep. Estimate: 20 min.

2. **Run the beta** — the product is ready for twenty real testers. `docs/beta-outreach.md` is the playbook. The live-data pattern handles the "what they see" question; now it's a question of "who they are." Estimate: a week, mostly non-technical.

3. **Bulk schema confirmation** — a message to whoever at Bulk can confirm our ticker/funding payload shapes. Five minutes of their time, unblocks real data with confidence. Estimate: writing the question is 10 min.

The honest recommendation: do #3 today (one email), do #1 this week (one afternoon), and start #2 Monday (the week-long thing).
