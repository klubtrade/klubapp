import type { ReactNode } from "react";

import type { LiveFunding } from "@/hooks/use-funding-rates";
import type { LivePrice } from "@/hooks/use-tickers";
import { formatUsdc, type BasisVaultSnapshot } from "@/lib/basis-vault/client";
import {
  formatBasisVaultFee,
  type BasisVaultConfig,
} from "@/lib/basis-vault/config";
import { MARKETS, type MarketSymbol } from "@/lib/markets";

export interface BasisOpportunity {
  readonly longSymbol: MarketSymbol;
  readonly shortSymbol: MarketSymbol;
  readonly longAnnualPct: number;
  readonly shortAnnualPct: number;
  readonly netAnnualPct: number;
}

export function VaultReadinessCard({
  connected,
  snapshot,
  snapshotStatus,
  vault,
  walletAddress,
  onConnect,
  onFaucet,
  onRefresh,
  faucetClaiming,
}: {
  readonly connected: boolean;
  readonly snapshot: BasisVaultSnapshot | null;
  readonly snapshotStatus: "idle" | "loading" | "ready" | "error";
  readonly vault: BasisVaultConfig;
  readonly walletAddress: string | null;
  readonly onConnect: () => void;
  readonly onFaucet: () => void;
  readonly onRefresh: () => void;
  readonly faucetClaiming: boolean;
}) {
  return (
    <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-fg-primary">
            Basis vault
          </div>
          <div className="mt-1 text-[11px] text-fg-muted">
            Min ${vault.minDepositUsdc} · instant withdrawals ·{" "}
            {formatBasisVaultFee(vault.performanceFeeBps)} yield fee
          </div>
          <div className="mt-1 text-[11px] text-accent">
            Uses vault mock USDC, separate from Bulk test USDC.
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] ${
            vault.ready
              ? "bg-pnl-long/10 text-pnl-long"
              : "bg-alert-orange/10 text-alert-orange"
          }`}
        >
          {vault.ready ? "Ready" : "Offline"}
        </span>
      </div>
      {vault.ready && !connected && (
        <button
          type="button"
          onClick={onConnect}
          className="btn-primary btn-block mt-4"
        >
          Connect wallet
        </button>
      )}
      {vault.ready && connected && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <VaultMetric
            label="Wallet"
            value={walletAddress ? shorten(walletAddress) : "—"}
          />
          <VaultMetric
            label="Vault mock USDC"
            value={
              snapshotStatus === "loading"
                ? "…"
                : `$${formatUsdc(snapshot?.ownerUsdcBalance ?? 0)}`
            }
          />
          <VaultMetric
            label="Deposited"
            value={`$${formatUsdc(snapshot?.position.depositedUsdc ?? 0)}`}
          />
          <VaultMetric
            label="Earned"
            value={`$${formatUsdc(snapshot?.position.claimableYieldUsdc ?? 0)}`}
          />
          <button
            type="button"
            onClick={onFaucet}
            disabled={
              faucetClaiming || (snapshot?.ownerUsdcBalance ?? 0) >= 1_000
            }
            className="btn-primary md:col-span-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(snapshot?.ownerUsdcBalance ?? 0) >= 1_000
              ? "Vault USDC ready"
              : faucetClaiming
                ? "Claiming…"
                : "Claim 1,000 vault USDC"}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-klub border border-border-subtle px-3 py-2 text-[11px] text-fg-secondary transition-colors hover:border-border md:col-span-2"
          >
            Refresh vault state
          </button>
        </div>
      )}
      {!vault.ready && (
        <div className="mt-4 rounded-klub border border-alert-orange/20 bg-alert-orange/5 p-3 text-[11px] text-fg-secondary">
          Basis Vault is temporarily unavailable. Your funds are unaffected.
        </div>
      )}
    </section>
  );
}

function VaultMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-klub border border-border-subtle bg-bg-base p-3">
      <div className="text-[10px] uppercase tracking-[0.1em] text-fg-muted">
        {label}
      </div>
      <div className="mt-1 font-mono text-[14px] text-fg-primary">{value}</div>
    </div>
  );
}

export function depositButtonLabel({
  ready,
  connected,
  pending,
  amount,
  minDeposit,
  ownerUsdc,
}: {
  readonly ready: boolean;
  readonly connected: boolean;
  readonly pending: boolean;
  readonly amount: number;
  readonly minDeposit: number;
  readonly ownerUsdc: number;
}): string {
  if (!ready) return "Temporarily unavailable";
  if (!connected) return "Connect wallet";
  if (pending) return "Confirming…";
  if (amount < minDeposit) return `Min $${minDeposit}`;
  if (amount > ownerUsdc) return "Need vault USDC";
  return "Deposit";
}

export function buildBasisOpportunities(
  symbols: readonly MarketSymbol[],
  funding: Readonly<Record<string, LiveFunding | undefined>>,
  tickers: Readonly<Record<string, LivePrice | undefined>>,
): readonly BasisOpportunity[] {
  const rows = symbols
    .map((symbol) => ({
      symbol,
      annualPct: funding[symbol]?.annualPct,
      mark: tickers[symbol]?.mark,
    }))
    .filter(
      (row): row is { symbol: MarketSymbol; annualPct: number; mark: number } =>
        typeof row.annualPct === "number" &&
        Number.isFinite(row.annualPct) &&
        typeof row.mark === "number" &&
        Number.isFinite(row.mark) &&
        row.mark > 0,
    );

  const out: BasisOpportunity[] = [];
  for (const long of rows) {
    for (const short of rows) {
      if (long.symbol === short.symbol) continue;
      const netAnnualPct = short.annualPct - long.annualPct;
      if (netAnnualPct <= 0) continue;
      out.push({
        longSymbol: long.symbol,
        shortSymbol: short.symbol,
        longAnnualPct: long.annualPct,
        shortAnnualPct: short.annualPct,
        netAnnualPct,
      });
    }
  }
  return out.sort((a, b) => b.netAnnualPct - a.netAnnualPct);
}

export function LegCard({
  label,
  symbol,
  annualPct,
}: {
  readonly label: "Long" | "Short";
  readonly symbol: MarketSymbol;
  readonly annualPct: number;
}) {
  return (
    <div className="rounded-klub border border-border-subtle bg-bg-base p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-fg-muted">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-semibold text-fg-primary">
        {labelFor(symbol)}
      </div>
      <div className="mt-2 font-mono text-[12px] text-fg-muted">
        funding {annualPct >= 0 ? "+" : ""}
        {annualPct.toFixed(1)}% annual
      </div>
    </div>
  );
}

export function InfoCard({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="rounded-klub border border-border-subtle bg-bg-surface/50 p-4">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.1em] text-fg-secondary">
        {title}
      </div>
      {children}
    </div>
  );
}

export function labelFor(symbol: string): string {
  return (
    MARKETS.find((market) => market.symbol === symbol)?.label ??
    symbol.replace("-USD", "")
  );
}

export function formatPrice(value: number | undefined): string {
  if (!Number.isFinite(value)) return "—";
  const price = value as number;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 100) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function shorten(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
