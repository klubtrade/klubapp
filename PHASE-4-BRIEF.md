# Phase 4 — Go-to-Market

> Investor deck, demo scripts, tear sheet, content calendar, email sequence, founding blog, leader outreach plan, standalone preview fix, stub modal upgrade.

---

## What Shipped

### Pitch artifacts (in `/deck/`)
- **`klub-investor-deck.pptx`** — 12-slide deck. Matte-black + amber palette matching the product. Geist/Consolas type. Slides: title · problem · why now · solution · product hero · market · business model · competition · moat · traction/roadmap · team · ask. Built with pptxgenjs, visual-QA'd twice, three defects fixed (accent line under title, slide 10 overflow, footer page-number wrapping).
- **`demo-script.md`** — 3-minute core script with 30-second and 5-minute variants. Beat markers for delivery, screen-share cues, emotional peaks identified.
- **`tearsheet.md`** — one-page investor summary: problem, product, architecture, business model, market, traction, funding use, disclosures. Designed for PDF export and attach-to-email use.
- **`build-deck.js`** — the generator itself. Deck is reproducible; edit JS and regenerate rather than hand-editing the PPTX.

### Marketing (in `/marketing/`)
- **`blog/01-the-klub-is-the-point.md`** — 1,500-word founding thesis post. Origin story. Most-quoted phrase: "all the information you need, rendered in a language you don't speak." This piece is the content backbone — every social post and email traces back to a paragraph in it.
- **`content-calendar.md`** — 20 posts spanning 4 weeks across Twitter/X + Farcaster. Organized by phase (framing · product · proof · invites). Hook-first, tone-consistent, visual prompts per post. Includes cadence recommendations, asset pipeline, and repurposing rules.
- **`email-sequence.md`** — 5-email launch drip (welcome → The Math intro → testnet invite → Follow spotlight → mainnet open) + a re-engagement email for dormant accounts. Plain-text-first. `hello@klub.trade` as single sender, founder-reply model.

### Operations & outreach (in `/docs/`)
- **`leader-outreach.md`** — detailed plan for seeding the leaderboard with 20 real opt-in traders before launch. Style distribution targets, acceptance criteria (non-negotiable), where to find candidates (ranked by yield-per-hour), three DM templates, an 8-week sequencing timeline, and predictable failure modes to watch for.

### Product fixes
- **`/trade` stub modal** — replaced `window.alert` with a proper modal component. Keyboard dismiss (Esc), backdrop click dismiss, brand-aligned design with amber accent and live-dot, CTAs to waitlist and `/follow`. Honest messaging about signing being next without breaking the visual flow.
- **`klub-preview.html`** — standalone HTML preview of the landing page. Zero dependencies, opens in any browser. Fixes the "artifact failed to load" issue by not requiring the Next.js toolchain to render. For sharing the design in contexts where a full dev setup isn't practical.

---

## Decisions Made This Phase

- **Deck color palette pulled directly from product.** Matte black (`#0A0A0A`) + amber (`#F59E0B`) across both the app and the deck. Investors see the same palette they see in screenshots. Consistency is a product tell.
- **Page numbers and footers on every deck slide.** Not decoration — it signals a finished, shareable artifact. Boring but important.
- **PPTX generator is code, not a binary.** `build-deck.js` lives in the repo. When the valuation changes or the traction bullet needs an update, you edit the JS and rerun. No more "where's the canonical version" confusion.
- **No stock photography in the deck.** Every visual is either native text, data callouts, or hand-built shapes (the fake calculator on slide 5). Avoids the Getty-Images-in-a-crypto-deck look that sinks investor decks.
- **Blog post is founder-voice, first person.** Not third-person "the team at KLUB is building." Matters for Substack/Paragraph/Mirror distribution where voice is the distribution mechanism.
- **Leader outreach is phased over 8 weeks.** Not a single sprint. Response rates are 15% cold / 50% warm; sequencing 2 DMs/day for 8 weeks gets you to 20 commits. Trying to do it in a week burns the list.

---

## What This Phase *Didn't* Produce

Called out from the original master prompt's deliverable list:

