'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import { useActiveAccount } from '@/hooks/use-active-account';
import { useBulkAccount } from '@/hooks/use-bulk-account';
import {
  useCreatePot,
  useTransfer,
} from '@/hooks/use-bulk-account-actions';
import { useBulkFaucet } from '@/hooks/use-bulk-faucet';
import { useSubAccounts } from '@/hooks/use-sub-accounts';
import type { SubmitOrderResult } from '@/lib/bulk/orders';
import { isValidHandle, normalizeHandle, resolveHandle } from '@/lib/handles';

/**
 * /cash — KLUB's Super App home tab.
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
  const { connected } = useWallet();
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

  const [showCreate, setShowCreate] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [result, setResult] = useState<SubmitOrderResult | null>(null);

  // Pay-by-link: `/cash?to=<pubkey>&amount=10` opens the Send modal
  // pre-filled. Handles (`@micah`) are resolved client-side to pubkeys
  // once the handle endpoint ships; for now we just pass strings
  // through and let the user see the literal value.
  const params = useSearchParams();
  const linkTo = params.get('to');
  const linkAmount = params.get('amount');
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

  const refreshing = state.status === 'loading';

  return (
    <main className="min-h-screen bg-bg-base px-4 pt-14 pb-20 md:px-8 md:pt-20">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-tight md:text-[28px]">
              Cash
            </h1>
            <div className="mt-0.5 truncate text-[11px] text-fg-muted">
              Viewing · <span className={isMaster ? 'text-fg-secondary' : 'text-accent'}>{activeName}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={!connected || refreshing}
            className="shrink-0 text-[11px] text-fg-muted transition-colors hover:text-fg-primary disabled:opacity-40"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </header>

        <section className="mt-4 rounded-klub-lg border border-border-subtle bg-bg-surface p-5 md:mt-6 md:p-7">
          <div className="text-[10px] uppercase tracking-[0.12em] text-fg-muted">
            Total balance
          </div>
          <div className="mt-1.5 font-mono text-[26px] font-semibold leading-none tracking-tight text-fg-primary md:text-[36px]">
            {!connected ? '—' : equity === null ? '$—' : `$${formatUsd(equity)}`}
          </div>
          <div className="mt-2 text-[11px] text-fg-muted">
            {!connected
              ? 'Connect a wallet to see your balance.'
              : free !== null
                ? `Available · $${formatUsd(free)}`
                : 'Loading available balance…'}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-1.5">
            <ActionButton
              label="Send"
              disabled={!connected}
              onClick={() => setShowSend(true)}
            />
            <ActionButton
              label="Receive"
              disabled={!connected}
              onClick={() => setShowReceive(true)}
            />
            <ActionLink label="Add" href="/ramp" />
            <ActionLink label="Trade" href="/quick-trade" />
          </div>

          <FaucetClaimRow
            pubkey={pubkey}
            connected={connected}
            label={activeName}
            isMaster={isMaster}
            onResult={onActionResult}
          />
        </section>

        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[14px] font-medium tracking-tight">Pots</h2>
            <span className="text-[10px] uppercase tracking-[0.12em] text-fg-muted">
              {subAccounts.length} on-chain
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-fg-muted">
            Isolate strategies, copy-trade pools, or shared funds.
          </p>

          <div className="mt-3 space-y-1.5">
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
                className="w-full rounded-klub border border-border-subtle bg-bg-surface/40 px-3 py-2 text-[11px] text-fg-muted transition-colors hover:text-fg-primary"
              >
                ← Switch back to Master
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={!connected}
            className="mt-2 w-full rounded-klub border border-dashed border-border-subtle bg-transparent py-2.5 text-[12px] text-fg-muted transition-colors hover:border-border hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            + Create pot
          </button>
        </section>

        <section className="mt-6">
          <h2 className="text-[14px] font-medium tracking-tight">Activity</h2>
          <div className="mt-2 rounded-klub border border-border-subtle bg-bg-surface/60 px-4 py-5 text-center text-[11px] text-fg-muted">
            Send and receive activity will show here once handle transfers ship.
          </div>
        </section>

        <footer className="mt-8 rounded-klub border border-border-subtle bg-bg-surface/40 p-4 text-[11px] text-fg-muted">
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
          initialTo={linkTo ?? ''}
          initialAmount={linkAmount ?? ''}
          onClose={() => setShowSend(false)}
          onResult={(r) => {
            onActionResult(r);
            if (r.ok) setShowSend(false);
          }}
        />
      )}

      {showReceive && pubkey && (
        <ReceiveModal pubkey={pubkey} label={activeName} onClose={() => setShowReceive(false)} />
      )}

      {result && <ResultToast result={result} onClose={() => setResult(null)} />}
    </main>
  );
}

// =============================================================================
// Action buttons
// =============================================================================

function ActionButton({
  label,
  onClick,
  disabled,
}: {
  readonly label: string;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1 rounded-klub border border-border-subtle bg-bg-elevated py-2.5 text-[11px] font-medium text-fg-secondary transition-colors hover:border-border hover:text-fg-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>{label}</span>
    </button>
  );
}

function ActionLink({ label, href }: { readonly label: string; readonly href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center justify-center gap-1 rounded-klub border border-border-subtle bg-bg-elevated py-2.5 text-[11px] font-medium text-fg-secondary transition-colors hover:border-border hover:text-fg-primary"
    >
      <span>{label}</span>
    </Link>
  );
}

function PotRow({
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
  return (
    <button
      type="button"
      onClick={onUse}
      className={`flex w-full items-center justify-between gap-3 rounded-klub border px-3 py-2.5 text-left transition-colors ${
        active
          ? 'border-accent/50 bg-accent/10'
          : 'border-border-subtle bg-bg-surface hover:border-border'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] font-medium ${active ? 'text-accent' : 'text-fg-primary'}`}>
          {name ?? 'Untitled pot'}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-fg-muted">
          {pubkey.slice(0, 10)}…{pubkey.slice(-6)}
        </div>
      </div>
      <span
        className={`shrink-0 text-[9px] uppercase tracking-[0.1em] ${
          active ? 'text-accent' : 'text-fg-muted'
        }`}
      >
        {active ? 'active' : 'use'}
      </span>
    </button>
  );
}

function PotEmptyState({ connected }: { readonly connected: boolean }) {
  return (
    <div className="rounded-klub border border-dashed border-border-subtle bg-bg-surface/40 px-4 py-5 text-center text-[11px] text-fg-muted">
      {connected
        ? 'No pots yet. Split your account by strategy.'
        : 'Connect a wallet to see your pots.'}
    </div>
  );
}

// =============================================================================
// Faucet claim row
// =============================================================================

function FaucetClaimRow({
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
  const claiming = state.status === 'claiming';
  const target = isMaster ? 'Master' : label;

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
      className="mt-2 flex w-full items-center justify-between rounded-klub border border-border-subtle bg-bg-elevated px-3 py-2 text-left transition-colors hover:border-border disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-fg-primary">
          {claiming
            ? usingAgent
              ? `Claiming for ${target}…`
              : `Sign in wallet to claim for ${target}…`
            : `Claim 10,000 mockUSDC → ${target}`}
        </div>
        <div className="mt-0.5 text-[10px] text-fg-muted">
          Testnet faucet · 24h limit per account
        </div>
      </div>
      <span className="shrink-0 text-[11px] text-accent">{claiming ? '…' : 'Claim'}</span>
    </button>
  );
}

// =============================================================================
// Create Pot modal
// =============================================================================

function CreatePotModal({
  onClose,
  onResult,
}: {
  readonly onClose: () => void;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const [name, setName] = useState('');
  const { create, state, usingAgent } = useCreatePot();
  const submitting = state.status === 'submitting';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const r = await create({ name: trimmed });
    onResult(r);
  }

  return (
    <ModalShell onClose={onClose} title="Create a pot">
      <p className="text-[12px] leading-relaxed text-fg-secondary">
        A pot is a named on-chain sub-account. Use it to isolate a
        strategy, a copy-trade pool, or shared funds.
      </p>
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
            Pot name
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Trading, Cash, BTC bag"
            maxLength={32}
            className="mt-1 w-full rounded-klub border border-border bg-bg-surface px-3 py-2 text-[13px] text-fg-primary focus:border-accent focus:outline-none"
          />
        </label>

        <div className="flex items-center justify-between rounded-klub border border-border-subtle bg-bg-elevated px-3 py-2 text-[11px] text-fg-muted">
          <span>{usingAgent ? 'Signed by your agent — silent' : 'Wallet popup will ask to sign'}</span>
          <span className="font-mono">{name.trim().length}/32</span>
        </div>

        <button
          type="submit"
          disabled={submitting || name.trim().length === 0}
          className="btn-primary btn-block py-2.5 text-[13px] font-medium disabled:opacity-50"
        >
          {submitting ? (usingAgent ? 'Creating…' : 'Sign in wallet…') : 'Create pot'}
        </button>
      </form>
    </ModalShell>
  );
}

// =============================================================================
// Send modal — pubkey for now, handles next slice
// =============================================================================

function SendModal({
  masterPubkey,
  subAccounts,
  initialFrom,
  initialTo,
  initialAmount,
  onClose,
  onResult,
}: {
  readonly masterPubkey: string;
  readonly subAccounts: readonly { readonly pubkey: string; readonly name: string | null }[];
  readonly initialFrom: string;
  readonly initialTo: string;
  readonly initialAmount: string;
  readonly onClose: () => void;
  readonly onResult: (r: SubmitOrderResult) => void;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [amount, setAmount] = useState(initialAmount);
  const [marginSymbol, setMarginSymbol] = useState('USDC');
  const { transfer, state, usingAgent } = useTransfer();
  const submitting = state.status === 'submitting';

  // Handle resolution. When `to` starts with `@`, resolve via the
  // /api/handles/[handle] route, debounced by 350ms after the last
  // keystroke. The resolved pubkey is what we actually send to Bulk;
  // the user's typed text stays in the input for clarity.
  const trimmedTo = to.trim();
  const isHandleInput = trimmedTo.startsWith('@');
  const handleCandidate = isHandleInput ? normalizeHandle(trimmedTo) : '';
  const [handleStatus, setHandleStatus] = useState<
    | { readonly state: 'idle' }
    | { readonly state: 'resolving' }
    | { readonly state: 'ok'; readonly pubkey: string }
    | { readonly state: 'invalid' }
    | { readonly state: 'not_found' }
    | { readonly state: 'error'; readonly message: string }
  >({ state: 'idle' });

  useEffect(() => {
    if (!isHandleInput) {
      setHandleStatus({ state: 'idle' });
      return;
    }
    if (!isValidHandle(handleCandidate)) {
      setHandleStatus({ state: 'invalid' });
      return;
    }
    setHandleStatus({ state: 'resolving' });
    const id = setTimeout(() => {
      void resolveHandle(handleCandidate)
        .then((res) => {
          if (!res) {
            setHandleStatus({ state: 'not_found' });
          } else {
            setHandleStatus({ state: 'ok', pubkey: res.pubkey });
          }
        })
        .catch((err: unknown) => {
          setHandleStatus({
            state: 'error',
            message: err instanceof Error ? err.message : 'Lookup failed',
          });
        });
    }, 350);
    return () => clearTimeout(id);
  }, [isHandleInput, handleCandidate]);

  // The pubkey we actually submit. For raw pubkey input, that's `to`
  // verbatim. For @handle input, only set once resolution succeeds.
  const resolvedTo = isHandleInput
    ? handleStatus.state === 'ok'
      ? handleStatus.pubkey
      : null
    : trimmedTo.length > 0
      ? trimmedTo
      : null;

  // Internal transfer iff both sides are user-owned accounts.
  const knownAccounts = new Set([masterPubkey, ...subAccounts.map((s) => s.pubkey)]);
  const inferredKind: 'internal' | 'external' =
    resolvedTo && knownAccounts.has(resolvedTo) ? 'internal' : 'external';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    if (!resolvedTo) {
      onResult({
        ok: false,
        reason: 'rejected_invalid',
        message: isHandleInput
          ? `Could not resolve ${trimmedTo}.`
          : 'Enter a destination first.',
      });
      return;
    }
    const r = await transfer({
      kind: inferredKind,
      from,
      to: resolvedTo,
      marginSymbol,
      amount: amt,
    });
    onResult(r);
  }

  return (
    <ModalShell onClose={onClose} title="Send">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">From</span>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-klub border border-border bg-bg-surface px-3 py-2 font-mono text-[12px] text-fg-primary focus:border-accent focus:outline-none"
          >
            <option value={masterPubkey}>Master · {short(masterPubkey)}</option>
            {subAccounts.map((sa) => (
              <option key={sa.pubkey} value={sa.pubkey}>
                {sa.name ?? 'Untitled pot'} · {short(sa.pubkey)}
              </option>
            ))}
          </select>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
            To · pubkey or handle
          </span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="@handle or Solana pubkey"
            className="mt-1 w-full rounded-klub border border-border bg-bg-surface px-3 py-2 font-mono text-[12px] text-fg-primary focus:border-accent focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
              Amount
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="mt-1 w-full rounded-klub border border-border bg-bg-surface px-3 py-2 text-[13px] text-fg-primary focus:border-accent focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
              Asset
            </span>
            <input
              value={marginSymbol}
              onChange={(e) => setMarginSymbol(e.target.value)}
              className="mt-1 w-full rounded-klub border border-border bg-bg-surface px-3 py-2 text-[13px] uppercase text-fg-primary focus:border-accent focus:outline-none"
            />
          </label>
        </div>

        <div className="rounded-klub border border-border-subtle bg-bg-elevated px-3 py-2 text-[11px] text-fg-muted">
          {trimmedTo.length === 0 ? (
            <span>Routing: pending — enter a destination.</span>
          ) : isHandleInput ? (
            handleStatus.state === 'resolving' ? (
              <span>Resolving {trimmedTo}…</span>
            ) : handleStatus.state === 'invalid' ? (
              <span className="text-pnl-short">Handle must be 3–30 lowercase letters / digits / _.</span>
            ) : handleStatus.state === 'not_found' ? (
              <span className="text-pnl-short">No one owns {trimmedTo} yet.</span>
            ) : handleStatus.state === 'ok' ? (
              <span>
                <span className={inferredKind === 'internal' ? 'text-pnl-long' : 'text-fg-secondary'}>
                  {inferredKind === 'internal' ? 'Internal · ' : 'External · '}
                </span>
                <span className="font-mono">
                  {handleStatus.pubkey.slice(0, 6)}…{handleStatus.pubkey.slice(-4)}
                </span>
              </span>
            ) : handleStatus.state === 'error' ? (
              <span className="text-pnl-short">Lookup failed: {handleStatus.message}</span>
            ) : (
              <span>Routing…</span>
            )
          ) : inferredKind === 'internal' ? (
            <span className="text-pnl-long">Internal · between your accounts. Instant, free.</span>
          ) : (
            <span>External · any Solana address.</span>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !resolvedTo || !amount}
          className="btn-primary btn-block py-2.5 text-[13px] font-medium disabled:opacity-50"
        >
          {submitting ? (usingAgent ? 'Sending…' : 'Sign in wallet…') : 'Send'}
        </button>
      </form>
    </ModalShell>
  );
}

// =============================================================================
// Receive modal
// =============================================================================

function ReceiveModal({
  pubkey,
  label,
  onClose,
}: {
  readonly pubkey: string;
  readonly label: string;
  readonly onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(pubkey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be unavailable on some browsers; user can manual-copy
    }
  }
  return (
    <ModalShell onClose={onClose} title="Receive">
      <p className="text-[12px] leading-relaxed text-fg-secondary">
        Share this pubkey to receive USDC, BTC, or any margin asset Bulk
        supports. Handle-based receive (@you) ships in the next slice.
      </p>
      <div className="mt-5 rounded-klub border border-border bg-bg-base p-4">
        <div className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
          {label} pubkey
        </div>
        <div className="mt-2 break-all font-mono text-[12px] text-fg-primary">
          {pubkey}
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="btn-primary btn-block mt-4 py-2.5 text-[13px] font-medium"
      >
        {copied ? 'Copied' : 'Copy pubkey'}
      </button>
    </ModalShell>
  );
}

// =============================================================================
// Modal shell + result toast
// =============================================================================

function ModalShell({
  title,
  children,
  onClose,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-klub-lg border border-border bg-bg-surface p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[20px] leading-none text-fg-muted transition-colors hover:text-fg-primary"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ResultToast({
  result,
  onClose,
}: {
  readonly result: SubmitOrderResult;
  readonly onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rawText = useMemo(() => {
    const raw = result.ok ? result.raw : result.raw;
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  }, [result]);

  // Stays up longer (12s) so users can read response details. Click
  // anywhere on the pill to dismiss.
  useEffect(() => {
    if (expanded) return;
    const id = setTimeout(onClose, 12_000);
    return () => clearTimeout(id);
  }, [onClose, expanded]);

  // Mirror to console so the user can copy/paste the full request +
  // response cleanly without expanding the toast on a small screen.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.group(`[result] ${result.ok ? 'ok' : 'fail'}`);
    // eslint-disable-next-line no-console
    console.log(result);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }, [result]);

  return (
    <div
      className="fixed bottom-6 left-1/2 z-[60] w-[min(92vw,520px)] -translate-x-1/2 px-2"
      role="status"
    >
      <div
        className={`rounded-klub-lg border px-4 py-3 text-left text-[12px] shadow-[0_12px_40px_rgba(0,0,0,0.6)] ${
          result.ok
            ? 'border-pnl-long/40 bg-pnl-long/10 text-pnl-long'
            : 'border-pnl-short/40 bg-pnl-short/10 text-pnl-short'
        }`}
      >
        <div className="flex items-start gap-3">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-current" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <strong className="font-semibold">
                {result.ok ? 'Submitted' : 'Failed'}
              </strong>
              <span className="truncate text-fg-secondary">
                {result.ok
                  ? result.orderId
                    ? `· ${result.orderId.slice(0, 16)}…`
                    : '· accepted by Bulk (no orderId — likely faucet/transfer/sub-account)'
                  : `· ${result.message}`}
              </span>
            </div>
            {rawText && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-[10px] uppercase tracking-[0.08em] text-fg-muted hover:text-fg-primary"
              >
                {expanded ? '▼ Hide response' : '▶ Show response'}
              </button>
            )}
            {expanded && rawText && (
              <pre className="mt-2 max-h-64 overflow-auto rounded border border-border-subtle bg-bg-base/60 p-2 font-mono text-[10px] leading-relaxed text-fg-secondary">
                {rawText}
              </pre>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-fg-muted transition-colors hover:text-fg-primary"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function short(pk: string): string {
  return pk.length <= 10 ? pk : `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}
