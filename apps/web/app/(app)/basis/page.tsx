"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useFundingRates } from "@/hooks/use-funding-rates";
import { useTickers } from "@/hooks/use-tickers";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  buildBasisDepositTransaction,
  buildBasisWithdrawTransaction,
  getBasisVaultSnapshot,
  type BasisVaultSnapshot,
} from "@/lib/basis-vault/client";
import {
  initialAmountForAction,
  isValidWithdrawAmount,
  maxWithdrawAmount,
  type BasisVaultAction,
} from "@/lib/basis-vault/actions";
import { getBasisVaultConfig } from "@/lib/basis-vault/config";
import { MARKETS, type MarketSymbol } from "@/lib/markets";
import { useTradingWallet } from "@/lib/trading-wallet";

import {
  buildBasisOpportunities,
  BasisStatusCard,
  depositButtonLabel,
  formatPrice,
  labelFor,
  LegCard,
  VaultReadinessCard,
} from "./basis-ui";

export default function BasisPage() {
  const [action, setAction] = useState<BasisVaultAction>("deposit");
  const [depositAmount, setDepositAmount] = useState(1_000);
  const [withdrawAmount, setWithdrawAmount] = useState(0);
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
  const [faucetClaiming, setFaucetClaiming] = useState(false);
  const [faucetEligible, setFaucetEligible] = useState<boolean | null>(null);
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
  const loadSnapshot = useCallback(async () => {
    if (!wallet.publicKeyBase58 || !vault.ready) {
      setSnapshot(null);
      setFaucetEligible(null);
      setSnapshotStatus("idle");
      return;
    }
    setSnapshotStatus("loading");
    try {
      const next = await getBasisVaultSnapshot(wallet.publicKeyBase58);
      setSnapshot(next);
      const faucetResponse = await authenticatedFetch(
        `/api/basis/faucet?owner=${encodeURIComponent(wallet.publicKeyBase58)}`,
        { cache: "no-store" },
      );
      if (faucetResponse.ok) {
        const faucet = (await faucetResponse.json()) as { eligible?: boolean };
        setFaucetEligible(faucet.eligible === true);
      } else {
        setFaucetEligible(null);
      }
      setSnapshotStatus("ready");
    } catch (err) {
      setSnapshotStatus("error");
      setFaucetEligible(null);
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

  async function claimEarnedProceeds() {
    if (!wallet.publicKeyBase58 || !wallet.signAndSendTransaction) {
      wallet.promptConnect();
      return;
    }
    if (!isValidWithdrawAmount(claimableYield, claimableYield)) return;
    setTxStatus({ kind: "pending", message: "Waiting for wallet…" });
    try {
      const tx = await buildBasisWithdrawTransaction({
        ownerBase58: wallet.publicKeyBase58,
        amountUsdc: claimableYield,
      });
      await wallet.signAndSendTransaction(tx);
      setTxStatus({ kind: "success", message: "Earned proceeds claimed." });
      await loadSnapshot();
    } catch (err) {
      setTxStatus({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Could not claim proceeds.",
      });
    }
  }

  async function claimVaultUsdc() {
    if (!wallet.publicKeyBase58) {
      wallet.promptConnect();
      return;
    }
    setFaucetClaiming(true);
    setTxStatus({ kind: "pending", message: "Preparing vault USDC…" });
    try {
      const response = await authenticatedFetch("/api/basis/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: wallet.publicKeyBase58 }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Vault faucet is unavailable.");
      }
      setTxStatus({ kind: "success", message: "1,000 vault USDC is ready." });
      setFaucetEligible(false);
      await loadSnapshot();
    } catch (err) {
      setTxStatus({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Vault faucet is unavailable.",
      });
    } finally {
      setFaucetClaiming(false);
    }
  }

  const connected = wallet.connected && wallet.publicKeyBase58 !== null;
  const pending = txStatus.kind === "pending";
  const ownerUsdc = snapshot?.ownerUsdcBalance ?? 0;
  const withdrawable = snapshot?.position.withdrawableUsdc ?? 0;
  const claimableYield = snapshot?.position.claimableYieldUsdc ?? 0;
  const amount = action === "deposit" ? depositAmount : withdrawAmount;
  const depositDisabled =
    !vault.ready ||
    pending ||
    (connected &&
      (amount < vault.minDepositUsdc ||
        amount > ownerUsdc ||
        snapshot?.gasReady !== true));
  const withdrawDisabled =
    !vault.ready ||
    !connected ||
    pending ||
    !isValidWithdrawAmount(withdrawAmount, withdrawable);
  const claimDisabled =
    !vault.ready ||
    !connected ||
    pending ||
    !isValidWithdrawAmount(claimableYield, claimableYield);

  function selectAction(nextAction: BasisVaultAction) {
    setAction(nextAction);
    if (nextAction === "withdraw") {
      setWithdrawAmount(
        initialAmountForAction({
          action: nextAction,
          depositAmount,
          withdrawableUsdc: withdrawable,
        }),
      );
    }
    setTxStatus({ kind: "idle", message: null });
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24 lg:h-screen lg:overflow-y-auto">
      <section className="mx-auto w-full max-w-7xl">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
              Earn
            </div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-fg-primary md:text-[42px]">
              Basis vault
            </h1>
            <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-fg-muted">
              Deposit vault mock USDC. Earn realized strategy credits. Withdraw
              anytime.
            </p>
          </div>
          <Link href="/desk" className="btn-secondary btn-compact w-fit">
            Open Funding Desk
          </Link>
        </header>

        <div className="mt-8 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <VaultReadinessCard
              connected={connected}
              snapshot={snapshot}
              snapshotStatus={snapshotStatus}
              vault={vault}
              walletAddress={wallet.publicKeyBase58}
              onConnect={wallet.promptConnect}
              onFaucet={() => void claimVaultUsdc()}
              onRefresh={() => void loadSnapshot()}
              faucetClaiming={faucetClaiming}
              faucetEligible={faucetEligible}
            />
            <BasisStatusCard />
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_0.9fr]">
            <div className="min-w-0 overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
              <div className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
                Best market spread
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
                  <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <div className="break-all font-mono text-[36px] font-semibold leading-none tracking-[-0.04em] text-pnl-long sm:text-[46px]">
                        +{best.netAnnualPct.toFixed(1)}%
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                        market spread, not vault APR
                      </div>
                    </div>
                    <div className="text-right text-[12px] text-fg-muted">
                      Before fees
                      <br />
                      Deployed strategy only
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-6 rounded-klub border border-border-subtle bg-bg-base p-5 text-[13px] text-fg-muted">
                  Waiting for Bulk funding data…
                </div>
              )}
            </div>

            <div className="min-w-0 overflow-hidden rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
              <div className="grid grid-cols-2 rounded-klub border border-border-subtle bg-bg-base p-1">
                {(["deposit", "withdraw"] as const).map((nextAction) => (
                  <button
                    key={nextAction}
                    type="button"
                    onClick={() => selectAction(nextAction)}
                    className={`rounded-md px-3 py-2 text-[12px] font-medium capitalize transition-colors ${
                      action === nextAction
                        ? "bg-bg-elevated text-fg-primary"
                        : "text-fg-muted hover:text-fg-primary"
                    }`}
                  >
                    {nextAction}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <label className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
                  {action === "deposit" ? "Deposit" : "Withdraw"} · vault USDC
                </label>
                {action === "withdraw" && (
                  <button
                    type="button"
                    onClick={() =>
                      setWithdrawAmount(maxWithdrawAmount(withdrawable))
                    }
                    disabled={withdrawable <= 0}
                    className="text-[11px] font-medium text-accent disabled:text-fg-muted"
                  >
                    Max {formatBasisAmount(withdrawable)}
                  </button>
                )}
              </div>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={50}
                value={amount}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isFinite(next) && next >= 0) {
                    if (action === "deposit") setDepositAmount(next);
                    else setWithdrawAmount(next);
                  }
                }}
                className="mt-3 w-full rounded-klub border border-border bg-bg-base px-4 py-3.5 font-mono text-xl text-fg-primary focus:border-accent focus:outline-none"
              />

              <div className="mt-5 rounded-klub border border-border-subtle bg-bg-base p-4">
                <div className="text-[11px] uppercase tracking-[0.1em] text-fg-muted">
                  Proceeds
                </div>
                <div className="mt-2 text-[16px] font-medium text-fg-primary">
                  {action === "withdraw"
                    ? `${formatBasisAmount(withdrawable)} available now`
                    : `$${formatBasisAmount(claimableYield)} earned`}
                </div>
                <div className="mt-1 text-[11px] text-fg-muted">
                  {action === "withdraw"
                    ? "The 0.10% fee applies only to earned yield."
                    : "Claim becomes active after realized strategy profit is funded on-chain."}
                </div>
              </div>

              {action === "deposit" ? (
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
                    amount: depositAmount,
                    minDeposit: vault.minDepositUsdc,
                    ownerUsdc,
                    gasReady: snapshot?.gasReady === true,
                  })}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void submitWithdraw()}
                  disabled={withdrawDisabled}
                  className={`btn-primary btn-block btn-lg mt-5 ${
                    !withdrawDisabled ? "" : "cursor-not-allowed opacity-50"
                  }`}
                >
                  {!connected
                    ? "Connect wallet"
                    : pending
                      ? "Confirming…"
                      : withdrawable <= 0
                        ? "Nothing to withdraw"
                        : "Withdraw now"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void claimEarnedProceeds()}
                disabled={claimDisabled}
                className={`btn-secondary btn-block mt-3 ${
                  !claimDisabled ? "" : "cursor-not-allowed opacity-50"
                }`}
              >
                {pending
                  ? "Confirming…"
                  : claimableYield > 0
                    ? `Claim $${formatBasisAmount(claimableYield)} earned`
                    : "No earned proceeds yet"}
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
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-klub-lg border border-border-subtle bg-bg-surface">
          <div className="border-b border-border-subtle px-5 py-4">
            <div className="text-[13px] font-medium text-fg-primary">
              Live opportunities
            </div>
            <div className="mt-0.5 text-[11px] text-fg-muted">
              Market spreads only. Vault yield depends on deployed notional and
              realized credits.
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
                  +{opp.netAnnualPct.toFixed(1)}% spread
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function formatBasisAmount(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
