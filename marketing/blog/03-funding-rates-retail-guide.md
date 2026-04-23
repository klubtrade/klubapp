# The retail trader's guide to funding rates

*On the most expensive thing nobody told you about perpetual futures.*

---

There is a number on every perpetual futures trade that retail doesn't understand. Professionals watch it obsessively. Exchanges mention it in passing. Retail has no idea it exists until it's already cost them money.

The number is called **funding**. It is the single largest hidden cost in perps trading. It is also the thing that moves the most money between traders in any given 8-hour window, and if you're going to hold a perpetual futures position for any length of time, you should understand it before you click.

This piece is going to explain funding from scratch, show you the math, and give you the rules of thumb that professionals use to decide whether a trade is actually worth holding.

## Why perps need funding in the first place

Traditional futures contracts expire. Retail traders don't understand expiry mechanics either, but that's a different post. The point is: traditional futures have a fixed delivery date, which is what anchors their price to the spot market.

Perpetual futures — "perps" — don't expire. The contract can be held forever. This is great for retail (nobody wants to manage quarterly rollovers) but it introduces a problem: without expiry, there's nothing forcing the perp price to track the underlying spot price. A BTC-perp could drift to $80,000 while BTC spot sits at $70,000, and there's no mechanism to close the gap.

Funding is that mechanism.

Every 1 hour (on Bulk) or every 8 hours (on many other venues), one side of the order book pays the other side a small amount, proportional to how far the perp price has drifted from spot. When the perp trades *above* spot, longs pay shorts. When the perp trades *below* spot, shorts pay longs. The payment is designed to incentivize traders onto the side of the book that closes the gap.

**Funding is not a fee to the exchange.** The exchange doesn't keep it. It's a peer-to-peer payment between traders.

That last point is important. When you pay 0.01% funding on a $10,000 position, that $1.00 didn't go to Bulk. It went to somebody on the short side who's holding the opposite position.

## The math, because of course

Funding has three components:

**The funding rate**, usually expressed as a percentage per period. A rate of `+0.01%` means longs pay shorts 0.01% of notional. A rate of `-0.01%` means shorts pay longs. Rates can range from roughly -1% to +1% in extreme markets; typical is ±0.01% to ±0.05%.

**Your notional exposure**, which is `size × mark price`. Not your margin — your *notional*. If you're holding 0.5 BTC at a $67,000 mark, your notional is $33,500, regardless of how much collateral you posted.

**The payment period.** Bulk runs hourly funding. Most other venues run 8-hourly. You need to know which one your exchange uses. The hourly rate is usually lower in absolute terms than the 8-hourly rate, but it adds up to roughly the same annualized number.

The calculation:
$$\text{Funding owed} = \text{Funding rate} \times \text{Notional}$$

Example: you're long 0.5 BTC at a $67,000 mark on Bulk (hourly funding). The current rate is +0.01%. Your notional is $33,500. Your hourly funding payment is $3.35. If the rate stays at +0.01% for 24 hours, that's $80.40/day. Over a 5-day hold, about $402.

That $402 came out of your PnL silently. It didn't appear as a "trade." Your balance just drifted down every hour while you weren't looking.

## Why retail misses it

Three reasons, in descending order of how much they hurt.

**One: the number is tiny.** "0.01%" looks like nothing. You see it next to BTC-USD in the trading interface and your brain registers it the same way it registers a 1-pip bid-ask spread on FX — as noise. But 0.01% hourly is 0.24% daily is 87.6% annualized, and those are not small numbers.

**Two: the number is peer-to-peer, not charged.** You don't see "funding fee" appear as a line item on your trade history the way you see "taker fee." It just... modifies your balance. On most venues it shows up as a tiny positive or negative amount in your account every hour, which retail mentally files under "probably just some gas thing."

**Three: the number flips.** A rate of +0.01% on BTC this morning might become -0.02% this afternoon when shorts pile in, then +0.03% tomorrow when a news event flips the book. Retail who opened a short position because BTC "felt toppy" might be paying funding to longs on day one and collecting funding from shorts on day three. Without tracking it, you have no idea which side of that you're on.

## The rules of thumb professionals use

No professional holds a perps position without looking at funding. Here's what they're checking:

### Rule 1: Annualize before you hold

If funding is +0.03% every 8 hours on your long position, that's about 33% annualized *against you*. Meaning: even if BTC goes sideways, you lose a third of your notional per year just to funding. Professionals look at any funding rate above ±0.03%/8h as meaningfully expensive and will reconsider hold duration accordingly.

On Bulk's hourly schedule, the threshold translates roughly: anything beyond ±0.004%/hour is worth scrutinizing for hold duration.

### Rule 2: Direction matters more than magnitude

A +0.01% funding rate means longs pay shorts. If you're long, this costs you. If you're short, this *pays you*. Many of the best retail strategies on perps are about collecting funding from the overcrowded side of the book rather than predicting direction. This is the core logic of the "basis trade" (which we're building as a V2 product called Basis — a post for another day).

### Rule 3: Size × holding period

The longer you hold, the more funding matters relative to price movement. A scalper in and out in 20 minutes doesn't care about funding — the rate barely moves over 20 minutes. A swing trader holding for 3 days is paying funding 72 times (hourly) and needs to factor it into their target: their breakeven move now includes their funding bill.

### Rule 4: Funding is a crowding signal

When BTC funding goes to +0.1%/8h or higher, it means the long side is so crowded that shorts can charge rent. This is often a contrarian signal. Many of the best setups on perps happen when funding is extremely one-sided — at which point the crowded side is *paying to be wrong*. You don't always fade it, but you always notice it.

## What retail can actually do about it

A few practical moves:

**Check funding before you open.** Every perps exchange shows the current funding rate next to the ticker. Look at it. If it's meaningfully against you, either skip the trade, size down, or shorten your planned hold.

**Check funding every time you check price.** If you're holding for days, funding is part of your PnL. Your PnL tile should include funding-paid-to-date. On KLUB we show funding cost per 8 hours in The Math panel; on other platforms you often have to dig.

**When funding is extreme, consider the other side.** Not because funding alone is a signal — it isn't — but because extreme funding means extreme crowding, and extreme crowding often resolves with a move against the crowded side.

**For longer holds, bias toward being paid.** If you're going to hold for a week, you want to be on the side that collects funding, not the side that pays it. Sometimes this means picking a different asset on a different side of its basis; sometimes it means waiting for a better funding environment before entering.

## Where KLUB fits

We built one feature specifically around funding: every time you type a position into The Math calculator, you see the funding cost per 8 hours at the current rate for that asset. When you open a real position, you see how much funding you've paid or received, updated every hour, in the Health panel.

We also built Basis (V2) to harvest funding on purpose — a delta-neutral perp-perp vault that collects funding from the crowded side of the book. That's a separate product and a separate post, but it exists because funding is a real and persistent edge for anyone who bothers to look at it.

The short version: you don't need to be a professional to pay attention to funding. You need to know it exists, check it before opening, and not hold things for weeks on the paying side when the rate is 30%+ annualized against you.

That's it. That's the whole guide.

---

*The Math calculator shows live funding cost for every position you type at [klub.trade/calculator](https://klub.trade/calculator). If you want an alert when funding on one of your open positions crosses a threshold, that ships with our liquidation alerts — one more piece of the job retail shouldn't have to do in their head.*

*— The KLUB team*
