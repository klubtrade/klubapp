'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * / — KLUB landing page.
 *
 * Design direction: minimal, modern, "alive." Light-purple accent on matte
 * near-black. Scroll-triggered fly-ins with staggered delays (Framer Motion
 * `whileInView`). Single primary CTA — "Enter the app" — routes straight
 * into /trade. All nested product surfaces (calculator, health, follow,
 * practice, invite) live behind that CTA; they are not linked from the
 * landing nav anymore. The marketing and app surfaces are now cleanly split.
 */

// Shared fly-in variant — used by every section block + nested children
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delay: i * 0.08,
      ease: [0.2, 0.7, 0.2, 1] as const,
    },
  }),
};

const viewport = { once: true, amount: 0.2 } as const;

export default function LandingPage() {
  return (
    <main className="relative overflow-x-hidden">
      <LandingNav />
      <Hero />
      <Problem />
      <Features />
      <HowItWorks />
      <Trust />
      <Faq />
      <CtaBlock />
      <Footer />
    </main>
  );
}

// =============================================================================
// Nav — landing-only: logo + single "Enter the app" CTA
// =============================================================================

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
        scrolled
          ? 'border-border-subtle bg-bg-base/70 backdrop-blur-xl backdrop-saturate-150'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-[1160px] items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center gap-2.5 text-[18px] font-semibold tracking-tight">
          <span className="live-dot" aria-hidden />
          KLUB
        </Link>
        <Link href="/cash" className="btn-primary group">
          Enter the app
          <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
        </Link>
      </div>
    </nav>
  );
}

// =============================================================================
// Hero — parallax glow, staggered reveal
// =============================================================================

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  const glowY = useTransform(scrollYProgress, [0, 1], ['0%', '-20%']);

  return (
    <section ref={ref} className="relative overflow-hidden px-6 pb-32 pt-[180px] md:px-10">
      {/* Ambient purple glows */}
      <motion.div
        aria-hidden
        style={{ y: glowY }}
        className="pointer-events-none absolute -right-[10%] top-[10%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(232,182,71,0.12),transparent_60%)] blur-[60px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-[10%] -bottom-[20%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(232,182,71,0.05),transparent_60%)] blur-[50px]"
      />

      <div className="relative z-10 mx-auto max-w-[840px] text-center">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={0}
          className="mb-7 inline-flex items-center gap-2 rounded-full border border-border bg-bg-surface px-[14px] py-1.5 text-xs text-fg-secondary"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Members-only on-chain perps
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={1}
          className="mb-6 text-[clamp(40px,6vw,76px)] font-semibold leading-[1.05] tracking-[-0.03em]"
        >
          Trade with{' '}
          <span className="bg-gradient-to-br from-accent-bright to-accent bg-clip-text text-transparent">
            the klub.
          </span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={2}
          className="mx-auto mb-10 max-w-[600px] text-[clamp(16px,1.5vw,19px)] leading-relaxed text-fg-secondary"
        >
          Follow the traders who actually win. Skip the tuition. Keep your own keys.
          Built on Bulk Exchange.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={3}
          className="mb-20 flex flex-wrap justify-center gap-3"
        >
          <Link
            href="/cash"
            className="btn-primary group"
          >
            Enter the app
            <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-klub border border-border px-[18px] py-2.5 text-sm font-medium text-fg-primary transition-colors duration-200 hover:border-fg-muted hover:bg-bg-elevated"
          >
            See what&rsquo;s inside
          </a>
        </motion.div>

        <motion.dl
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={4}
          className="mx-auto grid max-w-[480px] grid-cols-3 gap-10 border-t border-border-subtle pt-10"
        >
          {[
            ['Latency', '5–20ms'],
            ['Custody', 'Self'],
            ['Fees', 'Net, shown'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="mb-2 text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                {label}
              </dt>
              <dd className="font-mono text-[18px] text-fg-primary">{value}</dd>
            </div>
          ))}
        </motion.dl>
      </div>
    </section>
  );
}

// =============================================================================
// Problem — three stat cards with hover lift
// =============================================================================

