# The klub is the point

*On why retail keeps losing at on-chain perps — and what we're building to stop the bleeding.*

---

I want to start with a number. Roughly **60% of retail traders on on-chain perps are liquidated within their first 30 days**. Not "lose money." Not "underperform the market." *Liquidated.* The account-ending kind of loss, where the exchange force-closes your position and you go back to zero, minus whatever your last stop-gap deposit was.

I don't have a single clean source for that number because nobody likes publishing it. Exchanges don't benefit from advertising customer mortality. But if you've spent any time in the crypto-trading corners of the internet — trading Discords, Farcaster trade-diary channels, Twitter spaces at 3am — you know it's roughly right. The people who made it to month three are a minority. The people who made it to year one are a rounding error.

This is not because retail traders are stupid. It's because on-chain perps, as a product, were never designed for them.

## Built for the quants who were already there

When perps came to DEXes around 2020, the people who built them were mostly ex-derivatives-desk engineers building for their peers. The unit of analysis was *the professional trader who's already comfortable with perpetual futures* — someone who speaks funding-rate basis-point adjustments the way a civilian speaks Fahrenheit. Latency was the obsession. Liquidity was the obsession. The *interface*, by contrast, was treated as plumbing.

That shipped. And it worked for the people it was designed for. DEXes like dYdX, GMX, Hyperliquid, and now Bulk have built deeply sophisticated matching engines, real-time risk systems, high-quality orderbooks. From a market-microstructure standpoint, a lot of on-chain perps are now *better* than the average centralized exchange was five years ago.

The problem: when the quants were done building, retail walked in.

Retail didn't get the manual. Retail showed up because a friend said "I'm making 40% a month," bridged $500 in USDC across three chains, clicked "10x Long" on whatever ticker was trending, and got stopped out in two hours. Or they didn't get stopped out and instead rode a 3% adverse move into a 30% loss because they couldn't do the leverage math in their head and nobody on screen did it for them.

The platforms aren't lying to these users. They're just not *helping* them. The orderbook is there. The funding rate is there, eight decimal places deep. The liquidation price is calculable if you know the maintenance-margin fraction and can solve for mark. That's the retail experience of on-chain perps in 2026: *all the information you need, rendered in a language you don't speak.*

## The four things that actually kill retail accounts

If you sit with enough blown-up traders — I have — the pattern repeats itself. It's never one thing. It's four.

**One: they can't size positions.** They think in dollars, not in exposure. "I'll risk $100 on this trade" becomes a 20x leveraged position because they typed "$100" into the margin field without understanding what that compounds to. The exchange is perfectly happy to take the order. Nobody on the screen says *"this means a 5% move against you wipes the whole $100."*

**Two: they don't understand funding.** They open a BTC long at a 0.3%/day funding rate and wonder why they're bleeding $30 a day on a $10,000 notional position. They think funding is a fee. It's not. It's a rent — paid by whichever side of the book is oversubscribed, at a rate that can flip hourly. Retail who've never traded anything but spot see a green number next to "funding" and assume it's theirs.

**Three: they have no safe way to practice.** Real FX brokers have offered demo accounts since forever. You can lose $10,000 of fake money in MT4 before you touch a cent of real capital. On-chain perps mostly skipped this step. Testnet exists, but it's a second-class citizen — different UX, different URL, different mental model. Most retail users never find it. By the time they're trading, they're trading real money.

**Four: they have no on-ramp that respects them.** Getting fiat onto an on-chain perps exchange in 2026 still, somehow, involves bridging, swapping, and a half-dozen confirmations. Every step is a place to fat-finger a destination address and lose the lot. The ramp is where retail gets filtered out before the trade screen even loads.

Any one of these problems is survivable. Together they compound, and the compound produces that 60% number.

## The thing about alpha

Here's the second thing worth saying out loud: **retail doesn't need to be great at trading.** Retail needs to be adjacent to somebody who is.

This is an old idea. The FX world figured it out in the 2000s with "social trading" platforms — eToro, ZuluTrade, and a long tail of smaller ones. You pick a trader whose style matches your risk tolerance, you allocate a slice of your capital, their trades execute proportionally in your account, you share the PnL (they get a performance fee, sometimes the platform rebates them a cut of the spread).

