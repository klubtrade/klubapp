'use client';

import { useEffect, useState } from 'react';

import { useAgentWallet } from '@/hooks/use-agent-wallet';

/**
 * <AgentWalletPrompt /> - modal that explains the agent-wallet
 * tradeoff and guides a user through one-time authorization.
 *
 * When to mount:
 *   - When the user is connected, has no agent, and tries to trade.
 *   - When the user explicitly clicks "Enable fast trading" in the
 *     wallet dropdown.
 *
 * Copy principles:
 *   - Honest about the tradeoff: agent can place & cancel orders
 *     on your behalf without popups, but CANNOT withdraw funds.
 *   - No jargon: "one wallet approval", not "ed25519 authorization".
 *   - No scare quotes: this is a standard pattern on every DEX
 *     running agent wallets (Hyperliquid does it, dYdX does it).
 */

export function AgentWalletPrompt({
  open,
  onClose,
  onAuthorized,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAuthorized?: () => void;
}) {
  const { authorize, pending, lastResult } = useAgentWallet();
  // Local state - we track outcome UI separately from the hook's
  // `lastResult` because the hook's result persists across multiple
  // prompt openings and we want a fresh slate each time.
  const [localResult, setLocalResult] = useState<typeof lastResult>(null);

  useEffect(() => {
    if (open) setLocalResult(null);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose();
    }
    if (!open) return;
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, pending, onClose]);

  if (!open) return null;

  async function handleAuthorize() {
    const result = await authorize();
    setLocalResult(result);
    if (result.ok) {
      // Slight delay so the user sees the success state before the
      // modal closes - feels less abrupt than an instant dismiss.
      setTimeout(() => {
        onAuthorized?.();
        onClose();
      }, 900);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-klub-lg border border-border bg-bg-surface p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {localResult?.ok ? (
          <SuccessView onClose={onClose} />
        ) : (
          <>
            <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Fast trading
            </div>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-fg-primary">
              Trade without wallet popups
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-secondary">
              Approve once, and we&rsquo;ll handle signing for every trade after
              that - no more wallets popups, orders land instantly.
            </p>

            <ul className="mt-5 space-y-3 text-[12px] leading-relaxed">
              <BulletOk>Place & cancel orders without a popup each time</BulletOk>
              <BulletOk>About 500&thinsp;ms faster per order</BulletOk>
              <BulletOk>You can revoke anytime from your wallet menu</BulletOk>
              <BulletWarn>Cannot withdraw your funds. Only trades on your collateral.</BulletWarn>
            </ul>

            {localResult && !localResult.ok && (
              <div className="mt-4 rounded-klub border border-pnl-short/30 bg-pnl-short/10 p-2.5 text-[11px] text-pnl-short">
                {localResult.message}
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="btn-secondary btn-block disabled:cursor-not-allowed disabled:opacity-60"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={handleAuthorize}
                disabled={pending}
                className="btn-primary btn-block disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending ? 'Approving…' : 'Enable'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessView({ onClose }: { readonly onClose: () => void }) {
  return (
    <>
      <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-pnl-long">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pnl-long" aria-hidden />
        Fast trading enabled
      </div>
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-fg-primary">
        You&rsquo;re set up.
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-fg-secondary">
        Trades from this browser sign instantly. You can revoke any time
        from the wallet menu.
      </p>
      <div className="mt-6">
        <button type="button" onClick={onClose} className="btn-primary btn-block">
          Done
        </button>
      </div>
    </>
  );
}

function BulletOk({ children }: { readonly children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-fg-secondary">
      <span className="mt-0.5 text-pnl-long" aria-hidden>
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

function BulletWarn({ children }: { readonly children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-fg-secondary">
      <span className="mt-0.5 text-accent" aria-hidden>
        i
      </span>
      <span>{children}</span>
    </li>
  );
}