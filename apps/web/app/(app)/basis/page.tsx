'use client';

import { useMemo, useState } from 'react';

import { useToast } from '@/components/toast';

/**
 * /basis — Basis vault, minimalist.
 *
 * Visible by default:
 *   - One APY headline
 *   - Deposit/withdraw form
 *
 * Behind "Learn more":
 *   - How it works
 *   - Live allocation
 *   - Risks
 */

const VAULT_APY_PCT = 14.8;
const FEE_MGMT = 2;
const FEE_PERF = 20;

const ALLOCATIONS = [
  { pair: 'BTC paired', weight: 42 },
  { pair: 'ETH paired', weight: 28 },
  { pair: 'SOL paired', weight: 18 },
  { pair: 'USDC reserve', weight: 12 },
] as const;

export default function BasisPage() {
  const [amount, setAmount] = useState(1_000);
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [learnOpen, setLearnOpen] = useState(false);
  const toast = useToast();

  const projected = useMemo(() => (amount * VAULT_APY_PCT) / 100, [amount]);

  function handleSubmit() {
    if (amount <= 0) {
      toast.error('Enter an amount');
      return;
    }
    toast.success(
      mode === 'deposit'
        ? `${amount.toLocaleString()} USDC queued for deposit`
        : `${amount.toLocaleString()} USDC withdrawal requested`,
    );
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-md">
        <header>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            Basis vault
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Delta-neutral yield · net of fees.
          </p>
        </header>

        <div className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface px-6 py-8 text-center">
          <div className="font-mono text-[64px] font-semibold leading-none tracking-[-0.03em] text-accent md:text-[80px]">
            {VAULT_APY_PCT.toFixed(1)}%
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.12em] text-fg-muted">
            target APY
          </div>
        </div>

        {/* Mode toggle */}
        <div className="mt-10 grid grid-cols-2 overflow-hidden rounded-klub border border-border">
          <button
            type="button"
            onClick={() => {
              setMode('deposit');
            }}
            className={`py-2.5 text-[13px] font-medium transition-colors ${
              mode === 'deposit' ? 'bg-accent/15 text-accent' : 'text-fg-secondary'
            }`}
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('withdraw');
            }}
            className={`border-l border-border py-2.5 text-[13px] font-medium transition-colors ${
              mode === 'withdraw' ? 'bg-accent/15 text-accent' : 'text-fg-secondary'
            }`}
          >
            Withdraw
          </button>
        </div>

        {/* Amount */}
        <div className="mt-5">
          <label className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
            Amount · USDC
          </label>
          <input
            type="number"
            inputMode="decimal"
            step={10}
            min={0}
            value={amount}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0) setAmount(n);
            }}
            className="mt-2 w-full rounded-klub border border-border bg-bg-base px-4 py-3.5 font-mono text-xl text-fg-primary focus:border-accent focus:outline-none"
          />
        </div>

        {/* Projected yield — only on deposit */}
        {mode === 'deposit' && (
          <div className="mt-4 text-[13px] text-fg-muted">
            Projected 12-mo yield ·{' '}
            <span className="font-mono text-pnl-long">+${projected.toFixed(0)}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={amount <= 0}
          className="btn-primary btn-compact btn-lg mt-8"
        >
          {mode === 'deposit' ? 'Deposit' : 'Withdraw'} ${amount.toLocaleString()}
        </button>

        {/* Learn more disclosure */}
        <button
          type="button"
          onClick={() => {
            setLearnOpen((v) => !v);
          }}
          aria-expanded={learnOpen}
          className="mt-8 self-start text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
        >
          {learnOpen ? 'Hide details' : 'Learn more'}
        </button>

        {learnOpen && <LearnMorePanel />}
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------

function LearnMorePanel() {
  return (
    <div className="mt-6 space-y-8 border-t border-border-subtle pt-8 text-[14px] leading-relaxed text-fg-secondary">
      <div>
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          How it works
        </div>
        <p>
          You deposit USDC. The vault opens paired long and short perpetual positions — for every
          $1 long on a market, $1 short on a correlated one. Net directional exposure: zero.
          Funding accrues on both sides; you earn the spread.
        </p>
      </div>

      <div>
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          Current allocation
        </div>
        <ul className="space-y-2">
          {ALLOCATIONS.map((a) => (
            <li
              key={a.pair}
              className="flex items-baseline justify-between font-mono text-[13px]"
            >
              <span className="text-fg-primary">{a.pair}</span>
              <span className="text-fg-muted">{a.weight}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          Fees
        </div>
        <p>
          {FEE_MGMT}% management, {FEE_PERF}% of profits above a high-water mark. APY shown is net
          of fees.
        </p>
      </div>

      <div>
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-alert-orange">
          Risks
        </div>
        <p>
          Funding can flip negative. Extreme moves can briefly unbalance the pair. Smart-contract
          risk is non-zero. Past APY is not a guarantee.
        </p>
      </div>
    </div>
  );
}
