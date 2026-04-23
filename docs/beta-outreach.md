# KLUB — Beta Tester Outreach

> Goal: 20 real users on testnet within 5 days. Not 200. Twenty. Each one you know the name of.

---

## Who you're recruiting

Twenty people, three groups:

**Group A: 8 people — friends who actually trade** (30 min to recruit)
The friends in your network who have actually sent a perpetual futures trade in the last 90 days. Not just "I bought some BTC on Coinbase." Real perps on GMX, Hyperliquid, dYdX, Aster, etc. You probably know 8-12 of these people. Message them individually, not in a group chat.

**Group B: 8 people — founder friends building adjacent products** (1 hour to recruit)
Founders building other on-chain trading tools, wallets, ramp providers, leaderboard aggregators. They'll give you the sharpest feedback because they're living in the same headspace. Offer a reciprocal beta.

**Group C: 4 people — retail traders you admire on crypto Twitter/Farcaster** (2–3 days to recruit)
Mid-tier traders with 5k–30k followers who post real PnL screenshots (not just winners). They're the ones who'll eventually become Leaders. Start the relationship now; don't pitch anything yet. Just: "I'm building something, would love your eyes when it's ready."

---

## Timeline (5 days)

**Day 1 — Monday**
- Draft your personal list of 12 Group A candidates and 12 Group B candidates (overshoot by 50% to account for no-responses)
- Write the DM templates (below)
- Set up a shared doc for feedback collection (Notion, Linear, or a Google Doc with timestamped sections)
- Set up a private Telegram group: "klub beta cohort 1"

**Day 2 — Tuesday**
- Send 12 DMs to Group A. One-on-one, no group blast.
- Send 12 DMs to Group B. Reciprocal-beta framing.
- Track responses in a spreadsheet.

**Day 3 — Wednesday**
- Expected response rate: 50%+ on Group A, 35%+ on Group B
- Triage: who's in? Send them invite codes.
- Identify your top 4 Group C candidates. Don't DM yet — engage with their content for a day first.

**Day 4 — Thursday**
- Reply to their posts thoughtfully. Not "great post." Actually engage.
- If it lands, DM them. Use the Group C template below.

**Day 5 — Friday**
- By end of day, you should have ~16–18 testers. That's fine. Aim for 20, settle for 18.
- Send the onboarding email. Schedule the first office-hours session for the following Tuesday.

---

## DM templates

### Group A — friend who trades

> Hey [name] — quick ask.
>
> I'm building a thing called KLUB. It's a retail front-end for on-chain perps on Bulk Exchange. Copy trading, pre-trade math, liquidation alerts, a simple ramp.
>
> You're on my list of 8 people whose opinion I actually want before we open it up. Testnet is live, I can hand you an invite code. Probably 30 min to kick the tires, 10 more if you feel like writing me a note about what sucks.
>
> Interested?

**Don't:** over-explain, attach a pitch deck, mention Anthropic/Bulk/any other tech buzzwords.
**Do:** make it feel like a favor to you, not a favor to them. People help friends, not products.

### Group B — founder friend building adjacent

> Hey [name] — want to trade betas?
>
> You've got [your-project]; I've got KLUB. We're both pre-launch and we're both probably lying to ourselves about what's working. Mine is a retail front-end for Bulk perps. Yours is [their-thing].
>
> Let me get you a KLUB invite code, you get me a [their-thing] access. We both get sharp feedback from someone who can't fake politeness because we have to look at each other at conferences for the next decade.
>
> Deal?

**Don't:** promise specific user crossovers. You don't know what's going to work yet.
**Do:** name-drop mutual friends if you have them. "Saw [mutual] retweet your Farcaster post" is a warm open.

### Group C — trader you admire (cold-ish)

> Hey [name] — real quick.
>
> I've been following your takes on [specific recent post, not a generic compliment] — the one about [specific thing] was the clearest take I've seen on that in a while.
>
> I'm building KLUB — a retail front-end for Bulk Exchange perps. Copy trading, pre-trade calculator, a leaderboard that's actually net-of-fees. No airdrop farming, no points BS. Looking for 4 sharp retail traders for a pre-launch beta. No pitch, just want someone who'll tell me when the UI is dumb.
>
> Worth a look? I can send an invite code and a 10-minute Loom of what's new.

**Don't:** offer compensation. People with 30k followers on crypto Twitter don't need $50 gift cards; they need to believe you're building something worth their reputation risk.
**Do:** reference their work specifically. If you can't, you're cold-pitching and shouldn't be.

---

## Onboarding flow for beta testers

Once they accept, this is what they get:

1. **Welcome email** (you, personally, from `[your-name]@klub.trade`)
   - Their invite code
   - Link to klub.trade/invite/[code]
   - "If anything is broken, DM me or drop a note in the Telegram group"
   - Expected time: 15 min to try, 10 min to feedback

2. **Telegram invite** to the private beta group
   - You pin: "What's shipping this week" + a pinned feedback form link
   - You're in there answering questions, not lurking

3. **Tuesday office hours**
   - 30-minute video call. Open invite. Anyone from the cohort can come.
   - You screen-share, they roast. Record so the non-attending testers can catch up.
   - Run for the first 4 weeks. If attendance drops below 3, kill it.

4. **Weekly email** (you, personally)
   - What shipped this week
   - One open question: "Which of [X, Y, Z] would you actually use?"
   - Unsubscribe = they opted out of beta, no hard feelings

---

## Feedback capture

**Live capture:** private Telegram group. Read everything, reply to everything within 24h. This is the most expensive part — treat it like support. If you can't do 24h, you shouldn't be running a beta yet.

**Structured capture:** 3-question form after each session
1. What did you want to do and couldn't?
2. What surprised you (good or bad)?
3. On a scale of 1-10, how likely are you to recommend KLUB to a friend who trades perps? (NPS)

**Numeric capture:** PostHog on the testnet build
- Funnel: `/home → /quick-trade → trade_confirmed`
- Time-to-first-trade (landing → confirmed trade)
- Features they opened but didn't use (Follow? Basis? Pro?)

---

## What "success" looks like after 2 weeks

- 18+ testers activated (logged in at least twice)
- 8+ completed the full quick-trade flow on testnet
- 3+ submitted detailed written feedback (>100 words)
- NPS ≥ 6 average
- 1+ tester asked unprompted to introduce a friend

If those numbers hold, you've got product-market fit signal. Scale the cohort to 100.

If they don't — if testers open once and disappear, if NPS is below 4, if no one sends the unprompted intro — you have a problem that adding users won't solve. Go back to the product.

---

## What to watch for

**Silent failures.** A tester who says "yeah it's cool" and never opens it again. That's worse than a tester who says "this sucks because X" and leaves. Invite 3 of the quiet ones to a 15-min call. If they won't take the call, they're gone; stop counting them.

**Loudest voice syndrome.** One tester with strong opinions dominating the feedback. Their opinions aren't more valid because they're louder. Discount accordingly.

**Feature requests masquerading as bug reports.** "It's broken that I can't do X" usually means "I wish I could do X." Triage into product roadmap, not hotfix queue.

**Mobile-first evidence.** If testers are opening KLUB on phone and bouncing, that's a design problem, not a testing problem. Audit the mobile experience immediately.

---

## One anti-pattern to avoid

**Don't turn the beta into a demo tour.** You're not presenting; they're testing. If you find yourself explaining what each button does, the UI is doing the wrong thing. Let them struggle silently for 30 seconds before jumping in. What they can't figure out IS the product's problem to solve.
