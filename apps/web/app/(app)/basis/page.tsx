"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useFundingRates } from "@/hooks/use-funding-rates";
import { useTickers } from "@/hooks/use-tickers";
import {
  buildBasisDepositTransaction,
  buildBasisWithdrawTransaction,
  getBasisVaultSnapshot,
  type BasisVaultSnapshot,
} from "@/lib/basis-vault/client";
import {
  formatBasisVaultFee,
  getBasisVaultConfig,
} from "@/lib/basis-vault/config";
import { MARKETS, type MarketSymbol } from "@/lib/markets";
import { useTradingWallet } from "@/lib/trading-wallet";

import {
  buildBasisOpportunities,
  depositButtonLabel,
  formatPrice,
  InfoCard,
  labelFor,
  LegCard,
  VaultReadinessCard,
} from "./basis-ui";

export default function BasisPage() {
  const [amount, setAmount] = useState(1_000);
  const [snapshot, setSnapshot] = useState<BasisVaultSnapshot | null>(null);
  const [snapshotStatus, setSnapshotStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [txStatus, setTxStatus] = useState<
    | { readonly kind: "idle"; readonly message: null }
    | { readonly kind: "pending"; readonly message: string }
    | { readonly kind: "success"; readonly message: string }
    | { readonly kind: "error"; readonly message: string }
  >({ kind: "idle", message: null });
  const vault = getBasisVaultConfig();
  const wallet = useTradingWallet();
  const symbols = useMemo<readonly MarketSymbol[]>(
    () => MARKETS.map((m) => m.symbol),
    [],
  );
  const funding = useFundingRates(symbols);
  const tickers = useTickers(symbols);
  const opportunities = useMemo(
    () => buildBasisOpportunities(symbols, funding, tickers),
    [funding, symbols, tickers],
  );
  const best = opportunities[0] ?? null;
  const projected = best ? (amount * best.netAnnualPct) / 100 : 0;
  const loadSnapshot = useCallback(async () => {
    if (!wallet.publicKeyBase58 || !vault.ready) {
      setSnapshot(null);
      setSnapshotStatus("idle");
      return;
    }
    setSnapshotStatus("loading");
    try {
      const next = await getBasisVaultSnapshot(wallet.publicKeyBase58);
      setSnapshot(next);
      setSnapshotStatus("ready");
    } catch (err) {
      setSnapshotStatus("error");
      setTxStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not load Basis vault state.",
      });
    }
  }, [vault.ready, wallet.publicKeyBase58]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  async function submitDeposit() {
    if (!wallet.publicKeyBase58 || !wallet.signAndSendTransaction) {
      wallet.promptConnect();
      return;
    }
    setTxStatus({ kind: "pending", message: "Waiting for wallet…" });
    try {
      const tx = await buildBasisDepositTransaction({
        ownerBase58: wallet.publicKeyBase58,
        amountUsdc: amount,
        positionExists: snapshot?.position.exists === true,
      });
      await wallet.signAndSendTransaction(tx);
      setTxStatus({ kind: "success", message: "Deposit sent." });
      await loadSnapshot();
    } catch (err) {
      setTxStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Deposit failed.",
      });
    }
  }

  async function submitWithdraw() {
    if (!wallet.publicKeyBase58 || !wallet.signAndSendTransaction) {
      wallet.promptConnect();
      return;
    }
    setTxStatus({ kind: "pending", message: "Waiting for wallet…" });
    try {
      const tx = await buildBasisWithdrawTransaction({
        ownerBase58: wallet.publicKeyBase58,
        amountUsdc: amount,
      });
      await wallet.signAndSendTransaction(tx);
      setTxStatus({ kind: "success", message: "Withdrawal sent." });
      await loadSnapshot();
    } catch (err) {
      setTxStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Withdrawal failed.",
      });
    }
  }

  const connected = wallet.connected && wallet.publicKeyBase58 !== null;
  const pending = txStatus.kind === "pending";
  const ownerUsdc = snapshot?.ownerUsdcBalance ?? 0;
  const withdrawable = snapshot?.position.withdrawableUsdc ?? 0;
  const depositDisabled =
    !vault.ready ||
    pending ||
    (connected && (amount < vault.minDepositUsdc || amount > ownerUsdc));
  const withdrawDisabled =
    !vault.ready ||
    !connected ||
    pending ||
    amount <= 0 ||
    amount > withdrawable;

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-2xl">
        <header>
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
            Basis trade
          </div>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-fg-primary md:text-[42px]">
            Capture funding without picking direction.
          </h1>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-fg-muted">
            KLUB scans Bulk funding and builds a neutral long/short plan.
          </p>
        </header>

        <div className="mt-8 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
            <div className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
              Best current carry
            </div>
            {best ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <LegCard
                    label="Long"
                    symbol={best.longSymbol}
                    annualPct={best.longAnnualPct}
                  />
                  <LegCard
                    label="Short"
                    symbol={best.shortSymbol}
                    annualPct={best.shortAnnualPct}
                  />
                </div>
                <div className="mt-6 flex items-end justify-between gap-4">
                  <div>
                    <div className="font-mono text-[46px] font-semibold leading-none tracking-[-0.04em] text-pnl-long">
                      +{best.netAnnualPct.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                      net annualized carry
                    </div>
                  </div>
                  <div className="text-right text-[12px] text-fg-muted">
                    Equal notional
                    <br />
                    1× planner
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-6 rounded-klub border border-border-subtle bg-bg-base p-5 text-[13px] text-fg-muted">
                Waiting for Bulk funding data…
              </div>
            )}
          </div>

          <div className="rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
            <label className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
              Vault amount · mock USDC
            </label>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={50}
              value={amount}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next) && next >= 0) setAmount(next);
              }}
              className="mt-3 w-full rounded-klub border border-border bg-bg-base px-4 py-3.5 font-mono text-xl text-fg-primary focus:border-accent focus:outline-none"
            />

            <div className="mt-5 rounded-klub border border-border-subtle bg-bg-base p-4">
              <div className="text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                Projected carry
              </div>
              <div className="mt-2 font-mono text-[28px] font-semibold text-pnl-long">
                {best ? `+$${projected.toFixed(0)}` : "—"}
              </div>
              <div className="mt-1 text-[11px] text-fg-muted">
                before slippage, fees, liquidation risk, and funding flips
              </div>
            </div>

            <button
              type="button"
              onClick={() => void submitDeposit()}
              disabled={depositDisabled}
              className={`btn-primary btn-block btn-lg mt-5 ${
                !depositDisabled ? "" : "cursor-not-allowed opacity-50"
              }`}
            >
              {depositButtonLabel({
                ready: vault.ready,
                connected,
                pending,
                amount,
                minDeposit: vault.minDepositUsdc,
                ownerUsdc,
              })}
            </button>
            <button
              type="button"
              onClick={() => void submitWithdraw()}
              disabled={withdrawDisabled}
              className={`btn-secondary btn-block mt-3 ${
                !withdrawDisabled ? "" : "cursor-not-allowed opacity-50"
              }`}
            >
              Withdraw
            </button>
            {txStatus.message && (
              <div
                className={`mt-3 rounded-klub border px-3 py-2 text-[11px] ${
                  txStatus.kind === "error"
                    ? "border-pnl-short/30 bg-pnl-short/5 text-pnl-short"
                    : txStatus.kind === "success"
                      ? "border-pnl-long/30 bg-pnl-long/5 text-pnl-long"
                      : "border-border-subtle bg-bg-base text-fg-muted"
                }`}
              >
                {txStatus.message}
              </div>
            )}
            <Link
              href="/desk"
              className="mt-3 block text-center text-[12px] text-fg-muted transition-colors hover:text-fg-primary"
            >
              Open Funding Desk
            </Link>
          </div>
        </div>

        <VaultReadinessCard
          connected={connected}
          snapshot={snapshot}
          snapshotStatus={snapshotStatus}
          vault={vault}
          walletAddress={wallet.publicKeyBase58}
          onConnect={wallet.promptConnect}
          onRefresh={() => void loadSnapshot()}
        />

        <div className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface">
          <div className="border-b border-border-subtle px-5 py-4">
            <div className="text-[13px] font-medium text-fg-primary">
              Live opportunities
            </div>
            <div className="mt-0.5 text-[11px] text-fg-muted">
              Ranked by short funding minus long funding.
            </div>
          </div>
          <ul className="divide-y divide-border-subtle">
            {opportunities.slice(0, 6).map((opp) => (
              <li
                key={`${opp.longSymbol}-${opp.shortSymbol}`}
                className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="text-[13px] text-fg-primary">
                    Long {labelFor(opp.longSymbol)} · Short{" "}
                    {labelFor(opp.shortSymbol)}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-fg-muted">
                    {formatPrice(tickers[opp.longSymbol]?.mark)} /{" "}
                    {formatPrice(tickers[opp.shortSymbol]?.mark)}
                  </div>
                </div>
                <div className="text-right font-mono text-[13px] text-pnl-long">
                  +{opp.netAnnualPct.toFixed(1)}%
                </div>
              </li>
            ))}
          </ul>
        </div>

        <section className="mt-8 grid gap-3 text-[12px] leading-relaxed text-fg-muted md:grid-cols-3">
          <InfoCard title="Strategy">Delta-neutral funding carry.</InfoCard>
          <InfoCard title="Withdrawals">Instant from vault liquidity.</InfoCard>
          <InfoCard title="Fee">
            {formatBasisVaultFee(vault.performanceFeeBps)} on earned yield only.
          </InfoCard>
        </section>
      </section>
    </main>
  );
}