- **Two additional blog posts** (feature deep-dive, trader's guide) — I shipped one post fully, deferred the other two. Blog posts are cheap to produce when you have the thesis piece done; write them as you ship each feature rather than front-loading.
- **Financial model skeleton** (Google Sheets) — intentionally deferred. Model design depends on Phase 3.5 copy-trade fee economics and the Bulk integrator PFOF terms. Premature to spreadsheet it before both are confirmed.
- **Separate one-page tear sheet PDF** — shipped as markdown (`tearsheet.md`). Convert to PDF via `markdown-pdf tearsheet.md tearsheet.pdf` when sending to an investor; no reason to maintain a separate binary.

---

## Before Launch: What Still Needs to Happen

This is a launch-readiness checklist, in priority order.

### Gating (can't launch without)
1. **Bulk integrator answers** — bridge mechanics, Agent Wallet scope granularity, leaderboard data source. All three block Phase 3.5 backend. Chase these now.
2. **Phase 3.5 backend work** — copy-trade executor, alerts worker, waitlist → Postgres, `bulk-keychain` wiring. Estimate: 4–6 weeks of senior engineering time.
3. **Leader onboarding** — 20 real leaders with published metrics. Run in parallel with backend. Estimate: 6–8 weeks of founder outreach.
4. **Legal** — TOS, privacy, risk disclosures reviewed by crypto counsel. Jurisdictional geoblocking confirmed at the ramp-provider level. **Non-skippable.**

### Strongly recommended (not gating)
5. **First 100 waitlist members** — soft-launch the landing page, seed with your personal network. Target 100 emails before formal GTM begins.
6. **One live AMA or trader interview** — content calendar post #15 (the AMA) should be real, not a post-hoc Space. Book it before launch week.
7. **Two more blog posts** — The Math deep-dive + "The retail trader's guide to funding rates." Publish one/week leading up to launch.
8. **`bulk-keychain` integration smoke-tested on testnet** — place a real order through the KLUB UI end-to-end on testnet with a real Solana wallet. This is the single most important Phase 3.5 validation.

### Nice to have
9. **Founder-narrated product video** — 3-minute walkthrough, same script as the demo, screen-recorded on a real testnet account. Runs on the landing page, in pitch emails, everywhere.
10. **Referral mechanic** — copy-trade-specific: your follows earn you a slice of the platform fee when a friend you referred follows the same leader. Wire into Phase 3.5.

---

## Running Total (Phases 1–4)

| Phase | Delivered |
|---|---|
| **1. Foundations** | Monorepo, brand, typed Bulk API client (tested), landing page |
| **2. Core math** | `@klub/calc` package, The Math calculator page, Portfolio Health page, auth scaffolding, ramp abstraction layer |
| **3. Differentiators** | Shared TopNav, /follow leaderboard + leader profiles + copy config, /practice (testnet + journal), /trade screen, /invite[code] flow, /api/portfolio + /api/invite endpoints |
| **4. Go-to-market** | Investor deck (PPTX), demo script, tearsheet, content calendar, email sequence, founding blog, leader outreach plan, stub modal upgrade, HTML landing preview |

**Combined repo:** ~70 files. Six runnable product surfaces. One 12-slide deck. Twenty-six marketing documents. Enough to run a credible launch.

---

## What Could Go Wrong (and Isn't Obvious)

Three risks worth naming that aren't in any of the shipped documents:

1. **The first mainnet liquidation.** When a KLUB user gets liquidated in month 1 — and someone will — the public reaction determines whether KLUB is seen as a safety net or as complicit. Have a written post-mortem template ready. The product's credibility is the *response*, not the liquidation itself.
2. **The first leader blowup.** A leader will have a -20% week in the first quarter. How we handle it publicly — disclosure, not defensiveness — determines whether the leaderboard survives as a trust signal. Plan the response now.
3. **Ramp provider dependency.** If Coinbase Onramp changes its terms or Solana support, the 3-tap ramp breaks. Transak as a fallback is documented in the ramp abstraction, but wiring it is Phase 3.5 work that's easy to defer. Don't.

---

## Next Move

The phases are done. What's left is execution:

- **If you raise:** use Phase 4 materials (deck, tearsheet, demo script) immediately. The deck is valuation-agnostic — swap `[$AMOUNT]` and `[valuation]` on slide 12 before sending.
- **If you don't raise:** the 4 Phases ship a bootstrappable V1. The constraint is Phase 3.5 backend engineering time. Solo or with one hire, that's 8–12 weeks.
- **Either way:** start leader outreach now. `docs/leader-outreach.md` is the playbook. Every week you wait is a week the leaderboard stays empty.

Ship something.
