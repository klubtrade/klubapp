# KLUB Risk Disclosure Statement

> **DRAFT — NOT YET REVIEWED BY COUNSEL.**
> This is a structured plain-English disclosure. A crypto-derivatives lawyer needs to review for jurisdiction-specific requirements (particularly for EU MiCA, UK FCA promotions rules, and any jurisdiction-specific derivatives disclaimers we need to include).
>
> Last draft update: April 2026
> Effective date: \[TBD post-counsel review\]

---

## Read this before trading.

KLUB provides an interface to Bulk Exchange, a decentralized perpetual futures ("perps") protocol. Trading perps is high-risk. This document exists to make sure you understand the specific risks *before* you open a position, not after.

This is not a form you click through. We want you to read it.

---

## 1. You can lose all your money.

Perpetual futures with leverage can and regularly do result in the complete loss of the collateral you commit to a position. When the mark price moves against you by an amount equal to your margin, the exchange force-closes ("liquidates") your position, and you lose that margin.

At 10x leverage, a roughly 10% adverse move causes this. At 25x leverage, roughly 4%. At 50x, roughly 2%. These moves happen in minutes or seconds, routinely, without warning.

**Industry data suggests that between 50% and 70% of retail traders on on-chain perps are liquidated within their first 30 days of trading.** We cite this not to sell you anything — we cite it because you should know it before your first click.

## 2. You can lose more than your collateral in rare cases.

In extreme market conditions — very fast moves, chain congestion, oracle failures, cascading liquidations — the exchange's auto-deleveraging and insurance-fund mechanisms may not fully offset losses, and you can end up with a negative balance. On most reputable venues this is rare, but it is possible, and KLUB cannot guarantee it will never happen to you.

## 3. Leverage amplifies everything.

Leverage is not magic. It does not create returns. It rents you additional exposure at a cost. Whatever you win with leverage, you could have won (less) without it. Whatever you lose with leverage, you could have lost (much less) without it. Most retail traders overestimate the upside of leverage and underestimate the downside.

If you don't already know what leverage level is appropriate for your strategy, start at 2x or less.

## 4. Funding rates compound against you.

Perpetual futures have a "funding rate" paid between longs and shorts every 1 hour (on Bulk) or 8 hours (on other venues). When the perp trades above spot, longs pay shorts. When it trades below, shorts pay longs. Rates can reach 1% per 8-hour period in extreme conditions — which is roughly 300% annualized.

If you hold a position on the paying side of an extreme funding environment, you can lose meaningful capital to funding alone, even if the price doesn't move. Our interface shows funding cost per 8 hours on every trade. Look at it before you hold.

## 5. Copy trading has its own risks.

Copying a Leader's trades does not guarantee you'll make money. Specifically:

- **Past performance is not future performance.** A Leader with a +40% month last month can and will have losing months.
- **Leaders can deviate from their style.** The scalper you followed for their tight risk management can still have a revenge-trading day.
- **Your allocation matters more than the Leader's PnL.** If you allocate 100% of your equity to mirror a Leader and that Leader has a bad week, your account has a bad week.
- **Leaders can stop trading.** A Leader who goes on vacation, changes platforms, or quits leaves your copy relationship dormant. New trades stop; open trades you've mirrored remain yours to manage.

We set default allocation caps conservatively (we ship with 20%) and allow you to set your own stop-loss override independent of the Leader. Use them.

## 6. KLUB is a front-end, not a counterparty.

KLUB does not operate the exchange. All trades execute on Bulk Exchange. If Bulk experiences an outage, malfunction, or failure, your ability to open, modify, or close positions depends on Bulk's status, not ours. We have no special ability to move your funds, adjust your positions, or override exchange behavior.

## 7. Smart contract and chain risk.

Bulk runs on its own L1 (BULK Net). All of the following can affect your positions:

- Bugs in Bulk's smart contracts
- Bugs in the underlying L1 consensus
- Oracle failures causing mark prices to diverge from real-world prices
- Chain halts or congestion preventing timely closing of positions
- Exploits of Bulk or of KLUB's own integration code
- Exploits of your wallet provider (Phantom, Backpack, etc.)

No software is perfect. Every participant in this stack — Bulk, the chain, your wallet, KLUB's front-end — could have undiscovered vulnerabilities. Audits reduce but do not eliminate this risk.

## 8. Agent Wallet risk.

When you authorize an Agent Wallet (e.g., for copy trading or automated liquidation defense), you are granting a cryptographic key the ability to execute specific actions within the scope you set. You should:

- Set a maximum notional cap that you can afford to lose if the Agent Wallet is misused or compromised.
- Set a reasonable expiration time — no more than a few months for non-trivial amounts.
- Revoke Agent Wallets you are no longer using.

Actions taken by an Agent Wallet within the scope you authorized are your actions for all legal and financial purposes.

## 9. Cybersecurity and account safety.

Standard safety practices apply:

- Your wallet's seed phrase is the only way to recover your funds. If you lose it, nobody — not us, not Bulk, not the chain — can help you.
- Beware phishing. We will never ask for your seed phrase. We do not have a Telegram support channel. If someone messages you claiming to be KLUB support, they are not.
- Use a hardware wallet for any account holding more than pocket-money amounts.

## 10. Liquidation alerts are not guarantees.

KLUB offers liquidation alerts at 25%, 10%, and 3% buffer tiers, delivered by push, email, and (planned) Telegram. We make best efforts to deliver these in real time. We do not and cannot guarantee they arrive, arrive in time, or reflect the latest on-chain state. You should not rely exclusively on our alerts to monitor positions, especially when holding leveraged positions overnight or during high-volatility events.

## 11. Tax is your problem.

KLUB does not provide tax advice. Trading perps generates taxable events (gain/loss on closure, funding received/paid) in most jurisdictions. You are responsible for tracking your own activity and filing appropriately. We may make trade history exports available, but this is not tax guidance.

## 12. Regulatory risk.

Cryptocurrency and on-chain derivatives regulation is evolving. A change in applicable law may cause KLUB to suspend, modify, or terminate services in your jurisdiction without notice. We commit to giving as much advance warning as legally possible, but in some regulatory scenarios advance warning is not permitted.

## 13. We block certain jurisdictions by design.

KLUB is not available in the United States, United Kingdom, or OFAC-sanctioned jurisdictions. Evading this block through VPNs, falsified KYC, or similar methods violates our Terms of Service and may violate applicable law. If you are uncertain whether you are eligible, ask a lawyer in your jurisdiction before using the Service.

## 14. Before you start.

A brief checklist:

- You are not in a Restricted Jurisdiction.
- You can afford to lose the amount you are about to deposit.
- You understand that leverage above 5x magnifies risk disproportionately.
- You have used the Practice mode at least once.
- You have run The Math calculator on the specific position you plan to open.
- You have set a stop-loss that is *not* beyond your liquidation price.
- Your alerts are enabled.
- Your Agent Wallet scopes, if any, have sensible caps and expirations.

If any of these is "no," close this tab. Come back when they're all "yes."

---

**Acknowledgment required:** By using the Service to place a real-money trade, you acknowledge that you have read and understood this Risk Disclosure Statement, and that you accept the risks described.

**Version:** 0.1-DRAFT (pre-counsel review)

**Contact:** legal@klub.trade
