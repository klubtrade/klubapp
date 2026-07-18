'use client';

import { useState } from 'react';

import { useToast } from '@/components/toast';

/**
 * /funding/add - fiat on-ramp.
 *
 * Visible by default:
 *   - Amount field with preset buttons
 *   - Method select (Apple Pay / Card / Bank)
 *   - Submit
 *
 * Behind "Review":
 *   - Fee breakdown, you-receive, settlement time
 */

type Method = 'apple-pay' | 'card' | 'bank';

const PRESETS = [50, 100, 500, 1_000] as const;

const FEES_BY_METHOD: Record<Method, number> = {
  'apple-pay': 2.5,
  card: 2.9,
  bank: 0.5,
};

const METHOD_LABEL: Record<Method, string> = {
  'apple-pay': 'Apple Pay',
  card: 'Card',
  bank: 'Bank',
};

export default function RampPage() {
  const [amount, setAmount] = useState(100);
  const [method, setMethod] = useState<Method>('apple-pay');
  const [showReview, setShowReview] = useState(false);
  const toast = useToast();

  const feePct = FEES_BY_METHOD[method];
  const feeAmount = (amount * feePct) / 100;
  const youReceive = amount - feeAmount;

  function handleSubmit() {
    const coinbaseAppId = process.env['NEXT_PUBLIC_COINBASE_ONRAMP_APP_ID'];
    if (!coinbaseAppId) {
      toast.warning('Ramp provider not configured');
      return;
    }
    toast.success('Redirecting to Coinbase');
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-md">
        <header>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            Add funds
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Deposit USDC to your KLUB account.
          </p>
        </header>

        {/* Amount - Revolut-style giant editable number, centered. */}
        <div className="mt-10 text-center">
          <div className="flex items-center justify-center">
            <span className="font-mono text-[48px] font-semibold text-fg-muted md:text-[60px]">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={10}
              step={10}
              value={amount}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0) setAmount(n);
              }}
              className="w-[200px] bg-transparent text-center font-mono text-[48px] font-semibold text-fg-primary outline-none md:text-[60px]"
            />
          </div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-fg-muted">
            USD
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setAmount(v);
              }}
              className={`rounded-klub border px-3 py-2 text-[13px] font-medium transition-colors ${
                amount === v
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border-subtle bg-bg-surface text-fg-secondary hover:border-border'
              }`}
            >
              ${v}
            </button>
          ))}
        </div>

        {/* Method */}
        <div className="mt-8 space-y-2">
          {(['apple-pay', 'card', 'bank'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMethod(m);
              }}
              className={`flex w-full items-center justify-between rounded-klub border px-4 py-3.5 text-left transition-colors ${
                method === m
                  ? 'border-accent bg-accent/5'
                  : 'border-border-subtle bg-bg-surface hover:border-border'
              }`}
            >
              <span className="text-[14px] font-medium text-fg-primary">{METHOD_LABEL[m]}</span>
              <span className="font-mono text-[11px] text-fg-muted">{FEES_BY_METHOD[m]}%</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={amount < 10}
          className="btn-primary btn-block btn-lg mt-8"
        >
          Deposit ${amount}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowReview((v) => !v);
          }}
          aria-expanded={showReview}
          className="mt-6 self-start text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
        >
          {showReview ? 'Hide breakdown' : 'Show breakdown'}
        </button>

        {showReview && (
          <div className="mt-4 space-y-2.5 border-t border-border-subtle pt-5 text-[13px]">
            <div className="flex items-baseline justify-between">
              <span className="text-fg-muted">You pay</span>
              <span className="font-mono text-fg-primary">${amount.toFixed(2)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-fg-muted">Fee</span>
              <span className="font-mono text-fg-muted">−${feeAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-border-subtle pt-2.5">
              <span className="text-fg-muted">You receive</span>
              <span className="font-mono text-accent">${youReceive.toFixed(2)} USDC</span>
            </div>
            <div className="pt-2 text-[11px] text-fg-muted">
              Settles in {method === 'bank' ? '1-3 business days' : '2-5 minutes'}. KLUB never
              sees your card or bank details.
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
