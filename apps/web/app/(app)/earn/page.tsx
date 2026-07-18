"use client";

import Link from "next/link";

import { useFundingRates } from "@/hooks/use-funding-rates";
import {
  formatBasisVaultFee,
  getBasisVaultConfig,
} from "@/lib/basis-vault/config";
import { MARKETS, type MarketSymbol } from "@/lib/markets";

export default function EarnPage() {
  const vault = getBasisVaultConfig();

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-2xl">
        <header>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            Earn
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Testnet strategies with clear terms.
          </p>
        </header>

        <div className="mt-6 rounded-klub-lg border border-border-subtle bg-bg-surface p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <MiniStat label="Min" value={`$${vault.minDepositUsdc}`} />
            <MiniStat
              label="Fee"
              value={formatBasisVaultFee(vault.performanceFeeBps)}
            />
            <MiniStat label="Withdraw" value="Instant" />
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <BasisCard ready={vault.ready} />
          <FundingCard />
          <YieldCard />
        </div>

        <p className="mt-7 text-center text-[11px] text-fg-muted">
          Basis Vault uses devnet mock USDC, separate from Bulk test USDC.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function MiniStat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <div className="font-mono text-[18px] font-semibold text-fg-primary">
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
        {label}
      </div>
    </div>
  );
}

function BasisCard({ ready }: { readonly ready: boolean }) {
  const symbols = MARKETS.map((m) => m.symbol) as MarketSymbol[];
  const rates = useFundingRates(symbols);
  const top = topBasisCarry(symbols, rates);

  return (
    <Link
      href="/basis"
      className="block rounded-klub-lg border border-border-subtle bg-bg-surface p-5 transition-colors hover:border-border hover:bg-bg-elevated"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <IconBasis />
          </div>
          <div>
            <div className="text-[15px] font-semibold text-fg-primary">
              Basis vault
            </div>
            <div className="mt-0.5 text-[11px] text-fg-muted">
              Delta-neutral funding carry
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[20px] font-semibold leading-none text-accent">
            {top !== null ? `+${top.toFixed(1)}%` : "-"}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
            {ready ? "current spread" : "unavailable"}
          </div>
        </div>
      </div>
    </Link>
  );
}

function FundingCard() {
  // Show the highest currently positive funding rate as the headline
  // metric - that's the "earn this much by going short" preview.
  const symbols = MARKETS.map((m) => m.symbol) as MarketSymbol[];
  const rates = useFundingRates(symbols);
  let topPct: number | null = null;
  for (const sym of symbols) {
    const row = rates[sym];
    const annualPct = row?.annualPct;
    if (
      row?.unstable !== true &&
      typeof annualPct === "number" &&
      Number.isFinite(annualPct)
    ) {
      if (topPct === null || annualPct > topPct) topPct = annualPct;
    }
  }

  return (
    <Link
      href="/desk"
      className="block rounded-klub-lg border border-border-subtle bg-bg-surface p-5 transition-colors hover:border-border hover:bg-bg-elevated"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <IconFunding />
          </div>
          <div>
            <div className="text-[15px] font-semibold text-fg-primary">
              Funding desk
            </div>
            <div className="mt-0.5 text-[11px] text-fg-muted">
              Per-hour rates across every market
            </div>
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-mono text-[20px] font-semibold leading-none ${
              topPct !== null && topPct > 0 ? "text-pnl-long" : "text-fg-muted"
            }`}
          >
            {topPct !== null
              ? `${topPct >= 0 ? "+" : ""}${topPct.toFixed(1)}%`
              : "-"}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
            current ann.
          </div>
        </div>
      </div>
    </Link>
  );
}

function topBasisCarry(
  symbols: readonly MarketSymbol[],
  rates: ReturnType<typeof useFundingRates>,
): number | null {
  const annuals = symbols
    .map((symbol) =>
      rates[symbol]?.unstable === true ? undefined : rates[symbol]?.annualPct,
    )
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  if (annuals.length < 2) return null;
  return Math.max(...annuals) - Math.min(...annuals);
}

function YieldCard() {
  return (
    <div className="block rounded-klub-lg border border-dashed border-border-subtle bg-bg-surface/40 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-elevated text-fg-muted">
            <IconYield />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <div className="text-[15px] font-semibold text-fg-secondary">
                Managed yield
              </div>
              <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-fg-muted">
                Soon
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-fg-muted">
              Not available yet
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[20px] font-semibold leading-none text-fg-muted">
            -
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
            Soon
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconBasis() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12c2-4 6-4 9 0s7 4 9 0M3 18h18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconFunding() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 17l5-5 4 4 9-9m0 0v6m0-6h-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconYield() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2v3m0 14v3M5 12H2m20 0h-3M5.6 5.6l-2 -2m16.8 16.8l-2 -2M5.6 18.4l-2 2m16.8-16.8l-2 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
