"use client";

import { useBulkFaucet } from "@/hooks/use-bulk-faucet";
import type { SubmitOrderResult } from "@/lib/bulk/orders";

// =============================================================================
// Pot row - card style
// =============================================================================

export function PotRow({
  pubkey,
  name,
  active,
  onUse,
}: {
  readonly pubkey: string;
  readonly name: string | null;
  readonly active: boolean;
  readonly onUse: () => void;
}) {
  const initials = (name ?? "P").slice(0, 2).toUpperCase();
  return (
    <button
      type="button"
      onClick={onUse}
      className={`flex w-full items-center gap-3 rounded-klub-lg border px-3.5 py-3 text-left transition-all ${
        active
          ? "border-accent/50 bg-accent/10"
          : "border-border-subtle bg-bg-surface hover:border-border hover:bg-bg-elevated"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold ${
          active
            ? "bg-accent/30 text-accent"
            : "bg-bg-elevated text-fg-secondary"
        }`}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[14px] font-medium ${
            active ? "text-accent" : "text-fg-primary"
          }`}
        >
          {name ?? "Untitled pot"}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-fg-muted">
          {pubkey.slice(0, 8)}…{pubkey.slice(-6)}
        </div>
      </div>
      <span
        className={`shrink-0 text-[10px] uppercase tracking-[0.1em] ${
          active ? "text-accent" : "text-fg-muted"
        }`}
      >
        {active ? "active" : "use"}
      </span>
    </button>
  );
}

export function PotEmptyState({ connected }: { readonly connected: boolean }) {
  return (
    <div className="rounded-klub border border-dashed border-border-subtle bg-bg-surface/40 px-4 py-5 text-center text-[11px] text-fg-muted">
      {connected
        ? "No pots yet. Split your account by strategy."
        : "Connect a wallet to see your pots."}
    </div>
  );
}

// =============================================================================
// Faucet claim row
// =============================================================================

export function FaucetClaimRow({
  pubkey,
  connected,
  label,
  isMaster,
  onResult,
}: {
  readonly pubkey: string | null;
  readonly connected: boolean;
  readonly label: string;
  readonly isMaster: boolean;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const { claim, state, usingAgent } = useBulkFaucet({ account: pubkey });
  const claiming = state.status === "claiming";
  const target = isMaster ? "Master" : label;

  async function onClick() {
    const r = await claim();
    onResult(r);
  }

  return (
    <button
      type="button"
      onClick={() => {
        void onClick();
      }}
      disabled={!connected || !pubkey || claiming}
      className="mt-8 flex w-full items-center justify-between gap-3 rounded-klub border border-border-subtle bg-bg-surface/40 px-3.5 py-2.5 text-left text-[11px] transition-colors hover:bg-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="min-w-0 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-fg-muted">
          Testnet
        </span>
        <span className="text-fg-secondary">
          {claiming
            ? usingAgent
              ? `Claiming for ${target}…`
              : `Sign to claim for ${target}…`
            : `Claim 1,000 mockUSDC → ${target}`}
        </span>
      </div>
      <span className="shrink-0 text-accent">{claiming ? "…" : "Claim"}</span>
    </button>
  );
}
