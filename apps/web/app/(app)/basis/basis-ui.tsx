import { useEffect, useState, type ReactNode } from "react";

import { formatUsdc, type BasisVaultSnapshot } from "@/lib/basis-vault/client";
import {
  formatBasisVaultFee,
  type BasisVaultConfig,
} from "@/lib/basis-vault/config";
export {
  buildBasisOpportunities,
  type BasisOpportunity,
} from "@/lib/basis-vault/opportunities";
import { MARKETS, type MarketSymbol } from "@/lib/markets";

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
  faucetEligible,
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
  readonly faucetEligible: boolean | null;
}) {
  const fundsReady =
    (snapshot?.ownerUsdcBalance ?? 0) >= 1_000 && snapshot?.gasReady === true;
  return (
    <section className="mt-8 min-w-0 overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
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
          className="btn-primary btn-compact mt-4"
        >
          Connect wallet
        </button>
      )}
      {vault.ready && connected && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <VaultMetric
            label="Wallet"
            value={walletAddress ? shorten(walletAddress) : "-"}
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
            disabled={faucetClaiming || fundsReady || faucetEligible !== true}
            className="btn-primary md:col-span-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {fundsReady
              ? "Vault funds ready"
              : faucetClaiming
                ? "Claiming…"
                : faucetEligible === false
                  ? "Already claimed"
                  : faucetEligible === null
                    ? "Checking faucet…"
                    : (snapshot?.ownerUsdcBalance ?? 0) >= 1_000
                      ? "Prepare deposit gas"
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

interface BasisStatusResponse {
  readonly ok: boolean;
  readonly status: string;
  readonly message?: string;
  readonly strategy?: {
    readonly paused: boolean;
    readonly pauseReason: string | null;
    readonly consecutiveErrors: number;
    readonly lastEquityUsd: number;
    readonly lastReconciledAt: string | null;
  } | null;
  readonly latestRun?: {
    readonly state: string;
    readonly longSymbol: string;
    readonly shortSymbol: string;
    readonly expectedAnnualPct: number;
    readonly error: string | null;
    readonly updatedAt: string;
  } | null;
  readonly operator?: {
    readonly sourceProfitUsdc: number;
    readonly creditedUsdc: number;
    readonly availableProfitUsdc: number;
    readonly updatedAt: string;
  } | null;
  readonly credits?: {
    readonly latestError: string | null;
  };
}

export function BasisStatusCard() {
  const [status, setStatus] = useState<BasisStatusResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const response = await fetch("/api/basis/status", {
          cache: "no-store",
        });
        const payload = (await response.json()) as BasisStatusResponse;
        if (alive) setStatus(payload);
      } catch (error) {
        if (alive) {
          setStatus({
            ok: false,
            status: "error",
            message:
              error instanceof Error ? error.message : "Status unavailable.",
          });
        }
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const label = status ? basisStatusLabel(status) : "Loading Basis status…";
  const tone = statusTone(status?.status);

  return (
    <section className="rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-fg-primary">
            Strategy status
          </div>
          <div className={`mt-1 text-[11px] ${tone}`}>{label}</div>
        </div>
        <span className="rounded-full border border-border-subtle px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-fg-muted">
          Live
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <VaultMetric
          label="Bulk equity"
          value={`$${formatUsdc(status?.strategy?.lastEquityUsd ?? 0)}`}
        />
        <VaultMetric
          label="Source profit"
          value={`$${formatUsdc(status?.operator?.sourceProfitUsdc ?? 0)}`}
        />
        <VaultMetric
          label="Credited"
          value={`$${formatUsdc(status?.operator?.creditedUsdc ?? 0)}`}
        />
      </div>
      {status?.latestRun && (
        <div className="mt-3 rounded-klub border border-border-subtle bg-bg-base p-3 text-[11px] text-fg-muted">
          Run: {status.latestRun.state} · Long {status.latestRun.longSymbol} ·
          Short {status.latestRun.shortSymbol}
        </div>
      )}
    </section>
  );
}

function basisStatusLabel(status: BasisStatusResponse): string {
  if (!status.ok) return status.message ?? "Basis status unavailable.";
  if (status.status === "strategy_paused") {
    return status.strategy?.pauseReason ?? "Strategy is paused.";
  }
  if (status.status === "operator_not_seen") {
    return "Yield operator has not reported yet.";
  }
  if (status.status === "strategy_not_seen") {
    return "Strategy worker has not opened a run yet.";
  }
  if (status.status === "credit_error") {
    return status.credits?.latestError ?? "Latest yield credit failed.";
  }
  if (status.status === "waiting_for_profit") {
    return "No realized or funding profit has been produced yet.";
  }
  if (status.status === "waiting_for_credit") {
    return "Profit detected. Waiting for on-chain credit.";
  }
  return "Yield credits are active.";
}

function statusTone(status?: string): string {
  if (status === "crediting") return "text-pnl-long";
  if (status === "waiting_for_profit" || status === "waiting_for_credit") {
    return "text-accent";
  }
  return "text-alert-orange";
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
  gasReady,
}: {
  readonly ready: boolean;
  readonly connected: boolean;
  readonly pending: boolean;
  readonly amount: number;
  readonly minDeposit: number;
  readonly ownerUsdc: number;
  readonly gasReady: boolean;
}): string {
  if (!ready) return "Temporarily unavailable";
  if (!connected) return "Connect wallet";
  if (pending) return "Confirming…";
  if (amount < minDeposit) return `Min $${minDeposit}`;
  if (amount > ownerUsdc) return "Need vault USDC";
  if (!gasReady) return "Prepare deposit gas";
  return "Deposit";
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
    <div className="min-w-0 rounded-klub border border-border-subtle bg-bg-base p-4">
      <div className="text-[10px] uppercase tracking-[0.12em] text-fg-muted">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-semibold text-fg-primary">
        {labelFor(symbol)}
      </div>
      <div className="mt-2 break-words font-mono text-[12px] text-fg-muted">
        current {annualPct >= 0 ? "+" : ""}
        {annualPct.toFixed(1)}% ann.
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
  if (!Number.isFinite(value)) return "-";
  const price = value as number;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price < 100) return `$${price.toFixed(2)}`;
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function shorten(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