function Problem() {
  return (
    <section className="px-6 py-24 md:px-10">
      <div className="mx-auto max-w-[1160px]">
        <motion.div initial="hidden" whileInView="visible" viewport={viewport} variants={fadeUp}>
          <Kicker>The Problem</Kicker>
          <h2 className="mb-5 max-w-[720px] text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.15] tracking-[-0.025em]">
            On-chain perps were built for quants.{' '}
            <span className="text-fg-secondary">Retail pays the tuition.</span>
          </h2>
        </motion.div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              value: '~60%',
              label: 'of retail traders liquidated within their first 30 days on on-chain perps.',
              note: 'KLUB aims to cut this in half for members with alerts on.',
            },
            {
              value: '4 min',
              label: 'median time from signup to first liquidation for leveraged retail.',
              note: 'Our target: members see the math before they fire, not after.',
            },
            {
              value: '0',
              label: 'mainstream on-ramps that respect a trader\u2019s workflow.',
              note: 'KLUB ramps in three taps — like Venmo, not DeFi.',
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
              <div className="mb-4 font-mono text-5xl leading-none tracking-[-0.02em] text-accent">
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
// Features — 3x3 grid with staggered fly-ins
// =============================================================================

function Features() {
  const items: readonly { n: string; title: string; body: string; v: 'V1' | 'V2' }[] = [
    { n: '01', title: 'Follow', v: 'V1', body: 'Opt-in leaderboard ranked net of fees and funding. One-tap mirror with allocation caps, stop-loss override, and pause.' },
    { n: '02', title: 'Liquidation Alerts', v: 'V1', body: 'Tiered warnings at 25%, 10%, 3% buffer. Push, email, Telegram. One-tap actions to add margin, reduce, or close.' },
    { n: '03', title: 'The Math', v: 'V1', body: 'Pre-trade calculator: liquidation price, PnL at target, loss at stop, funding per 8h, breakeven move, R:R.' },
    { n: '04', title: 'Portfolio Health', v: 'V1', body: '0\u2013100 score with plain-English stress tests. "If BTC drops 12%, your ETH long liquidates."' },
    { n: '05', title: 'Practice', v: 'V1', body: 'Real Bulk testnet, real fills, zero money. Every paper trade auto-logs with entry and exit reasoning.' },
    { n: '06', title: '3-Tap Ramp', v: 'V1', body: 'Card or Apple Pay to USDC on Bulk, in three taps. Off-ramp just as clean. No bridges, no hex strings.' },
    { n: '07', title: 'Basis', v: 'V2', body: 'Funding-yield vault that trades perp-perp to harvest funding. Transparent positions, honest APY.' },
    { n: '08', title: 'The Desk', v: 'V2', body: 'Funding-rate arbitrage engine with circuit breakers for black-swan spikes.' },
    { n: '09', title: 'KLUB Pro', v: 'V2', body: 'Terminal-grade trading behind \u2318K. Multi-panel grid, saveable workspaces, ticker command language.' },
  ];

  return (
    <section id="features" className="px-6 py-24 md:px-10">
      <div className="mx-auto max-w-[1160px]">
        <motion.div initial="hidden" whileInView="visible" viewport={viewport} variants={fadeUp}>
          <Kicker>Inside the klub</Kicker>
          <h2 className="mb-5 max-w-[720px] text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.15] tracking-[-0.025em]">
            Every tool a pro has.{' '}
            <span className="text-fg-secondary">Every guardrail retail needs.</span>
          </h2>
          <p className="mb-14 max-w-[560px] text-[17px] leading-relaxed text-fg-secondary">
            Six surfaces at launch. Three more on the V2 roadmap. All share one architecture: we
            never hold your funds.
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
                  it.v === 'V1'
                    ? 'bg-accent/15 text-accent'
                    : 'border border-border text-fg-muted'
                }`}
              >
                {it.v}
              </span>
              <h3 className="mt-5 mb-2.5 text-lg font-semibold">{it.title}</h3>
              <p className="text-sm leading-relaxed text-fg-secondary">{it.body}</p>
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

function HowItWorks() {
  const steps = [
    { n: '01', title: 'Join', body: 'Email or Solana wallet \u2014 Phantom, Backpack, Solflare. Under a minute.' },
    { n: '02', title: 'Deposit', body: 'Three taps from card to funded USDC on Bulk. Self-custody throughout.' },
    { n: '03', title: 'Follow or fly solo', body: 'Mirror a klub leader, or open your own with the math on-screen. Alerts watch your back either way.' },
  ];

  return (
    <section className="px-6 py-24 md:px-10">
      <div className="mx-auto max-w-[1160px]">
        <motion.div initial="hidden" whileInView="visible" viewport={viewport} variants={fadeUp}>
          <Kicker>How it works</Kicker>
          <h2 className="mb-10 text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.15] tracking-[-0.025em]">
            Three steps, one afternoon.
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
              <p className="text-sm leading-relaxed text-fg-secondary">{s.body}</p>
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

function Trust() {
  const items = [
    { h: 'Non-custodial', b: 'Your USDC lives in your own Bulk account. We execute via scoped, revocable agent-wallet keys.' },
    { h: 'Net-of-fees', b: 'Every leaderboard PnL includes trading fees and paid funding. Gross numbers are a lie.' },
    { h: 'Geoblocked by design', b: 'Not available in the US, UK, or sanctioned jurisdictions. KYC handled at the ramp.' },
    { h: 'Pre-launch', b: 'Building in public. Testnet invites ship to the waitlist before general release.' },
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
              <p className="text-sm leading-relaxed text-fg-secondary">{it.b}</p>
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

function Faq() {
  const qa = [
    { q: 'What is Bulk Exchange?', a: 'A decentralized perpetuals exchange on its own L1 (BULK Net) with 5\u201320ms matching latency. KLUB is a retail-focused front-end on top of Bulk\u2019s API.' },
    { q: 'Do you custody my funds?', a: 'No. Your USDC and positions live in your own Bulk account. KLUB executes via agent-wallet keys with scoped permissions you can revoke any time.' },
    { q: 'Is KLUB actually members-only?', a: 'Access is invite-based during pre-launch. Waitlist members get testnet access first, then mainnet.' },
    { q: 'When does KLUB launch?', a: 'Waitlist now. Testnet first, then mainnet with the V1 feature set.' },
    { q: 'What about the US?', a: 'KLUB is not available in the United States, United Kingdom, or sanctioned jurisdictions at launch.' },
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
              className={`group border-b border-border-subtle ${i === 0 ? 'border-t' : ''}`}
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

function CtaBlock() {
  return (
    <section className="px-6 py-24 md:px-10">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewport}
        variants={fadeUp}
        className="mx-auto max-w-[1160px] rounded-klub-lg border border-border bg-[radial-gradient(ellipse_at_top,rgba(232,182,71,0.08),transparent_70%),theme(colors.bg.surface)] px-10 py-24 text-center"
      >
        <Kicker>Membership</Kicker>
        <h2 className="mx-auto mb-4 max-w-[560px] text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.15] tracking-[-0.025em]">
          Get in the klub first.
        </h2>
        <p className="mx-auto mb-9 max-w-[480px] text-[17px] text-fg-secondary">
          Testnet invites go to the waitlist before mainnet. Two-minute signup, zero spam.
        </p>
        <Link href="/cash" className="btn-primary btn-lg group">
          Enter the app
          <span className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
        </Link>
      </motion.div>
    </section>
  );
}

// =============================================================================
// Footer
// =============================================================================

function Footer() {
  return (
    <footer className="border-t border-border-subtle px-6 py-14 md:px-10">
      <div className="mx-auto flex max-w-[1160px] flex-col items-start justify-between gap-6 text-[13px] text-fg-muted md:flex-row md:items-center">
        <div className="flex items-center gap-2.5 font-semibold text-fg-primary">
          <span className="live-dot" aria-hidden />
          KLUB
        </div>
        <div className="flex flex-wrap gap-7">
          <a href="#features" className="transition-colors hover:text-fg-primary">
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

// =============================================================================
// Shared bits
// =============================================================================

function Kicker({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
      {children}
    </div>
  );
}