Social trading got a bad reputation in crypto for two reasons: scammy platforms that ran fake leaderboards, and "leader" accounts that farmed the system by ranking high in volatile-but-lucky months. Both solvable. The first with honest rankings. The second with transparent metrics: Sharpe ratio, max drawdown, time-in-drawdown, worst month, worst week. If you publish all of that, survivorship bias collapses and luck gets priced out.

What remains is a real product. *Most retail should not be picking their own trades.* The handful who can, will. The rest should be following someone whose numbers are audited, whose style is disclosed, and whose drawdowns they can stomach.

That's the klub.

## What KLUB is, mechanically

We're building a members-only front-end to on-chain perps. Specifically, on-chain perps on [Bulk Exchange](https://bulk.trade), which gives us 5–20ms matching latency and a clean L1 with programmable signing primitives.

Six things ship in V1:

1. **Follow** — an opt-in leaderboard of traders. Every ranking is net of fees and funding. Every profile publishes the metrics above. One tap to mirror trades proportionally into your own account, with allocation caps and a stop-loss override that's yours alone.

2. **The Math** — a pre-trade calculator that runs the numbers the second you type them. PnL at target. Loss at stop. Liquidation price. Funding cost per 8 hours. Breakeven move required. If your stop is beyond your liquidation, we *scream* about it. Most retail has literally never seen this view of the trade they're about to place.

3. **Liquidation Alerts** — tiered at 25%, 10%, and 3% buffer to liquidation. Push, email, Telegram. Each alert links to a one-tap action: add margin, reduce size, close. These are server-side workers watching the Bulk account stream. The alert fires whether your app is open or not.

4. **Portfolio Health** — a 0–100 score with four subscores: liquidation proximity, leverage exposure, concentration risk, funding burn. Plus a stress-test slider: drag to "-10% BTC move" and see which positions liquidate, in plain English.

5. **Practice** — a testnet mode that looks and feels exactly like mainnet, with real Bulk testnet fills and a trade journal that auto-logs every entry with the reasoning you supply. You close a paper trade, we ask what you learned, you type it, it's there forever.

6. **3-Tap Ramp** — card or Apple Pay to USDC on Bulk, in three taps. No bridges, no intermediate swaps, no hex strings. KYC is handled by the ramp provider; funds land in your own Bulk account. Off-ramp is just as clean.

What connects all of this is a single architectural decision: **KLUB is never custodial.** Your USDC lives in your own Bulk account. We execute trades — for you, for the leaders you follow, for the future yield products — through scoped, revocable Agent Wallet keys. You can pull the rug on KLUB whenever you want. That's the point.

## What we're not going to do

We're not going to promise returns. We're not going to paper over losses. We're not going to show you a leaderboard with gross PnL because the net number might look bad.

We're not going to launch in the United States or the United Kingdom in V1. Copy trading and pooled yield are securities-adjacent in those jurisdictions, and "move fast, ask forgiveness" is a terrible plan in derivatives. We'd rather serve the 95% of the world we can serve, well, than try to serve 100% of it, badly, for six months before a cease-and-desist.

We're not going to be the thing that replaces human judgment. We're going to be the thing that makes human judgment viable — by doing the math, ringing the alarms, and putting the best traders one tap away when your own judgment fails.

## Where you come in

KLUB launches on Bulk testnet in the coming weeks. Mainnet shortly after. If you've read this far and you're nodding, join the waitlist: we ship invites to waitlist members first. Membership is opt-in, not screened — we're not that kind of klub — but testnet access is capped by batch so the feedback loops stay tight.

If you're a trader who thinks you should be on the leaderboard, tell us. We're manually onboarding the first twenty or so leaders because the ranking only works if the top twenty people you see are the *right* top twenty.

And if you've been blown up on an on-chain perps exchange and are sitting on the quiet shame of it — welcome. That's most of us. KLUB exists because the math should have been on your screen before you hit the button, and next time it will be.

*— The KLUB team*
