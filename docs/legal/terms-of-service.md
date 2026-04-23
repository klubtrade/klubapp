# KLUB — Terms of Service

> **STATUS: DRAFT — FOR COUNSEL REVIEW. NOT LEGALLY BINDING UNTIL EXECUTED.**
>
> Plain-language starting draft produced by the KLUB founding team. Intended as a structured input for qualified crypto-derivatives counsel (familiar with US, EU, BVI/Cayman regulation). Every section flagged `[COUNSEL]` contains an explicit question a lawyer needs to answer.
>
> **Draft version:** 0.1 · **Last revised:** 2026-04-18 · **Owner:** KLUB Labs

---

## 1. Who we are

"KLUB," "we," "us," and "our" refer to **KLUB Labs** (operating entity TBD — likely BVI or Cayman). "Service" or "Platform" means our website at `klub.trade`, our mobile apps when launched, and associated APIs.

KLUB is a **front-end interface** to the [Bulk Exchange](https://bulk.trade) perpetual futures protocol. KLUB is **not** a broker-dealer, clearing firm, custodian, exchange, DCM, or investment advisor. We do not match orders, clear trades, or hold user funds.

`[COUNSEL]` Confirm operating entity jurisdiction, and whether our "non-custodial front-end" characterization is defensible across our target jurisdictions.

---

## 2. Who can use KLUB

### 2.1 Eligibility
You may use KLUB only if you:
- Are at least 18 years of age
- Have legal capacity under your jurisdiction's laws
- Are not located in, a citizen of, or ordinarily resident in a Restricted Jurisdiction (§2.2)
- Are not on any OFAC, EU, UK, or equivalent sanctions list

### 2.2 Restricted Jurisdictions
KLUB is **not available** to persons in:
- The United States of America and territories
- The United Kingdom
- Any jurisdiction under comprehensive OFAC sanctions (Cuba, Iran, North Korea, Syria, Crimea, DNR/LNR)
- Any jurisdiction where our Service would be unlawful or require a license we don't hold

`[COUNSEL]` Finalise list. Specifically flag Canada (provincial securities), Australia (ASIC retail derivative caps), Japan (FSA perp futures), Germany (BaFin). Our preference is to exclude all four at launch and revisit.

### 2.3 Enforcement
- **IP geofencing** at the ramp layer (our on-ramp provider verifies residency before fiat processing)
- **Contractual representation** — by using KLUB you represent you are not in a Restricted Jurisdiction
- **Account termination** on discovery of a violation
- No VPN/Tor access; circumvention is a breach

---

## 3. Account, custody, and trades

### 3.1 Your funds live on Bulk
Your USDC and positions are held in a **Bulk Exchange account owned by you**. KLUB never takes custody. We do not hold a private key that controls your assets.

### 3.2 Agent Wallet authorization
To execute trades on your behalf — including copy trades — you authorize KLUB via a **scoped Agent Wallet key** provisioned on Bulk. This key:
- Can submit orders and manage positions on the markets and up to the allocations you specify
- **Cannot** withdraw funds, change account settings, or transfer to any KLUB-controlled address
- Is revocable at any time directly from your Bulk account

We have no ability to use the key after you revoke it.

### 3.3 Trades are between you and Bulk
Every trade is a transaction between you and the Bulk protocol. **KLUB is not a counterparty** to your trades. We do not provide liquidity, market-make, or take the other side. Execution, settlement, liquidation, and funding are governed by Bulk's protocol rules, not KLUB.

`[COUNSEL]` Stress-test this characterization — if KLUB provides the UI, routes through our backend, and profits from volume, is a "functional broker" argument available to a regulator?

---

## 4. Copy trading (Follow)

### 4.1 What it is
Follow lets you mirror trades of opted-in **Leaders** — other KLUB users who have agreed to publish their activity. When enabled, your Agent Wallet key submits proportional orders on your Bulk account whenever the Leader trades, subject to your configured guardrails (max allocation, stop-loss override, pause, market filter).

### 4.2 Not investment advice
Leaders are individual traders, not licensed investment advisors. Their activity is **not a recommendation**. KLUB does not vet strategies, endorse performance, or guarantee outcomes. Published metrics reflect past performance only; past performance has no predictive value.

`[COUNSEL]` Highest-risk section of the product. Confirm:
- Whether Leaders need registration as advisors in any jurisdiction we serve
- Whether our performance-fee split (10% Leader / 10% platform on net mirrored PnL) triggers registration requirements
- Whether "Leader" status could constitute "holding out" as an investment advisor under anti-holding-out rules

### 4.3 Your responsibility
You are solely responsible for:
- Which Leaders you follow
- Your guardrails (we strongly recommend max allocation well below 100%)
- Monitoring your own positions
- Risk management — including Leader behavior changes, KLUB service interruptions, adverse market moves

### 4.4 Leader agreement
Becoming a Leader requires a separate **Leader Agreement** covering:
- Disclosure obligations (PnL net of fees, max drawdown, worst month, worst week)
- Performance-fee economics
- De-listing policy (month boundaries only)
- Anti-fraud and anti-manipulation representations

---

## 5. Pre-launch and invite-gated access

KLUB is pre-launch. We reserve the right to:
- Restrict access to invite-list members
- Limit transaction sizes
- Suspend or discontinue features
- Require additional verification before mainnet trading

Your invite code confers no right to the Service. We may revoke or expire codes at any time.

---

## 6. Prohibited uses

You may not:
- Use KLUB to launder money, finance terrorism, evade sanctions, or engage in any unlawful activity
- Manipulate markets — wash trading, spoofing, layering, quote stuffing, coordinated activity
- Use automated systems (bots, scrapers) without express written permission
- Reverse-engineer, decompile, or extract proprietary code
- Impersonate others or misrepresent your jurisdiction or identity
- Solicit investment in a fund, pool, or collective investment vehicle via the Leader program
- Hold yourself out as a licensed investment professional through the Leader program unless you actually are one, in a jurisdiction where you are licensed

---

## 7. Fees

### 7.1 What we charge
- **Trading fees:** charged by Bulk, not us. See Bulk's fee schedule.
- **Copy-trade performance fee:** 20% of net mirrored PnL — 10% to the Leader, 10% to KLUB. Charged only on net-positive months; no fee on losing months.
- **Basis vault (when launched):** 2% annual management + 20% performance above a 0% high-water mark.
- **Ramp fees:** charged by our fiat provider. We receive a referral rebate from them.

### 7.2 Fee changes
Fee changes require 30 days' notice via email and in-app. Changes apply prospectively; they don't retroactively affect settled trades.

---

## 8. Risk disclosures

See [Risk Disclosure](risk-disclosure.md). Material risks include total loss of capital, forced liquidation, smart-contract failure of the underlying Bulk protocol, ramp-provider counterparty risk, and KLUB service interruption. You acknowledge you have read and understood the Risk Disclosure before using the Service.

---

## 9. Intellectual property

We own or license all content, code, and design of the Service. You receive a limited, revocable, non-exclusive license to use the Service as intended. No copying, modifying, distributing, selling, or leasing any part of the Service without written consent — other than Leader trade history that Leaders have expressly published.

---

## 10. Limitation of liability

### 10.1 As-is
To the maximum extent permitted by applicable law, KLUB disclaims all warranties express or implied, including merchantability, fitness for a particular purpose, and non-infringement.

### 10.2 No liability for trading losses
**KLUB shall not be liable for any trading losses you incur using the Service**, including losses from:
- Adverse market moves
- Liquidations (forced or otherwise)
- Copy-trade replication of Leader losses
- Latency between order submission and execution
- Service interruptions, bugs, outages
- Smart-contract failures of the Bulk protocol

### 10.3 Aggregate cap
Outside trading losses, KLUB's aggregate liability is capped at the greater of:
- USD 100, or
- Total platform fees you have paid KLUB in the 12 months preceding the claim

`[COUNSEL]` Commercially typical cap, but confirm it's enforceable in every jurisdiction we serve and whether consumer-protection law voids it anywhere.

### 10.4 Indemnification
You indemnify KLUB against claims arising from your breach of these Terms, misrepresentation about your jurisdiction or eligibility, or violation of law.

---

## 11. Governing law and disputes

### 11.1 Governing law
[JURISDICTION — TBD, likely BVI or Cayman], without regard to conflict-of-law rules.

### 11.2 Arbitration
Disputes resolved by final and binding arbitration under the [RULES — e.g., JAMS, LCIA, HKIAC] in [SEAT — e.g., London, Singapore], in English, before a single arbitrator. You waive any class-action or class-arbitration rights.

`[COUNSEL]` Recommend a seat with (a) crypto-literate arbitration bar, (b) enforceable against Leaders across our geography, (c) reasonable admin fees for small disputes.

### 11.3 No class actions
All disputes brought individually, not as part of a class or collective action. This is a material condition of our agreement.

---

## 12. Changes

We may update these Terms. Material changes require 30 days' notice via email and in-app. Continued use after the effective date is acceptance. If you don't accept, you must stop using the Service.

---

## 13. Contact

- **Email:** legal@klub.trade
- **Address:** [REGISTERED OFFICE — TBD]

---

## Drafting notes for counsel

Priority questions:

1. **Entity structure** (§1) — incorporation jurisdiction, operating entity domicile, token-holder relationship if we issue
2. **Restricted Jurisdictions** (§2.2) — US/UK blocked; which others?
3. **Non-custodial characterization** (§3.3) — survives facts-and-circumstances test?
4. **Leader registration** (§4) — advisor status risk
5. **Liability cap** (§10.3) — defensible, or restructure?
6. **Arbitration seat** (§11.2) — recommendation

*See also: `privacy-policy.md`, `risk-disclosure.md`. Review all three together.*
