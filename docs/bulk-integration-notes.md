# Bulk Integration Notes — Week 1 Day 1

> Everything below is verified against **primary docs at `docs.bulk.trade`** as of this writing. If something in the codebase contradicts this file, update the codebase — not this file.

---

## 1. What BULK is

- **L0 execution layer running alongside Solana.** Each Bulk validator runs a `bulk-agave` binary next to a standard Solana validator on the same machine, sharing the identity key.
- **Stake inheritance from Solana.** Validator stake weight ≈ ~5% of Solana's total, operated by 20+ entities.
- **Solana handles asset custody, deposits, withdrawals.** Bulk handles matching, BULKBFT consensus, risk.
- **Consequence for us:** Phantom / Backpack / Solflare are the correct wallet adapters. User pubkeys are base58 Solana-style. Our existing `providers.tsx` is correct.

Source: [Architecture Overview](https://docs.bulk.trade/architecture/overview)

---

## 2. Base URLs

| Purpose | URL |
|---|---|
| HTTP API (production + testnet, same URL) | `https://exchange-api.bulk.trade/api/v1` |
| WebSocket (production + testnet, same URL) | `wss://exchange-ws1.bulk.trade` |
| Hosted testnet UI (for verifying our orders) | `https://early.bulk.trade` |

**No separate testnet API URL.** Network separation on Bulk is logical, not URL-based. The faucet endpoint gates which accounts are considered testnet.

---

## 3. Signing

**Official library: `bulk-keychain`** — Node + browser + Python + Rust. Ed25519 signatures.

```bash
# Our install
pnpm add bulk-keychain
```

Key details:
- **All state-mutating endpoints require signatures.** Placing orders, cancelling, managing agent wallets, updating user settings, requesting faucet.
- **Nonce format:** nanoseconds since Unix epoch. `BigInt(Date.now()) * 1_000_000n`
- **Reuse of the official library is mandatory** — do not hand-roll the envelope. Our previous `@klub/signing` package should become a thin KMS-wrap layer around `bulk-keychain`, not a reimplementation.

Source: [Transaction Signing](https://docs.bulk.trade/api-reference/signing)

---

## 4. HTTP API endpoints we'll use in Week 1

### Market data (no auth)
- `GET /exchangeInfo` — market list, fee state, contract specs
- `GET /ticker?symbol=BTC-USD` — single-market ticker
- `GET /klines?symbol=BTC-USD&interval=1h` — candles
- `GET /l2Book?symbol=BTC-USD` — current orderbook snapshot

### Account (no signature)
- `POST /account` — query full account. Body: `{"type":"fullAccount","user":"<base58 pubkey>"}`

### Trading (signed)
- `POST /placeOrder` — place or cancel. Uses the compact envelope below.
- `POST /manageAgentWallet` — provision or revoke an agent wallet. `canWithdraw:false` is our invariant.
- `POST /requestFaucet` — testnet USDC. Signed request.

---

## 5. Compact field notation

Bulk uses short field names over the wire to minimize bandwidth. **Our types must map these.**

| Short | Full | Notes |
|---|---|---|
| `s` | symbol | e.g. `BTC-USD` |
| `c` | coin | symbol in orders |
| `px` | price | |
| `sz` | size | |
| `b` | is_buy | `true` = buy |
| `r` | reduce_only | |
| `t` | type | object describing order type |
| `oid` | order_id | |
| `tif` | time_in_force | `GTC` / `IOC` / `ALO` |
| `d` | direction | trigger direction, `true` = above |
| `tr` | trigger | trigger price |
| `lim` | limit | post-trigger limit price |
| `mk` | maker | maker/resting flag |
| `of` | on_fill | on-fill consequent actions |

Source: [API Overview](https://docs.bulk.trade/api-reference/introduction)

---

## 6. Order types

| Type | Tag | Use case |
|---|---|---|
| Limit | `l` | Standard GTC / IOC / ALO |
| Market | `m` | Immediate at best price |
| Stop | `st` | Conditional stop-trigger |
| Take Profit | `tp` | Exit at target |
| Range / OCO | `rng` | One-cancels-other stop+TP pair |
| Trigger Basket | `trig` | Multi-action on trigger |
| Trailing Stop | `trl` | Trailing conditional |
| On-Fill | `of` | Attach stop/TP post-entry |

**Week 1 scope:** `l`, `m`, `st`, `tp`. `rng` is the natural fit for our Quick Trade submit (which sets both stop and target); add as Week 2 polish.

Source: [API Overview](https://docs.bulk.trade/api-reference/introduction)

---

## 7. WebSocket protocol

### Connection
```js
const ws = new WebSocket('wss://exchange-ws1.bulk.trade');
```

### Keepalive (IMPORTANT)
- Server sends a **transport-level ping** every 30s.
- Client must **pong** within 10s or connection drops.
- On Node (`ws` library): automatic.
- In browser (native `WebSocket`): automatic at the browser level.
- **Verify our worker's `ws` install pongs correctly.** No application-level ping needed.

### Subscribe
```json
{
  "method": "subscribe",
  "subscription": [
    { "type": "ticker", "symbol": "BTC-USD" },
    { "type": "trades", "symbol": "BTC-USD" }
  ]
}
```

### Subscribe response (wait for this before considering subscription active)
```json
{
  "type": "subscriptionResponse",
  "topics": ["ticker.BTC-USD", "trades.BTC-USD"]
}
```

### Unsubscribe
```json
{ "method": "unsubscribe", "topic": "ticker.BTC-USD" }
```

### Rate limits
- Max 100 subscriptions per connection
- Max 1000 messages per second
- Violations → disconnect

Source: [WebSocket Overview](https://docs.bulk.trade/api-reference/websocket-intro)

---

## 8. Market-data stream shapes

### Ticker stream (updates every 200ms)

```json
{
  "priceChange": ...,
  "priceChangePercent": ...,
  "lastPrice": ...,
  "highPrice": ...,
  "lowPrice": ...,
  "volume": ...,
  "quoteVolume": ...,
  "markPrice": ...,
  "oraclePrice": ...,
  "openInterest": ...,
  "fundingRate": ...,
  "regime": ...,
  "regimeDt": ...,
  "regimeVol": ...,
  "regimeMv": ...,
  "fairBookPx": ...,
  "fairVol": ...,
  "fairBias": ...,
  "timestamp": <nanoseconds>
}
```

**Key finding:** the ticker stream already contains `fundingRate`. We don't need a separate `useFundingRates` stream — it becomes a selector off `useTickers`. Collapse the two.

### Candles stream
Fields: `t` (open ms), `T` (close ms), `o`, `h`, `l`, `c`, `v`, `n` (trade count).
Intervals: `10s`, `1m`, `3m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `8h`, `12h`, `1d`, `3d`, `1w`, `1M`.

### Trades stream
```json
{
  "s": "BTC-USD",
  "px": 67420.5,
  "sz": 0.14,
  "time": 1699564800000,
  "side": true,
  "maker": "<base58>",
  "taker": "<base58>",
  "reason": "liquidation",   // optional, rare
  "liq": true                 // optional, only if liquidation
}
```

### L2 Delta stream
- Initial snapshot on subscribe (latest cached book)
- Each subsequent message = **single price level change on one side**
- `levels[0]` = bids desc, `levels[1]` = asks asc
- Each level: `{px, sz, n}` where `n` is always `0` for deltas
- **`sz: 0` means remove the level**

### Frontend Context stream (every 2s, all symbols)
Ideal for our `/desk` funding monitor. Fields: `symbol`, `volume`, `funding`, `oi`, `lastPrice`, `priceChange`, `priceChangePercent`.

### Risk Metrics stream (event-driven)
This is the lambda surface. For multi-position accounts, we need it to compute real maintenance margin. **Week 2 work.**
```json
{
  "symbol": "BTC-USD",
  "timestamp": ...,
  "regime": -4,
  "leverage": [1.0, 2.0, 5.0, 10.0, 20.0, 50.0],
  "notionals": [50000, 200000, 1000000, 10000000],
  "buy": [[...]],   // buy[notional_idx][leverage_idx]
  "sell": [[...]],
  "corrs": [["BTC:ETH", 0.71], ["BTC:SOL", 0.54], ...]
}
```

Source: [Market Data Streams](https://docs.bulk.trade/api-reference/ws-market-data)

---

## 9. Portfolio margin — what our calculator gets wrong

Our `@klub/calc` currently does naive per-position margin: `maintenanceMargin = notional * 0.005`. Bulk doesn't work this way.

**Bulk's real model:**

- Each asset has a **lambda surface** — continuous 3D function `λ = f(leverage, impact, regime)` — published via WS.
- Signed notional per position: `sN_i = sign(Q_i) · |Q_i| · P_i`
- **Effective portfolio notional** uses pairwise correlations:
  ```
  N_eff² = Σ sN_i² + 2 · Σ_{i<j} sN_i · sN_j · ρ_{ij}
  ```
- Signed margin per position: `M_i = sign(Q_i) · λ_i · |Q_i| · P_i`
- **Portfolio maintenance margin:**
  ```
  M_p = √( Σ M_i² + 2 · Σ_{i<j} M_i · M_j · ρ_{ij} )
  ```
- Liquidation triggers when `equity < M_p`.

**What this means for our product:**

| Feature | Approximation quality |
|---|---|
| Single-position health score | Rough but reasonable — off by <10% typically |
| Single-position liquidation price | Approximate; can be wrong by 5–20% in a volatile regime |
| Multi-position portfolio margin | **Wrong.** We don't account for correlation. Can be off by 20–70% |
| Health score for a hedged account | **Systematically too conservative.** Says risky when Bulk says safe |

**Week 1 plan:** add a prominent `TODO(BULK-RISK)` comment in `@klub/calc/src/index.ts` linking to this doc. Do not try to fix it this week. Ship disclaimer copy on the calculator page: "Approximation. Bulk uses correlation-adjusted portfolio margin; multi-position accounts may see different values."

**Week 2 plan:** subscribe to the `risk` WebSocket stream, cache the lambda surface per symbol, write a portfolio-margin function that uses Bulk's model directly. Replace our naive `maintenanceMarginFrac: 0.005` parameter throughout.

Source: [Margin](https://docs.bulk.trade/bulk-exchange/Margin), [Real-Time Risk Engine](https://docs.bulk.trade/architecture/risk-engine)

---

## 10. Agent wallets — first-class on Bulk

Bulk natively supports **agent wallets**: secondary keys that can place orders on behalf of the main account, with permissions like `canWithdraw` explicitly togglable.

Endpoint: `POST /manageAgentWallet` (signed). This is our non-custodial copy-trading primitive. The `canWithdraw:false` invariant is protocol-level, not application-level — we enforce it at provisioning time.

**Week 1 implementation:** when a user first taps Follow on `/follow/[handle]`, we:
1. Generate a new Ed25519 keypair in memory
2. Sign a `manageAgentWallet` envelope from the user's main wallet adding this key
3. POST to Bulk with `canWithdraw: false`
4. Store `{userPubkey, agentPubkey, handle, maxAllocPct, createdAt}` in Postgres

**Week 1 key storage:** in-memory → AWS KMS stub locally. **Testnet only.** Mainnet requires KMS wrap/unwrap (Week 2).

Source: [Manage Agent Wallet](https://docs.bulk.trade/api-reference/manageAgentWallet) — see REST API reference

---

## 11. Self-trade prevention

If a user's agent wallet ever crosses an order from their main account (or from another agent wallet on their account), Bulk cancels the resting order rather than filling. We don't need to build this guard ourselves — it's in the matching engine.

Source: [Self-Trade Prevention](https://docs.bulk.trade/bulk-exchange/Self-Trade-Prevention)

---

## 12. Mark pricing and continuous risk recomputation

- Bulk recomputes margin in background as mark prices change, not just on new orders.
- Liquidations can trigger even with zero user activity.
- This means our alert subscriber's trigger logic (tier thresholds at 25% / 10% / 3% of liq buffer) will fire on mark drift without needing any fill events.

Source: [Real-Time Risk Engine](https://docs.bulk.trade/architecture/risk-engine)

---

## 13. Deterministic execution

Every validator runs the same matcher on the same committed batch. Identical inputs → identical outputs. We can trust that:
- Fills are deterministic
- Self-trade prevention is deterministic
- Cancellations from margin breach are deterministic

Consequence for our copy-trade worker: if we capture leader fills correctly, a follower's mirrored order will be matched consistently — no need to worry about validator-level divergence.

Source: [Matching and Execution](https://docs.bulk.trade/architecture/matching)

---

## 14. What the existing codebase got right

- WebSocket subscribe envelope shape
- Symbol format (`BTC-USD`)
- Base58 pubkey handling
- Agent-wallet concept with `canWithdraw:false`
- Solana wallet adapters

## What the existing codebase got wrong

- Field names in `Ticker` (we had `mark`, should be `markPrice`)
- Assumed `funding` was a separate stream (it's inside ticker)
- Hand-rolled signing envelope (should use `bulk-keychain`)
- No ping/pong keepalive explicit in docs
- Naive maintenance margin math (doesn't account for lambda surfaces or correlation)
- Risk stream not subscribed to at all

---

## 15. Living document

This file updates whenever we discover new Bulk-side facts, not when we write new code. If you're editing our code to match Bulk and you're sure the docs disagree with this file, fix this file first, then the code.
