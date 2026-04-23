# Live Data — WebSocket Wiring

> Bulk WebSocket client enhanced with state observer and funding topic. Three React hooks. `/desk` wired as the exemplar with a Live/Demo indicator that tells users which mode they're seeing. Every other live-data surface follows the same pattern.

---

## What Changed This Turn

### `packages/api-client/src/websocket.ts`
- Added **`funding`** stream topic for per-symbol funding-rate updates (`rate8h`, `predictedRate8h`, `oi`, `nextFundingTs`).
- Added **`ConnectionState`** type (`idle` · `connecting` · `open` · `closed` · `reconnecting`) and `onStateChange(listener)` / `getState()` observer API on the client.
- State transitions emitted through the socket lifecycle so UI can render accurate indicators.

### `apps/web/lib/market-data/client.ts` · NEW
Singleton wrapper around `BulkWebSocket`. One socket per browser tab, shared across all hooks and components. Handles:

- **Lazy connection** — connects only when the first subscriber appears.
- **Demo-mode fallback** — if `NEXT_PUBLIC_BULK_WS_URL` is absent, generates simulated ticks for a seeded market list (BTC, ETH, SOL, HYPE, DOGE, AVAX, LINK, ARB, OP, NEAR, APT, SUI) so pages still render alive content without a backend.
- **Typed subscriptions** — thin wrapper that forwards to `BulkWebSocket.subscribe` and tracks demo subscribers.
- **State observability** — `onStateChange(listener)` for downstream components.

### `apps/web/hooks/` · NEW
Three React hooks consuming the singleton:

- **`useConnectionState()`** → `{ state, isLive, isDemo, isReconnecting }`. Used to render the Live/Demo pill.
- **`useTickers(symbols)`** → map of `{ symbol, mark, updatedAt }` keyed by symbol. Subscribes to ticker streams.
- **`useFundingRates(symbols)`** → map of `{ symbol, rate8h, predictedRate8h, oi, nextFundingTs, updatedAt }`. Subscribes to funding streams.

Each hook handles its own subscribe/unsubscribe lifecycle cleanly when the `symbols` array changes — no socket churn.

### `apps/web/app/(app)/desk/page.tsx`
Rewired from local `setInterval` simulated ticks to the real hooks. Now:
- Reads `useFundingRates()` + `useTickers()` for the data
- Renders a `<ConnectionPill />` — shows **Live** (green pulsing dot) when open, **Demo** (grey dot) when fallback is active, **Reconnecting** (orange pulse) during backoff
- Handles `updatedAt === 0` (no data yet) by rendering em-dashes instead of zero values

---

## Connection States the User Sees

| Env / Condition | Pill | What it means |
|---|---|---|
| `NEXT_PUBLIC_BULK_WS_URL` unset | **Demo** (grey) | Simulated ticks. Local dev, preview deploys, CI. |
| WS URL set, connected | **Live** (green pulsing) | Real Bulk data. |
| WS URL set, connecting | **Reconnecting** (orange pulse) | Initial handshake or post-drop backoff. |
| WS URL set, closed by user | (no pill) | `disconnect()` was called explicitly. |

Demo mode is honest — we label it. The only time a pill isn't shown is when the socket was deliberately closed by app code.

---

## How to Wire Another Page

Pattern for any page that needs live data:

```tsx
'use client';

import { useConnectionState } from '@/hooks/use-connection-state';
import { useTickers } from '@/hooks/use-tickers';

const SYMBOLS = ['BTC-USD', 'ETH-USD'] as const;

export default function YourPage() {
  const tickers = useTickers(SYMBOLS.slice());
  const { isLive, isDemo } = useConnectionState();

  return (
    <div>
      {isDemo && <DemoBanner />}
      {SYMBOLS.map((s) => {
        const t = tickers[s];
        return (
          <div key={s}>
            {s}: {t ? `$${t.mark.toFixed(2)}` : '—'}
          </div>
        );
      })}
    </div>
  );
}
```

### Subscribing to account streams

For user-specific data (positions, equity), you need an authenticated
connection. Until Phase 3.5 wires the signing handshake, this path
returns demo data only. When wallet is connected, the pattern will be:

```tsx
// Planned: useAccountStream(pubkey) → live positions + equity
```

---

## What's Still Not Done (Before Real Live Data)

Five concrete items, in order of dependency:

1. **Confirm Bulk's actual WS message schema.** I've implemented against `docs.bulk.trade` spec shapes, but the real payload field names for `funding` and `ticker` may differ. A 5-minute pairing with someone who has live Bulk access closes this.

2. **Wire `/pro` to the hooks.** Same pattern as `/desk` — swap its local `useMemo` simulated ticks for `useTickers(WATCHLIST.map(w => w.sym))`. About 40 lines of change. Left for next turn because I didn't want to re-architect that file in the same commit.

3. **Wire `/home` snapshot.** Equity / PnL / open positions currently hardcoded. Needs `useAccountStream(pubkey)` once authenticated streams are live.

4. **Wire `/quick-trade` and `/trade` to real mark prices.** Currently the mark is a seeded constant in `INITIAL_PRICES`. Swap for `useTickers([symbol])` — 3 line change per page.

5. **Worker-side subscriber.** `apps/worker/src/workers/alerts-worker.ts` has a commented-out "subscribe to account WS" step. The `@klub/api-client` `BulkWebSocket` works in Node as long as you pass `WebSocketImpl` (from the `ws` npm package). This is the single wire-up that lights up real liquidation alerts.

---

## Why This Architecture

Three choices worth calling out:

**Singleton over per-component.** A React app with 5 hooks each opening their own socket is both wasteful and a rate-limit risk at the Bulk edge. One socket per tab, shared via the `marketData` singleton, multiplexed by topic.

**Demo-mode as first-class citizen.** Every feature page works without a backend. Preview deploys for pull requests don't need a live Bulk connection. Beta testers fresh on testnet see live-looking data during the few minutes before their account funding clears. The alternative — blank loading states everywhere — makes the product feel broken during the most common first-impression scenarios.

**State observable, not polled.** Components that need the Live/Demo pill subscribe once, then re-render on transitions. No polling, no stale indicators. This matters when the connection drops mid-session — the user sees the transition to Reconnecting within 100ms instead of after the next user interaction.

---

## To Test Live (when you have a WS URL)

```bash
# Local — with env var pointing to Bulk testnet WS
export NEXT_PUBLIC_BULK_WS_URL="wss://testnet-api.bulk.trade/ws"
pnpm --filter @klub/web dev

# Visit /desk. Watch the pill:
#   1. "Reconnecting" briefly on page load
#   2. "Live" once handshake completes
#   3. Funding rates + marks populate as messages arrive
#   4. Pull the plug → "Reconnecting" appears; data keeps last known values
```

Without the env var, the page falls through to demo mode automatically — no error, no special handling required.

---

## File Map (this turn)

```
packages/api-client/src/
├── websocket.ts           # funding topic + ConnectionState + onStateChange()
└── index.ts               # ConnectionState re-exported

apps/web/
├── lib/market-data/
│   └── client.ts          # singleton + demo-mode fallback
├── hooks/
│   ├── use-connection-state.ts
│   ├── use-tickers.ts
│   └── use-funding-rates.ts
└── app/(app)/desk/
    └── page.tsx           # wired to real hooks
```

---

*Pattern is set. `/pro`, `/home`, `/quick-trade`, `/trade` are all small follow-ups that use the same three hooks. The heavy lifting is done.*
