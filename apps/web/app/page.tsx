"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * / - KLUB landing page.
 *
 * Minimal landing surface for the retail gateway to Bulk Exchange.
 * The only primary CTA opens Privy; successful first-time connections
 * continue into onboarding before the app shell.
 */

import {
  CtaBlock,
  Faq,
  Features,
  Footer,
  HowItWorks,
  Problem,
  Trust,
} from "./landing-sections";
import { EnterAppButton, fadeUp } from "./landing-ui";

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
// Nav - landing-only: logo + single "Enter the app" CTA
// =============================================================================

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
        scrolled
          ? "border-border-subtle bg-bg-base/70 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-[1160px] items-center justify-between px-6 py-4 md:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[18px] font-semibold tracking-tight"
        >
          <span className="live-dot" aria-hidden />
          KLUB
        </Link>
        <EnterAppButton />
      </div>
    </nav>
  );
}

// =============================================================================
// Hero - parallax glow, staggered reveal
// =============================================================================

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const glowY = useTransform(scrollYProgress, [0, 1], ["0%", "-20%"]);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden px-6 pb-32 pt-[180px] md:px-10"
    >
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
          Built for Bulk Exchange
        </motion.div>

        <motion.h1
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={1}
          className="mb-6 text-[clamp(40px,6vw,76px)] font-semibold leading-[1.05] tracking-[-0.03em]"
        >
          The retail gateway to{" "}
          <span className="bg-gradient-to-br from-accent-bright to-accent bg-clip-text text-transparent">
            Bulk Haven.
          </span>
        </motion.h1>

        <motion.p
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={2}
          className="mx-auto mb-10 max-w-[600px] text-[clamp(16px,1.5vw,19px)] leading-relaxed text-fg-secondary"
        >
          A simpler way to connect, fund, trade, and manage risk on Bulk
          Exchange.
        </motion.p>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={3}
          className="mb-20 flex flex-wrap justify-center gap-3"
        >
          <EnterAppButton />
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
            ["Venue", "Bulk"],
            ["Margin", "USDC"],
            ["Custody", "Self"],
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
