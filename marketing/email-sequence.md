# KLUB — Launch Email Sequence

*5 emails. Plain-text first, HTML optional. Sent via Resend (or equivalent) once the waitlist-to-Postgres wiring ships in Phase 3.5.*

---

## Global rules

- **Sender:** `hello@klub.trade` — single sender, never a no-reply.
- **Reply-to:** same. If someone replies, we read it. Founder-mode only works if it's actually the founders reading.
- **Plain-text first.** The HTML version is a thin skin over the plain text. No templates that look like a Morgan Stanley quarterly.
- **Subject line rule:** lowercase, no emoji, no brackets. Treat the inbox like a friend's DM.
- **One CTA per email.** If the CTA is "click here," the body earns the click before you ask.

---

## Email 1 — Welcome (T+0, immediately on waitlist signup)

**Subject:** you're in the klub

**Body:**

Hey —

Thanks for adding yourself to the KLUB waitlist. Two quick things.

**1. What KLUB is.** A members-only front-end for on-chain perps on Bulk Exchange. Copy trading with a net-of-fees leaderboard. A pre-trade calculator that runs the math before you click. Liquidation alerts that ping your phone whether the app is open or not. A 3-tap fiat ramp. Real testnet practice mode with an auto-logged journal.

**2. What happens next.** Testnet invites go out in batches before mainnet opens. You'll get yours with a second email from me; batch 1 ships in the next two weeks. Between now and then, I'd genuinely appreciate you doing one of:

- Reply to this email with the one thing that's gone wrong for you on an on-chain perps exchange. We're building a lot of KLUB around the answers.
- If there's a trader whose PnL you'd want to mirror, tell me their handle. We're hand-picking the first twenty leaders and the right names aren't obvious from chain data alone.

That's it. Welcome.

— [founder name]
KLUB
klub.trade

---

## Email 2 — Onboarding / The Math (T+2 days)

**Subject:** the one tool we wish retail had five years ago

**Body:**

Hey —

The single most common thing we hear from people who've been liquidated on an on-chain perps exchange is some version of: *"I didn't realize it could move that much that fast."*

They didn't realize because nobody showed them the math.

We did a thing. It's called The Math — a pre-trade calculator that, the second you type a position, shows:

- Liquidation price (the number that matters)
- Buffer to liquidation (how much adverse move before you're out)
- PnL at target, net of fees
- Loss at stop, net of fees
- Funding cost per 8 hours at current rate
- Breakeven move required
- Reward-to-risk ratio

If your stop is beyond your liquidation — a thing that happens to 1 in 4 retail trades I've inspected — we scream about it in red.

You can try it right now, no signup, no wallet, no nothing: **klub.trade/calculator**

Reply and tell me what you'd change about it.

— [founder name]

---

## Email 3 — First testnet invite (T+7 days, segmented to waitlist-batch-1)

**Subject:** your testnet invite

**Body:**

Hey —

You're in batch 1. Your testnet invite code is:

**KLUB-XXXX**

Claim it at: **klub.trade/invite/KLUB-XXXX**

A few notes for the first session:

1. **Practice mode lives at `/practice`**. Get testnet USDC from Bulk's faucet, open your first paper trade, and force yourself to write the entry reasoning. That field is the whole point of the journal — the retroactive "why did I take that trade" writeup is what separates people who improve from people who don't.
2. **The leaderboard at `/follow` is seeded** with six real traders who volunteered. Clicking "Start following" right now stores your intent locally (the copy execution engine wires in next release). Play with the max-allocation slider. See if the returns projection changes how you think about sizing.
3. **Bugs matter.** If anything breaks or feels wrong, reply to this email. We read every message.

You've got two weeks with testnet before mainnet opens for batch 1. Use them.

— [founder name]

---

## Email 4 — Feature spotlight: Follow (T+14 days, to testnet users who haven't mirrored)

**Subject:** why we built copy trading the way we did

**Body:**

Hey —

I noticed you've been on testnet for a week and haven't tried Follow yet. That's fine — there's no pressure — but I want to explain how we're thinking about it, in case the concept is blocking you.

Copy trading has a bad reputation in crypto. Most of it earned. Scammy platforms, fake leaderboards, "leaders" farming the system by ranking high in lucky months.

We built Follow to be the opposite of that:

- **Every leader opts in.** We don't crawl chain data and rank randos without consent. If you see someone on the board, they chose to be there.
- **Every PnL is net of fees and funding.** Our leaderboard shows what you'd actually keep, not the gross number. Gross PnL boards lie.
- **Every profile publishes the uncomfortable metrics.** Max drawdown. Worst month. Worst week. Time-in-drawdown. If we're going to ask retail to copy these people, retail deserves to see when they bleed.
- **You set the guardrails.** Max allocation (we default to 20%). Stop-loss override that's yours alone. Pause button that works instantly. Unfollow that actually unwinds.

Try it on testnet. Pick the leader whose style looks most like yours and mirror at 10%. See how it feels when their positions show up in your account.

**klub.trade/follow**

— [founder name]

---

## Email 5 — Mainnet is open (T+N, whenever mainnet ships)

**Subject:** mainnet

**Body:**

Hey —

KLUB is live on mainnet.

**klub.trade**

You already have an account. Log in with the email from the testnet invite. Move some USDC in through the ramp (Coinbase, card, ~90 seconds), or deposit directly if you already have USDC on Solana.

Three things I want to say on day one:

1. **Start small.** The Math calculator is there for a reason. Use it. Size down. The psychological gap between testnet and mainnet is bigger than you think, and the first mainnet trade should not be your largest.
2. **Alerts on.** Go to settings and turn on liquidation alerts for every position you open. Whether you want Telegram, push, or email, just turn something on.
3. **Follow defensively.** If you're going to mirror a leader, start at 10% max allocation, not 100%. Raise it after a month, not after a green day.

If you've been on testnet and have specific feedback about anything in V1, the email thread is wide open.

Welcome to the klub.

— [founder name]
KLUB · klub.trade

---

## Re-engagement email (T+30 days post-mainnet, to accounts with 0 trades)

**Subject:** still worth opening the app once

**Body:**

Hey —

Noticed you joined but haven't opened KLUB since. No judgment.

One honest ask: open the app one more time. Not to trade. Just to try the Math calculator with a hypothetical position you've been sitting on. It's at **klub.trade/calculator** and takes 60 seconds.

If the numbers surprise you, great — that's the whole point of KLUB existing. If they don't, you can tell me why the product isn't useful yet by replying here. Both answers help us.

— [founder name]
