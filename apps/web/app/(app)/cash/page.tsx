"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useActiveAccount } from "@/hooks/use-active-account";
import { useBulkAccount } from "@/hooks/use-bulk-account";
import { useSubAccounts } from "@/hooks/use-sub-accounts";
import type { SubmitOrderResult } from "@/lib/bulk/orders";
import { useTradingWallet } from "@/lib/trading-wallet";
import {
  ActionCircle,
  CreatePotModal,
  FaucetClaimRow,
  IconAdd,
  IconReceive,
  IconSend,
  IconTrade,
  PotEmptyState,
  PotRow,
  ReceiveModal,
  ResultToast,
  SendModal,
  formatUsd,
} from "./_components";

/**
 * /funding — balances, transfers, pots, and funding entry points.
 *
 * Q1 of the NeoBank pivot. Today this page wires:
 *   - Real master account balance (`useBulkAccount`)
 *   - Real sub-accounts list (`useSubAccounts`, v1.0.14 primitive)
 *   - Working "Create pot" flow (`prepareCreateSubAccount` via the
 *     `useCreatePot` hook — agent-wallet-aware, no popup if the
 *     user authorized one)
 *   - Working "Send" flow to any pubkey (`prepareTransfer`). Handle
 *     resolution (`@micah` → pubkey) is a separate slice — the Send
 *     modal accepts pubkeys today and will accept handles once the
 *     handle-resolution endpoint ships.
 *   - Pay-by-link: `?to=<pubkey>&amount=10` opens the Send modal
 *     pre-filled.
 *
 * Phantom-style 4-up action grid: Send / Receive / Add / Trade.
 */

export default function CashPage() {
  return (
    // useSearchParams requires a Suspense boundary at this level for
    // Next 14's static-generation rules. The modals consume params.
    <Suspense fallback={null}>
      <CashPageInner />
    </Suspense>
  );
}

