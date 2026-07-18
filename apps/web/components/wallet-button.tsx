"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";

import { AgentWalletPrompt } from "@/components/agent-wallet-prompt";
import { useAgentWallet } from "@/hooks/use-agent-wallet";
import { useBulkAccount } from "@/hooks/use-bulk-account";
import { useBulkFaucet } from "@/hooks/use-bulk-faucet";
import { useTradingWallet } from "@/lib/trading-wallet";

export function WalletButton({
  variant = "primary",
  size = "sm",
}: {
  readonly variant?: "primary" | "secondary";
  readonly size?: "sm" | "md" | "lg";
}) {
  const wallet = useTradingWallet();
  return (
    <ConnectedShell
      mounted={wallet.ready}
      variant={variant}
      size={size}
      connected={wallet.connected}
      address={wallet.publicKeyBase58}
      onConnect={wallet.promptConnect}
      onDisconnect={() => void wallet.disconnect()}
    />
  );
}

function ConnectedShell({
  mounted,
  variant,
  size,
  connected,
  address,
  onConnect,
  onDisconnect,
}: {
  readonly mounted: boolean;
  readonly variant: "primary" | "secondary";
  readonly size: "sm" | "md" | "lg";
  readonly connected: boolean;
  readonly address: string | null;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const { state: accountState, refresh } = useBulkAccount(address);

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const t = setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocMouse(e: MouseEvent) {
      if (!menuRef.current) return;
      if (e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("mousedown", onDocMouse);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDocMouse);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!mounted) {
    return (
      <button disabled className={btnClass(variant, size)}>
        Connect
      </button>
    );
  }

  if (!connected) {
    return (
      <button
        type="button"
        onClick={onConnect}
        className={btnClass(variant, size)}
      >
        Connect
      </button>
    );
  }

  const balance = accountState.data?.equityUsd ?? null;
  const accountUnavailable = accountState.data?.unavailable === true;
  const balanceLabel = accountUnavailable
    ? "Bulk -"
    : formatBalancePill(balance, accountState.status);

  function handleCopy() {
    if (!address) return;
    navigator.clipboard
      .writeText(address)
      .then(() => {
        setCopied(true);
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.debug("[wallet-button] clipboard write failed:", err);
      });
  }

  function handleDisconnect() {
    setMenuOpen(false);
    onDisconnect();
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setMenuOpen((v) => !v);
        }}
        className={`${btnClass("secondary", size)} font-mono`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-pnl-long" aria-hidden />
        <span className="text-fg-primary">{shorten(address ?? "")}</span>
        <span aria-hidden className="mx-1 h-3 w-px bg-border-default" />
        <span className="text-fg-secondary">{balanceLabel}</span>
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-klub border border-border bg-bg-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
        >
          {/* Address block */}
          <div className="rounded-klub border border-border-subtle bg-bg-base p-2.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
              Wallet address
            </div>
            <div className="mt-1 break-all font-mono text-[11px] text-fg-primary">
              {address}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className={`mt-2 text-[11px] transition-colors ${
                copied ? "text-pnl-long" : "text-accent hover:opacity-80"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {copied ? (
                  <Check size={12} strokeWidth={2} aria-hidden />
                ) : (
                  <Copy size={12} strokeWidth={1.8} aria-hidden />
                )}
                {copied ? "Copied" : "Copy address"}
              </span>
            </button>
          </div>

          {/* Balance block */}
          <div className="mt-3 rounded-klub border border-border-subtle bg-bg-base p-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
                Account equity
              </div>
              <button
                type="button"
                onClick={refresh}
                aria-label="Refresh balance"
                className="text-[10px] text-fg-muted transition-colors hover:text-fg-primary"
              >
                <RefreshCw
                  size={12}
                  strokeWidth={1.8}
                  aria-hidden
                  className={
                    accountState.status === "loading" ? "animate-spin" : ""
                  }
                />
              </button>
            </div>
            <div className="mt-1 font-mono text-[18px] font-semibold text-fg-primary">
              {balance !== null
                ? `$${formatUsd(balance)}`
                : accountUnavailable || accountState.status === "error"
                  ? "-"
                  : "…"}
            </div>
            {accountState.data && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.06em] text-fg-muted">
                    Free margin
                  </div>
                  <div className="font-mono text-fg-secondary">
                    {accountState.data.freeMarginUsd !== null
                      ? `$${formatUsd(accountState.data.freeMarginUsd)}`
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.06em] text-fg-muted">
                    Unrealized
                  </div>
                  <div
                    className={`font-mono ${
                      accountState.data.unrealizedPnlUsd === null
                        ? "text-fg-secondary"
                        : accountState.data.unrealizedPnlUsd >= 0
                          ? "text-pnl-long"
                          : "text-pnl-short"
                    }`}
                  >
                    {accountState.data.unrealizedPnlUsd !== null
                      ? `${accountState.data.unrealizedPnlUsd >= 0 ? "+" : ""}$${formatUsd(
                          Math.abs(accountState.data.unrealizedPnlUsd),
                        )}`
                      : "-"}
                  </div>
                </div>
              </div>
            )}
            {((accountUnavailable && accountState.data?.warning) ||
              (accountState.status === "error" && accountState.error)) && (
              <div className="mt-2 text-[10px] text-alert-orange">
                {accountState.data?.warning ?? accountState.error}
              </div>
            )}
          </div>

          <FaucetRow onClaimSuccess={refresh} />

          <AgentWalletRow onOpenPrompt={() => setPromptOpen(true)} />

          <button
            type="button"
            onClick={handleDisconnect}
            className="mt-3 w-full rounded-klub border border-border-subtle bg-transparent py-2 text-[12px] text-fg-secondary transition-colors hover:border-pnl-short hover:text-pnl-short"
          >
            Disconnect
          </button>
        </div>
      )}

      <AgentWalletPrompt
        open={promptOpen}
        onClose={() => {
          setPromptOpen(false);
        }}
      />
    </div>
  );
}

function btnClass(
  variant: "primary" | "secondary",
  size: "sm" | "md" | "lg",
): string {
  const base = variant === "primary" ? "btn-primary" : "btn-secondary";
  const sz = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  return `${base} ${sz}`.trim();
}

function shorten(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatBalancePill(balance: number | null, status: string): string {
  if (balance === null) {
    return status === "loading" ? "…" : status === "error" ? "balance -" : "";
  }
  if (balance >= 1000) {
    return `$${(balance / 1000).toFixed(balance >= 10_000 ? 0 : 1)}k`;
  }
  return `$${balance.toFixed(0)}`;
}

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function FaucetRow({
  onClaimSuccess,
}: {
  readonly onClaimSuccess: () => void;
}) {
  const { state, claim, reset, usingAgent } = useBulkFaucet();

  useEffect(() => {
    if (state.status === "success") {
      onClaimSuccess();
      const t = setTimeout(reset, 3000);
      return () => clearTimeout(t);
    }
    if (state.status === "error") {
      const t = setTimeout(reset, 6000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state.status, onClaimSuccess, reset]);

  if (state.status === "success") {
    return (
      <div className="mt-3 rounded-klub border border-pnl-long/30 bg-pnl-long/5 p-2.5">
        <div className="text-[10px] uppercase tracking-[0.08em] text-pnl-long">
          Testnet faucet
        </div>
        <div className="mt-0.5 text-[11px] text-fg-secondary">
          <span className="inline-flex items-center gap-1.5">
            <Check size={12} strokeWidth={2} aria-hidden />
            Claimed. Balance updating…
          </span>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mt-3 rounded-klub border border-pnl-short/30 bg-pnl-short/5 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.08em] text-pnl-short">
              Testnet faucet
            </div>
            <div className="mt-0.5 break-words text-[11px] text-fg-secondary">
              {state.result.message}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void claim();
            }}
            className="shrink-0 text-[11px] text-accent transition-opacity hover:opacity-80"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const claiming = state.status === "claiming";

  return (
    <div className="mt-3 rounded-klub border border-border-subtle bg-bg-base p-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
            Testnet faucet
          </div>
          <div className="mt-0.5 text-[11px] text-fg-secondary">
            {claiming
              ? usingAgent
                ? "Signing silently…"
                : "Waiting for wallet…"
              : usingAgent
                ? "Silent claim"
                : "1,000 mockUSDC · 72h reset"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void claim();
          }}
          disabled={claiming}
          className="text-[12px] text-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {claiming ? "…" : "Claim"}
        </button>
      </div>
    </div>
  );
}

function AgentWalletRow({
  onOpenPrompt,
}: {
  readonly onOpenPrompt: () => void;
}) {
  const { agent, pending, revoke, creationEnabled } = useAgentWallet();
  const [confirming, setConfirming] = useState(false);

  async function handleRevoke() {
    setConfirming(false);
    await revoke();
  }

  if (!agent) {
    return (
      <div className="mt-3 rounded-klub border border-border-subtle bg-bg-base p-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted">
              Fast trading
            </div>
            <div className="mt-0.5 text-[11px] text-fg-secondary">
              {creationEnabled ? "Off" : "Secure wallet signing"}
            </div>
          </div>
          {creationEnabled && (
            <button
              type="button"
              onClick={onOpenPrompt}
              className="text-[12px] text-accent transition-opacity hover:opacity-80"
            >
              Enable
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-klub border border-pnl-long/30 bg-pnl-long/5 p-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-pnl-long">
            Fast trading · on
          </div>
          <div className="mt-0.5 text-[11px] text-fg-secondary">
            since {formatAuthorizedAt(agent.authorizedAt)}
          </div>
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
            }}
            disabled={pending}
            className="text-[12px] text-fg-muted transition-colors hover:text-pnl-short disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Revoking…" : "Revoke"}
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
              }}
              className="rounded-klub border border-border-subtle px-2 py-0.5 text-[10px] text-fg-secondary transition-colors hover:border-border"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              className="rounded-klub bg-pnl-short/20 px-2 py-0.5 text-[10px] font-medium text-pnl-short transition-colors hover:bg-pnl-short/30"
            >
              Yes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatAuthorizedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "recently";
  }
}
