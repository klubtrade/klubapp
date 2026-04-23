# KLUB — 3-Minute Demo Script

*For investor calls, pitch-on-stage moments, and founder conversations. Three minutes, tight. Memorize the cadence, not the words.*

---

## [0:00–0:20] — The number

> "I want to start with one number. Roughly 60% of retail traders on on-chain perps are liquidated within their first 30 days. Not lose money. *Liquidated.* Account-ending.
>
> Nobody publishes that number because it's bad for business. But anyone who's spent time in crypto trading corners knows it's right. The question we asked ourselves is: why?"

**Beat:** Pause. Let the number land.

---

## [0:20–0:50] — The thesis

> "We don't think retail is stupid. We think on-chain perps were built for quants — people who already know what funding means, who can solve for liquidation price in their head, who came pre-equipped with the vocabulary.
>
> The engines are world-class. The interfaces? Plumbing.
>
> Retail walks in, can't size positions, doesn't understand funding, has no safe way to practice, can't get fiat in cleanly. Four things, compounding, producing the 60%."

**Beat:** "Four things" — hold up four fingers if you're live.

---

## [0:50–1:30] — The product: Follow

> *[Switch to screen-share. Land on the /follow leaderboard.]*
>
> "KLUB is the retail front-end to on-chain perps. Six features in V1, but the one to look at first is Follow.
>
> This is a leaderboard of traders who opted in to being ranked. Every PnL number here is net of fees and funding — which is the only honest way to rank. Every profile publishes max drawdown, worst month, worst week.
>
> *[Click into a leader.]*
>
> One tap to mirror. Set a max allocation — we default to 20%. Set a stop-loss override that's yours alone. Pause any time.
>
> Retail doesn't need to be a great trader. Retail needs to be adjacent to one."

**Beat:** Show the copy-config panel expanded.

---

## [1:30–2:10] — The product: The Math

> *[Navigate to /calculator.]*
>
> "Second piece. The Math. A pre-trade calculator that runs the numbers as you type them.
>
> *[Type a position live: long BTC, 10x, $67,000 entry, stop at $64,000.]*
>
> Liquidation price — amber, enormous, unmissable. Loss at your stop, net of fees. PnL at your target. Funding cost per 8 hours. Breakeven move required. Reward-to-risk.
>
> *[Drag the stop below the liquidation price.]*
>
> And when your stop is beyond your liquidation — which happens to one in four retail trades I've inspected — we scream about it.
>
> Most retail has literally never seen this view of the trade they're about to place."

**Beat:** The scream warning is the demo's gut-punch moment. Let it sit.

---

## [2:10–2:40] — The architecture and custody

> "Under the hood: KLUB never custodies your funds. Your USDC lives in your own Bulk account. We execute through scoped, revocable Agent Wallet keys — you can pull the rug on us whenever you want.
>
> That's the whole architecture. Copy trading, the upcoming vault, the alerts worker — everything routes through agent keys, never through a KLUB wallet. Compliance surface collapses. Trust surface is the user's own wallet."

**Beat:** Name-check Bulk. This is a flex, not a dependency.

---

## [2:40–3:00] — Close

> "V1 ships on Bulk mainnet this quarter: Follow, The Math, Liquidation Alerts, Portfolio Health Score, Practice mode, and a 3-tap fiat ramp. V2 adds Basis — a funding-harvest vault — and KLUB Pro, a power-user terminal.
>
> We launch in every jurisdiction except the US, UK, and OFAC-sanctioned — about 95% of the world, served well, instead of 100%, served badly for six months before a C&D.
>
> Waitlist is open. Testnet invites ship in batches. If you want to see a live session or meet the first twenty leaders we've manually onboarded, [founder name] will send the link."

**Beat:** End strong, no apology for the pace.

---

## Variant: The 30-Second Version

*For elevator moments. Cuts everything except the core thesis.*

> "KLUB. On-chain perps for retail — actually for retail, not for quants who landed in retail by accident.
>
> Three things: a copy-trading leaderboard that's net-of-fees honest, a pre-trade calculator that shows the liquidation price before you click, and liquidation alerts that ping your phone at 25%, 10%, and 3% buffer.
>
> Non-custodial throughout. Built on Bulk Exchange. Launches [next month]. US/UK excluded at launch."

---

## Variant: The 5-Minute Version

*Add two beats between 2:10 and close:*

**[Beat A, ~1 min] — Portfolio Health Score and stress test**

> *[Navigate to /health. Land on the score breakdown.]*
>
> "Every open position gets a 0–100 Portfolio Health score with four subscores: liquidation proximity, leverage exposure, concentration risk, funding burn.
>
> *[Drag the stress test slider to -12%.]*
>
> Drag the slider, see what a 12% market move does to the book. That ETH long you were comfortable with? Liquidated. Here's the recommendation in plain English: 'Reduce size 20% to survive a 12% drop.'
>
> This is what wealth managers sell for $300 an hour. We built it in."

**[Beat B, ~1 min] — Practice and the ramp**

> *[Navigate to /practice.]*
>
> "Two more things. Practice mode is real Bulk testnet — same latency, same fills, zero money. Every paper trade auto-logs with entry reasoning. When you close, we ask what you learned. That log is yours forever.
>
> And the ramp: three taps from card to funded USDC on Bulk. No bridges, no swaps, no hex strings. The most underrated V1 feature because it's invisible when it works."

---

## Delivery notes

- **Energy level:** engaged, not hyped. This is a serious product addressing a serious problem. Infomercial voice kills it.
- **Screen discipline:** never narrate "now I'm clicking here." Click and keep talking.
- **Numbers:** say them slow. "Sixty percent" beats "60%" when spoken.
- **The liquidation-scream moment:** it's the emotional peak. Don't rush it.
- **Ending:** the waitlist CTA is the only action you ask for. Don't add "and also check out our Twitter." One ask.
