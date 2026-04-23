# Week 1 — Log

Short, factual record of the Week 1 integration sprint. Updated daily. Every claim links back to a primary source.

---

## Day 1 — Reality-check the assumptions

### Scope

- Verify every Bulk integration assumption against `docs.bulk.trade`
- Replace guesses with facts in `.env.example`
- Install the official signing library
- Document what we found, so future engineers don't re-discover

### What was wrong in the codebase before today

| Assumption (wrong) | Reality (from docs) |
|---|---|
| `BULK_WS_URL=wss://exchange-api.bulk.trade/ws` | `wss://exchange-ws1.bulk.trade` (separate subdomain) |
| Needed a schema-confirmation email to Bulk | Docs publish the full schema publicly; email unneeded |
| Single margin frac per position | Portfolio margin with continuous lambda surfaces + correlations |
| Custom WebSocket subscribe envelope | Real envelope is `{method:'subscribe', subscription:[{type,symbol}]}` — already correct |
| `bulk-keychain` is the npm package name | Browser/TS bindings live at `bulk-keychain-wasm` |
| Agent wallets are our own concept | Agent wallets are native: `POST /manageAgentWallet` |
| Self-trade prevention is our responsibility | Native to Bulk — protocol cancels the resting side |

### What was right in the codebase before today

- Solana wallet adapters (Phantom/Backpack/Solflare) — **correct**. Bulk validators share Solana identity keys, and user pubkeys are base58 Solana format.
- `BTC-USD` symbol format — **correct**. That's what Bulk uses.
- Our REST base URL `https://exchange-api.bulk.trade/api/v1` — **correct**.
- Our subscribe envelope shape — **correct**.
- Our agent-wallet architecture (`canWithdraw: false` invariant, separate pubkey, reuse on re-follow) — **correct by accident**; turns out to match the protocol's native model.

### Files changed

| File | Change | Why |
|---|---|---|
| `.env.example` | Rewritten with real URLs, removed mainnet/testnet base-URL confusion (same base), added testnet-app URL, added auth network flag | Verified URLs from `docs.bulk.trade/api-reference/introduction` and `.../websocket-intro` |
| `packages/api-client/package.json` | Peer dep renamed `bulk-keychain` → `bulk-keychain-wasm` | Correct npm package name, per repo README |
| `apps/web/package.json` | Added `bulk-keychain-wasm` + `bs58` deps | Browser signing flow (Mode A: `prepareOrder` → wallet.signMessage → finalize) |
| `apps/worker/package.json` | Added `bulk-keychain` (Node build) + `bs58` deps | Server-side agent-wallet signing (Mode B: `NativeKeypair` + `NativeSigner`) |
| `docs/bulk-integration-notes.md` | NEW — authoritative field map + protocol notes | Future engineers don't re-read 8 doc pages |
| `docs/bulk-schema-confirmation-email.md` | DELETED | Unnecessary — docs are public |
| `docs/week-1-log.md` | NEW — this file | |

### Verified reference URLs

- https://docs.bulk.trade/ (index)
- https://docs.bulk.trade/api-reference/introduction (HTTP overview, field names, order types, nonce format)
- https://docs.bulk.trade/api-reference/websocket-intro (WS base URL, subscribe envelope, ping/pong, rate limits)
- https://docs.bulk.trade/api-reference/ws-market-data (ticker, trade, candle payload shapes)
- https://docs.bulk.trade/architecture/overview (L0 alongside Solana, stake inheritance)
- https://docs.bulk.trade/architecture/matching (execution pipeline, rejection reasons, STP)
- https://docs.bulk.trade/architecture/risk-engine (lambda surfaces, regime, cascade)
- https://docs.bulk.trade/bulk-exchange/Margin (portfolio margin math, nine regimes)
- https://github.com/Bulk-trade/bulk-keychain (signing library, `prepareOrder`, Mode A/B)

### Net diff

- `.env.example`: 10 lines removed (stale assumptions), 14 added
- 3 `package.json` files: 1 line renamed, 4 added across the three
- 2 new markdown docs: 360 lines
- 1 deleted stale doc: 45 lines

No runtime behavior changes. App still runs. The repo is now grounded in facts, and Day 2 can proceed knowing every line will align with reality.

### Day 1 status: **Done.**

---

## Day 2 — Reconcile the WebSocket client + hooks

**Status:** Not started.

Scope:
- Update `packages/api-client/src/types.ts` Ticker + Trade + Candle to real Bulk shapes
- Add `subscriptionResponse` handling to `websocket.ts`
- Add explicit browser ping/pong (verify Node `ws` auto-pongs)
- Add rate-limit guards (100 subs, 1000 msg/s)
- Update `useTickers` to read `markPrice` (not `mark`)
- Derive `useFundingRates` from ticker (drop separate stream assumption)
- Manual test against `wss://exchange-ws1.bulk.trade` — watch `/desk` go Live

---

## Day 3 — Real testnet order submission

**Status:** Not started.

---

## Day 4 — Portfolio API for /home

**Status:** Not started.

---

## Day 5 — Agent wallet provisioning + faucet + handoff

**Status:** Not started.
