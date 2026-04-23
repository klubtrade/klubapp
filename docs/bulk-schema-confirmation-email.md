# Bulk — WebSocket schema confirmation

> One email to Bulk engineering to lock the five field-shape questions before we ship KLUB to users.

---

## How to use this

Send the email below to whoever at Bulk owns integrator relations (likely `devrel@bulk.trade`, `partners@bulk.trade`, or whoever answered your Discord ticket). CC anyone from Bulk who's already in your thread.

Keep the tone specific and short. They answer faster when the questions are copy-pasteable. Don't pitch the product — they're engineers, not sales targets. Get answers, thank them, move on.

Expected turnaround: **1–3 business days**. If you haven't heard back by day 4, bump the thread politely.

---

## Subject line

```
KLUB × Bulk integration: WS payload schema confirmations (5 Qs)
```

---

## Body

> Hey [contact name],
>
> Quick ask. We're shipping KLUB — retail front-end for Bulk perps — and the last thing we need before lighting up mainnet data is confirmation of a few payload shapes from the public WebSocket feed. We've implemented against the docs at https://docs.bulk.trade but want to make sure the field names match what actually comes over the wire on testnet.
>
> Five questions, each one copy-pasteable:
>
> **1. Ticker payload — field names?** We currently read:
> ```json
> { "s": "BTC-USD", "mark": "67420.50", "index": "67418.20", "ts": 1713900000000 }
> ```
> Are `mark` and `index` the right keys? Or is it something like `markPrice` / `indexPrice`?
>
> **2. Funding payload — does it exist, and what does it look like?** We've modeled it as:
> ```json
> {
>   "s": "BTC-USD",
>   "rate8h": "0.000118",
>   "predictedRate8h": "0.000120",
>   "oi": "412000000",
>   "nextFundingTs": 1713916800000,
>   "ts": 1713900000000
> }
> ```
> Is there a dedicated funding topic, or do we compute funding from ticker + additional queries? If dedicated, please send a sample frame.
>
> **3. Subscribe / unsubscribe frame shape?** We're sending:
> ```json
> { "method": "subscribe", "topic": { "type": "ticker", "symbol": "BTC-USD" } }
> ```
> Does Bulk expect `method` / `topic`, or something different like `op` / `channel` / `params`?
>
> **4. Account stream — how is it authenticated?** Our current plan: open an unauthenticated socket, then send a `subscribe` frame for `{ type: "account", user: "<pubkey>" }` signed with the user's agent-wallet key (Ed25519, canonical-JSON + nonce + timestamp envelope). Is there a different handshake — e.g. cookie, header, upfront auth frame? Is the signed envelope per-subscription or per-connection?
>
> **5. Position payload — confirm field names?** From the REST `/account` docs:
> ```json
> {
>   "s": "BTC-USD",
>   "sz": "0.1",
>   "entryPx": "66100",
>   "markPx": "67420",
>   "liqPx": "58940",
>   "unrealizedPnl": "132.00",
>   "fundingAccrued": "2.41",
>   "leverage": "10"
> }
> ```
> Is the same shape delivered over the `account` WebSocket stream, or does the stream use a different schema?
>
> If there's a Postman collection, OpenAPI schema, or testnet dump file we can clone against, that'd save everyone a day of back-and-forth. Happy to reciprocate with our typed `@klub/api-client` package once confirmed — it's open source (MIT) and future integrators can just import it.
>
> Thanks,
> [Your name]
> KLUB
> klub.trade

---

## Answers checklist

When the reply lands, map answers here before updating code. Anything unresolved becomes a follow-up question.

- [ ] Q1 — ticker field names: `_______________`
- [ ] Q2 — funding topic exists? `yes / no`. Sample frame received: `yes / no`
- [ ] Q3 — subscribe frame shape: `_______________`
- [ ] Q4 — account stream auth pattern: `_______________`
- [ ] Q5 — position payload matches REST: `yes / no`

Once all five are checked, update:

- `packages/api-client/src/types.ts` — align field names
- `packages/api-client/src/websocket.ts` — align subscribe frame + topic shape
- `apps/web/lib/market-data/client.ts` — align demo-mode payload shape to match
- `apps/worker/src/workers/account-subscriber.ts` — align field reads

Then bump `@klub/api-client` to `0.1.0` and publish. Integrators downstream get the aligned schema for free.

---

## Tone note

Don't apologise for asking. Don't over-qualify. Schema questions are exactly what integrator channels are for — the Bulk team will answer faster for a well-structured list than they will for a vague "how does this work?" ping. The worst email is the one that makes them write a mini-doc to reply.
