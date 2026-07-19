"use client";

import { motion } from "framer-motion";
import Image from "next/image";

import { EnterAppButton, Kicker, fadeUp, viewport } from "./landing-ui";

// =============================================================================
// Problem - three stat cards with hover lift
// =============================================================================

export function Problem() {
  return (
    <section className="px-6 py-24 md:px-10">
      <div className="mx-auto max-w-[1160px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={fadeUp}
        >
          <Kicker>The Problem</Kicker>
          <h2 className="mb-5 max-w-[720px] text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.15] tracking-[-0.025em]">
            Perps are fast.{" "}
            <span className="text-fg-secondary">
              Most retail interfaces are not.
            </span>
          </h2>
        </motion.div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              value: "Too much",
              label: "Trading screens expose every control at once.",
              note: "KLUB starts with the action the user actually needs.",
            },
            {
              value: "Too late",
              label: "Risk usually appears after the order is already open.",
              note: "KLUB puts size, liquidation, stops, and account health in the flow.",
            },
            {
              value: "Too much friction",
              label:
                "Wallets, test funds, routes, and market data feel disconnected.",
              note: "KLUB makes onboarding, funding, and trading one path.",
            },
          ].map((s, i) => (
            <motion.div
              key={s.value}
              initial="hidden"
              whileInView="visible"
              viewport={viewport}
              variants={fadeUp}
              custom={i + 1}
              className="group rounded-klub-lg border border-border-subtle bg-bg-surface p-8 transition-all duration-300 hover:-translate-y-1 hover:border-border"
            >
              <div className="mb-4 font-mono text-[32px] leading-none tracking-[-0.02em] text-accent">
                {s.value}
              </div>
              <div className="mb-4 text-base text-fg-primary">{s.label}</div>
              <div className="border-t border-border-subtle pt-4 text-[13px] text-fg-muted">
                {s.note}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Features - 3x3 grid with staggered fly-ins
// =============================================================================

export function Features() {
  const items: readonly {
    n: string;
    title: string;
    body: string;
    v: "V1" | "V2";
  }[] = [
    {
      n: "01",
      title: "Connect",
      v: "V1",
      body: "Email or Solana wallet through Privy. New users go straight to faucet setup.",
    },
    {
      n: "02",
      title: "Fund",
      v: "V1",
      body: "See balances, pots, receive links, and test USDC in one clean money surface.",
    },
    {
      n: "03",
      title: "Trade",
      v: "V1",
      body: "Open market or limit orders with size, leverage, target, stop, and liquidation context nearby.",
    },
    {
      n: "04",
      title: "Risk",
      v: "V1",
      body: "Portfolio health, liquidation proximity, and plain-language warnings before risk becomes urgent.",
    },
    {
      n: "05",
      title: "Follow",
      v: "V1",
      body: "Discover traders and copy with allocation caps, pause controls, and transparent risk settings.",
    },
    {
      n: "06",
      title: "Pro",
      v: "V1",
      body: "A cleaner advanced workspace with chart, book, tape, positions, and order entry.",
    },
    {
      n: "07",
      title: "Practice",
      v: "V2",
      body: "Testnet-first learning with real Bulk flows and no real capital at risk.",
    },
    {
      n: "08",
      title: "Earn",
      v: "V2",
      body: "Funding-aware products after the core trading and risk flow is stable.",
    },
    {
      n: "09",
      title: "Automation",
      v: "V2",
      body: "Scoped agent-wallet execution for faster trading without repeated wallet popups.",
    },
  ];

  return (
    <section id="features" className="px-6 py-24 md:px-10">
      <div className="mx-auto max-w-[1160px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={fadeUp}
        >
          <Kicker>Inside the klub</Kicker>
          <h2 className="mb-5 max-w-[720px] text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.15] tracking-[-0.025em]">
            One app for the first trade,{" "}
            <span className="text-fg-secondary">and the hundredth.</span>
          </h2>
          <p className="mb-14 max-w-[560px] text-[17px] leading-relaxed text-fg-secondary">
            Simple by default. Advanced when needed. Non-custodial throughout.
          </p>
        </motion.div>
        <div className="grid gap-px overflow-hidden rounded-klub-lg border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <motion.article
              key={it.n}
              initial="hidden"
              whileInView="visible"
              viewport={viewport}
              variants={fadeUp}
              custom={i + 1}
              className="group relative bg-bg-surface p-9 transition-colors duration-300 hover:bg-bg-elevated"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                {it.n}
              </span>
              <span
                className={`float-right rounded px-2 py-0.5 font-mono text-[10px] tracking-[0.05em] ${
                  it.v === "V1"
                    ? "bg-accent/15 text-accent"
                    : "border border-border text-fg-muted"
                }`}
              >
                {it.v}
              </span>
              <h3 className="mt-5 mb-2.5 text-lg font-semibold">{it.title}</h3>
              <p className="text-sm leading-relaxed text-fg-secondary">
                {it.body}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// How it works
// =============================================================================

export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Connect",
      body: "Use email or a Solana wallet. Privy handles the login gateway.",
    },
    {
      n: "02",
      title: "Claim test USDC",
      body: "Claim 1,000 test USDC when eligible, or continue straight into Portfolio or Trade.",
    },
    {
      n: "03",
      title: "Trade on Bulk",
      body: "Review markets, risk, orders, and positions through a cleaner retail layer.",
    },
  ];

  return (
    <section className="px-6 py-24 md:px-10">
      <div className="mx-auto max-w-[1160px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={fadeUp}
        >
          <Kicker>How it works</Kicker>
          <h2 className="mb-10 text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.15] tracking-[-0.025em]">
            Connect. Fund. Trade.
          </h2>
        </motion.div>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial="hidden"
              whileInView="visible"
              viewport={viewport}
              variants={fadeUp}
              custom={i + 1}
              className="rounded-klub-lg border border-border-subtle bg-bg-surface p-9"
            >
              <div className="mb-5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 font-mono text-[13px] font-medium text-accent">
                {s.n}
              </div>
              <h3 className="mb-2.5 text-xl font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-fg-secondary">
                {s.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Trust strip
// =============================================================================

export function Trust() {
  const items = [
    {
      h: "Bulk Exchange",
      b: "A decentralized perpetuals exchange engineered for low-latency order-book trading.",
    },
    {
      h: "USDC margin",
      b: "Bulk perpetual contracts are USDC-margined, with funding payments exchanged hourly.",
    },
    {
      h: "Order book",
      b: "Bulk runs central limit order books with price-time priority for each perpetual market.",
    },
    {
      h: "Self-custody",
      b: "KLUB is a front-end. Users keep control of accounts and signatures.",
    },
  ];

  return (
    <section className="border-y border-border-subtle px-6 py-16 md:px-10">
      <div className="mx-auto max-w-[1160px]">
        <div className="grid gap-10 md:grid-cols-4">
          {items.map((it, i) => (
            <motion.div
              key={it.h}
              initial="hidden"
              whileInView="visible"
              viewport={viewport}
              variants={fadeUp}
              custom={i}
            >
              <h4 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-accent">
                {it.h}
              </h4>
              <p className="text-sm leading-relaxed text-fg-secondary">
                {it.b}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// FAQ
// =============================================================================

export function Faq() {
  const qa = [
    {
      q: "What is Bulk Exchange?",
      a: "Bulk Exchange is a decentralized perpetuals exchange built for high-performance on-chain order-book trading.",
    },
    {
      q: "What is Bulk Haven?",
      a: "Bulk Haven is KLUB\u2019s name for the simpler retail experience around Bulk: connect, fund, trade, track risk, and learn the market without terminal clutter.",
    },
    {
      q: "Is KLUB gated?",
      a: "No. KLUB is for everyone. Some features may roll out gradually while the app is in active development, but the product is not private or invite-only.",
    },
    {
      q: "Do you custody my funds?",
      a: "No. KLUB is a front-end. Your account, collateral, positions, and signatures stay with the wallet and Bulk account flow.",
    },
    {
      q: "What can I trade?",
      a: "Bulk focuses on crypto perpetual markets. The live app and Bulk exchange info are the source of truth for current markets, limits, and parameters.",
    },
    {
      q: "What does USDC-margined mean?",
      a: "Perpetual contracts on Bulk use USDC as settlement collateral, with no expiry and hourly funding to keep perp prices anchored to spot.",
    },
    {
      q: "Why use KLUB instead of a raw terminal?",
      a: "KLUB keeps the main path simple: wallet, funding, size, risk, order, position. Advanced views stay available in Pro.",
    },
    {
      q: "Does KLUB support testnet?",
      a: "Yes. New users can go through onboarding, claim 1,000 test USDC when eligible, and trade Bulk testnet markets.",
    },
    {
      q: "Does KLUB charge extra fees?",
      a: "The app is built to show costs clearly. Exchange fees and market parameters come from Bulk; any KLUB-specific fees should be explicit before execution.",
    },
  ];

  return (
    <section className="px-6 py-24 md:px-10">
      <div className="mx-auto max-w-[1160px]">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={fadeUp}
          className="mb-14 text-center"
        >
          <Kicker>FAQ</Kicker>
          <h2 className="mx-auto text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.15] tracking-[-0.025em]">
            Questions.
          </h2>
        </motion.div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewport}
          variants={fadeUp}
          custom={1}
          className="mx-auto max-w-[720px]"
        >
          {qa.map((item, i) => (
            <details
              key={item.q}
              className={`group border-b border-border-subtle ${i === 0 ? "border-t" : ""}`}
            >
              <summary className="flex cursor-pointer items-center justify-between py-6 text-[17px] font-medium text-fg-primary [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="h-2.5 w-2.5 rotate-45 border-b-2 border-r-2 border-accent transition-transform duration-200 group-open:-rotate-[135deg]" />
              </summary>
              <div className="pb-6 pr-12 text-[15px] leading-relaxed text-fg-secondary">
                {item.a}
              </div>
            </details>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// =============================================================================
// CTA
// =============================================================================

export function CtaBlock() {
  return (
    <section className="px-6 py-24 md:px-10">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewport}
        variants={fadeUp}
        className="mx-auto max-w-[1160px] rounded-klub-lg border border-border bg-[radial-gradient(ellipse_at_top,rgba(232,182,71,0.08),transparent_70%),theme(colors.bg.surface)] px-10 py-24 text-center"
      >
        <Kicker>Open access</Kicker>
        <h2 className="mx-auto mb-4 max-w-[560px] text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.15] tracking-[-0.025em]">
          Start with a wallet. Learn with test USDC.
        </h2>
        <p className="mx-auto mb-9 max-w-[480px] text-[17px] text-fg-secondary">
          Connect, claim test USDC when eligible, and enter the app through the
          same onboarding flow every time.
        </p>
        <EnterAppButton large />
      </motion.div>
    </section>
  );
}

// =============================================================================
// Footer
// =============================================================================

export function Footer() {
  return (
    <footer className="border-t border-border-subtle px-6 py-14 md:px-10">
      <div className="mx-auto flex max-w-[1160px] flex-col items-start justify-between gap-6 text-[13px] text-fg-muted md:flex-row md:items-center">
        <Image
          src="/privy-logo.png"
          alt="KLUB"
          width={72}
          height={36}
          className="h-9 w-[72px] object-contain"
        />
        <div className="flex flex-wrap gap-7">
          <a
            href="#features"
            className="transition-colors hover:text-fg-primary"
          >
            Features
          </a>
          <a
            href="https://docs.bulk.trade"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-fg-primary"
          >
            Bulk docs
          </a>
          <a href="#" className="transition-colors hover:text-fg-primary">
            Privacy
          </a>
          <a href="#" className="transition-colors hover:text-fg-primary">
            Terms
          </a>
        </div>
        <div>© 2026 KLUB Labs</div>
      </div>
    </footer>
  );
}
