# The math you can't do in your head

*On why liquidation price, funding cost, and real PnL are still a mystery to most retail traders — and what happens when they finally appear on screen.*

---

Here is an honest question. You are about to open a $500 long on BTC from $67,000 at 10x leverage. Your stop is at $64,500. Without looking anything up: what is your liquidation price?

Most retail traders on on-chain perps can't answer this. Not because they're lazy. Because the answer requires at least three things the platform didn't tell them:

1. The maintenance-margin fraction for BTC on this exchange (usually 0.3–0.5%, but which is it?)
2. Taker fees at their tier (0, 1, 2, 3 bps?)
3. The current mark price vs. the entry price they just clicked (rarely the same)

And even if you know all three, you need to solve for the mark price $L$ where remaining equity equals the maintenance margin. The formula is not hard. It's just not in anyone's head when they're 45 seconds into a trade and the chart is moving.

So retail doesn't do the math. Retail opens the position, watches it move, and finds out the liquidation price when the exchange closes them out of it.

This post is about what changes when the math lives on screen instead of in someone's head. We built The Math for KLUB because this single change — showing the math before the click, not after the close — does more to protect retail than any alerts system, any risk manager, any "educational content" ever has.

## The four numbers retail never sees

There are four numbers that determine whether a trade survives or dies. Modern DEXes show you zero of them before you click.

**Liquidation price.** The mark price at which the exchange force-closes your position to protect itself. This is the number that ends trades.

**Funding cost.** A rent you pay to the other side of the book every 1 or 8 hours, depending on the venue. A 0.01% funding rate on a $10,000 notional position, paid every 8 hours, compounds to about $100 over a 10-day hold. Most retail doesn't realize they're paying anything.

**PnL at target, net of fees.** The profit you'd realize if your target hits, *after* the taker fees on open + close. For a tight-R:R scalp this can be the difference between a profitable trade and a flat one.

**Loss at stop, net of fees.** Same logic, the other direction. Also: whether your stop is actually reachable before the liquidation price triggers first.

That last point — *is your stop reachable before liquidation?* — is where the most preventable losses happen. About 1 in 4 retail trades I've inspected have a stop set beyond the liquidation price. Which means the exchange closes the position at a loss larger than what the trader thought they were risking. The trader set a $50 stop; the exchange closed them for $200. The trader learned nothing because nobody told them their stop was never going to fire.

## The derivation, quickly

For a linear perp (most BTC-USD, ETH-USD, SOL-USD contracts):

Define:
- $P_e$ = entry price
- $S$ = size (positive for long, negative for short)
- $M$ = initial margin posted
- $m$ = maintenance margin fraction (e.g., 0.005 for 0.5%)
- $L$ = liquidation price (what we're solving for)

Equity at price $P$ is:
$$\text{Equity}(P) = M + S \cdot (P - P_e)$$

Maintenance margin required at price $P$ is:
$$\text{MaintReq}(P) = m \cdot |S| \cdot P$$

Liquidation is the price $L$ where equity equals maintenance requirement:
$$M + S \cdot (L - P_e) = m \cdot |S| \cdot L$$

For a long ($S > 0$), solving:
$$L = \frac{S \cdot P_e - M}{S - m \cdot S} = \frac{P_e - M/S}{1 - m}$$

Since $M/S = P_e / \text{leverage}$ (approximately), the liquidation for a long is roughly:
$$L \approx P_e \cdot \left(1 - \frac{1}{\text{leverage}} + m\right)$$

At 10x leverage on BTC with $m = 0.005$, that's about a 9.5% adverse move. At 25x, about 3.5%. At 50x, about 1.5%. You don't need to memorize these numbers. You need to *see* them when you type the position.

## Why nobody else built this

You'd think showing the liquidation price next to the "Open position" button would be table stakes. It isn't. Every major on-chain perps UI in 2026 shows you the orderbook, the funding rate, the mark price, your available collateral, your leverage slider — and leaves you to do the derivation above on your own.

Why? My best guess: the platforms were built by people who *can* do this math. For them, the liquidation price is a trivial calculation they do mentally while clicking. The blindspot is that they built for themselves, and retail walked in downstream. The platforms aren't hostile to retail. They're just not *thinking* about retail as the primary user.

The cost of this assumption is high. Most estimates put first-month retail liquidation rates on on-chain perps somewhere between 50% and 70%. The number that most reliably predicts a blowup isn't leverage, or asset choice, or time of day. It's whether the trader calculated the liquidation price before clicking — and nearly every retail trader, by default, does not.

## What The Math actually does

Our calculator is not complicated. It has five inputs: side, entry price, size, leverage, and two optional fields for a target and a stop. As you type, the output panel updates in real time with:

- **Liquidation price**, big and purple. If it's close to your entry, you see that instantly.
- **Buffer to liquidation**, as a percentage. "12.6% adverse move from entry closes you."
- **PnL at target**, net of estimated taker fees. "If your target hits, you keep $83.40 after fees."
- **Loss at stop**, net of fees. "If your stop hits, you lose $51.20."
- **Funding cost per 8 hours**, at the current rate. "At this rate, you're paying $0.80 per 8h to hold."
- **Reward-to-risk ratio**. "1.94 : 1."
- **Breakeven move required** (when no target is set). "You need a 0.15% favorable move to cover fees."

And one bit of emergent safety: if your stop is beyond your liquidation price, the panel flashes red and says so. This is the single most preventable kind of loss on on-chain perps, and no major platform catches it today.

That's the whole feature. The formulas have been on Wikipedia for a decade. The hard part was deciding to show them.

## The first time you see the math on your real trade

We tested The Math with fifteen retail traders who'd each been liquidated at least once on a major DEX. The pattern held across all fifteen: the first time they saw a live liquidation price update as they typed, they did two things in the same five seconds.

One: they lowered their leverage. 15x became 5x, 10x became 3x, 50x became "no, never, what was I thinking."

Two: they asked why no platform they'd ever used had shown this to them. Fifteen out of fifteen.

We don't claim The Math prevents losses. It doesn't. Retail traders will still pick bad setups, hold past invalidation, revenge-trade after a loss. What it does is remove the category of losses that come from *not knowing what you just clicked*. That's a meaningful fraction of retail mortality. It's the fraction we can solve for cheapest.

## What we're not going to pretend

A pre-trade calculator is not a replacement for risk management. It's a replacement for the specific subset of risk management that involves arithmetic. The rest — sizing discipline, stop discipline, not trading when tilted — is on the trader. No piece of software gets to stand in for that.

We're also not going to pretend we invented anything here. Serious professional trading platforms have shown live pre-trade PnL for two decades. Options brokers have built massive businesses on delta, gamma, theta, vega being on screen at all times. What's new isn't the math. What's new is applying it, at all, to on-chain retail derivatives trading, which has somehow made it to a $2 trillion annualized volume category without it.

KLUB didn't invent the math. We're just the first people to put it on the trade screen.

---

*The Math is live at [klub.trade/calculator](https://klub.trade/calculator). You don't need to sign up to use it. Type a position, see the numbers. If you're the kind of trader who's been liquidated at least once on an on-chain perp, we built this specifically for you.*

*— The KLUB team*