function CashPageInner() {
  const { connected } = useTradingWallet();
  // The view follows the AccountSwitcher: master by default, or whichever
  // pot the user picked. The big balance, action buttons (Send From),
  // and Pots list all reflect this active context.
  const {
    pubkey,
    name: activeName,
    isMaster,
    masterPubkey,
    setActivePubkey,
  } = useActiveAccount();

  const { state, refresh } = useBulkAccount(pubkey);
  // Sub-accounts list always queries the master so users can switch
  // pots even while viewing one.
  const { subAccounts } = useSubAccounts(masterPubkey);

  const equity = state.data?.equityUsd ?? null;
  const free = state.data?.freeMarginUsd ?? null;
  const accountUnavailable = state.data?.unavailable === true;

  const [showCreate, setShowCreate] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [result, setResult] = useState<SubmitOrderResult | null>(null);

  // Pay-by-link: `/funding?to=<pubkey>&amount=10` opens the Send modal
  // pre-filled. Handles (`@micah`) are resolved client-side to pubkeys
  // once the handle endpoint ships; for now we just pass strings
  // through and let the user see the literal value.
  const params = useSearchParams();
  const linkTo = params.get("to");
  const linkAmount = params.get("amount");
  useEffect(() => {
    if (linkTo) setShowSend(true);
  }, [linkTo]);

  function onActionResult(r: SubmitOrderResult) {
    setResult(r);
    if (r.ok) {
      // Bulk settles async — `useBulkAccount` polls every 15s, which
      // is too slow to feel responsive after a Send / Create pot. Run
      // a quick burst of refreshes so the balance updates within
      // seconds of the on-chain settlement.
      refresh();
      const timers = [800, 2_500, 5_000, 10_000].map((ms) =>
        setTimeout(() => refresh(), ms),
      );
      // No cleanup — these timers fire once and the component is
      // typically still mounted. If the user navigates away mid-burst
      // the refreshes are no-ops on the unmounted state.
      void timers;
    }
  }

  const refreshing = state.status === "loading";

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-md">
        {/* Account chip + refresh — kept lightweight; the active account
            label is a nav element (taps to AccountSwitcher behavior in
            future), refresh is a quiet revert action. */}
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-fg-muted">
          <span className="truncate">
            <span className="opacity-60">Viewing · </span>
            <span className={isMaster ? "text-fg-secondary" : "text-accent"}>
              {activeName}
            </span>
          </span>
          <button
            type="button"
            onClick={refresh}
            disabled={!connected || refreshing}
            aria-label="Refresh balance"
            className="shrink-0 transition-colors hover:text-fg-primary disabled:opacity-40"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>

        {/* Hero balance — Revolut-style. The number IS the headline; no
            label cluttering. Available balance reads as caption below. */}
        <section className="mt-8 text-center md:mt-12">
          <div className="font-mono text-[48px] font-semibold leading-none tracking-[-0.02em] text-fg-primary md:text-[64px]">
            {!connected
              ? "$—"
              : equity === null
                ? "$—"
                : `$${formatUsd(equity)}`}
          </div>
          <div className="mt-3 text-[12px] text-fg-muted">
            {!connected
              ? "Connect a wallet to see your balance"
              : accountUnavailable
                ? "Bulk account data is temporarily unavailable"
                : free !== null
                  ? `$${formatUsd(free)} available`
                  : "Loading…"}
          </div>
        </section>

        {accountUnavailable && (
          <div className="mt-6 rounded-klub border border-alert-orange/30 bg-alert-orange/5 px-4 py-3 text-[12px] leading-relaxed text-alert-orange">
            {state.data?.warning ??
              "Bulk exchange is temporarily unavailable. Please try again in a few minutes."}
          </div>
        )}

        {/* Icon-circle actions — Phantom/Revolut/Venmo pattern. Big tap
            targets, recognizable iconography, label below. */}
        <section className="mt-10 grid grid-cols-4 gap-3">
          <ActionCircle
            label="Send"
            disabled={!connected}
            onClick={() => setShowSend(true)}
            icon={<IconSend />}
          />
          <ActionCircle
            label="Receive"
            disabled={!connected}
            onClick={() => setShowReceive(true)}
            icon={<IconReceive />}
          />
          <ActionCircle label="Add" href="/funding/add" icon={<IconAdd />} />
          <ActionCircle label="Trade" href="/trade" icon={<IconTrade />} />
        </section>

        {/* Faucet — testnet utility, demoted to a thin row below the
            primary actions so it doesn't compete for attention. */}
        <FaucetClaimRow
          pubkey={pubkey}
          connected={connected}
          label={activeName}
          isMaster={isMaster}
          onResult={onActionResult}
        />

        {/* Pots — Revolut "Vaults" style. Card per pot, big touch target,
            active state highlighted. Header above with count. */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold tracking-tight">Pots</h2>
            {subAccounts.length > 0 && (
              <span className="text-[10px] uppercase tracking-[0.12em] text-fg-muted">
                {subAccounts.length} on-chain
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
            Isolate strategies, copy-trade pools, or shared funds.
          </p>

          <div className="mt-4 space-y-2">
            {subAccounts.length === 0 ? (
              <PotEmptyState connected={connected} />
            ) : (
              subAccounts.map((sa) => (
                <PotRow
                  key={sa.pubkey}
                  pubkey={sa.pubkey}
                  name={sa.name}
                  active={pubkey === sa.pubkey}
                  onUse={() => setActivePubkey(sa.pubkey)}
                />
              ))
            )}
            {!isMaster && masterPubkey && (
              <button
                type="button"
                onClick={() => setActivePubkey(null)}
                className="w-full rounded-klub border border-border-subtle bg-bg-surface/40 px-3 py-2.5 text-[11px] text-fg-muted transition-colors hover:text-fg-primary"
              >
                ← Switch back to Master
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              disabled={!connected}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-klub border border-dashed border-border-subtle bg-transparent py-3 text-[12px] text-fg-muted transition-colors hover:border-border hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden className="text-[14px] leading-none">
                +
              </span>
              <span>Create pot</span>
            </button>
          </div>
        </section>

        {/* Activity — empty state styled to feel like a placeholder, not
            a broken section. Real feed lands when handle-transfer ships. */}
        <section className="mt-10">
          <h2 className="text-[15px] font-semibold tracking-tight">Activity</h2>
          <div className="mt-3 rounded-klub-lg border border-border-subtle bg-bg-surface/40 px-5 py-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-bg-elevated text-fg-muted">
              <svg
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden
              >
                <path
                  d="M3 10h14M10 3v14"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="mt-3 text-[12px] text-fg-secondary">
              No activity yet
            </div>
            <div className="mt-1 text-[11px] text-fg-muted">
              Sends and receives appear here once handle transfers ship.
            </div>
          </div>
        </section>

        <footer className="mt-10 rounded-klub border border-border-subtle bg-bg-surface/40 p-4 text-[11px] text-fg-muted">
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
            Q1 — building
          </div>
          <ul className="mt-1.5 space-y-1 leading-relaxed">
            <li>· Send + receive by handle (klub.app/pay/@you)</li>
            <li>· Multisig pots for leaders running shared capital</li>
            <li>· Yield on idle balance</li>
          </ul>
        </footer>
      </div>

      {showCreate && (
        <CreatePotModal
          onClose={() => setShowCreate(false)}
          onResult={(r) => {
            onActionResult(r);
            if (r.ok) setShowCreate(false);
          }}
        />
      )}

      {showSend && pubkey && masterPubkey && (
        <SendModal
          masterPubkey={masterPubkey}
          subAccounts={subAccounts}
          initialFrom={pubkey}
          initialTo={linkTo ?? ""}
          initialAmount={linkAmount ?? ""}
          onClose={() => setShowSend(false)}
          onResult={(r) => {
            onActionResult(r);
            if (r.ok) setShowSend(false);
          }}
        />
      )}

      {showReceive && pubkey && (
        <ReceiveModal
          pubkey={pubkey}
          label={activeName}
          onClose={() => setShowReceive(false)}
        />
      )}

      {result && (
        <ResultToast result={result} onClose={() => setResult(null)} />
      )}
    </main>
  );
}
