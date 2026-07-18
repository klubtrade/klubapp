'use client';

import { useState } from 'react';

/**
 * Invite redemption - minimalist.
 *
 * One email field, one submit button. Success state is a single line
 * + next-step link. Handle + risk profile are collected in
 * /onboarding, not here - we keep this screen about one decision only.
 */

type Status = 'idle' | 'submitting' | 'ok' | 'err';

export function InviteFlow({
  code,
  label,
  remaining,
}: {
  readonly code: string;
  readonly label: string;
  readonly remaining?: number;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrMsg('');
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus('err');
        setErrMsg(
          body.error === 'invalid_code'
            ? 'Code no longer valid.'
            : body.error === 'invalid_payload'
              ? 'Check your email format.'
              : 'Something went wrong. Try again.',
        );
        return;
      }
      setStatus('ok');
    } catch {
      setStatus('err');
      setErrMsg('Network error. Try again.');
    }
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-md">
        {status === 'ok' ? (
          <SuccessPanel />
        ) : (
          <>
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
              {label}
            </div>

            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
              You&rsquo;re invited.
            </h1>

            <form onSubmit={submit} className="mt-8">
              <label className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                Email
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                placeholder="you@domain.com"
                className="mt-2 w-full rounded-klub border border-border bg-bg-surface px-4 py-3.5 text-[15px] text-fg-primary placeholder:text-fg-muted focus:border-accent focus:outline-none"
              />

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="btn-primary btn-block btn-lg mt-4"
              >
                {status === 'submitting' ? 'Joining…' : 'Join the klub'}
              </button>

              {status === 'err' && (
                <div className="mt-3 text-[13px] text-pnl-short">{errMsg}</div>
              )}

              {typeof remaining === 'number' && remaining > 0 && (
                <div className="mt-6 text-[11px] text-fg-muted">
                  {remaining} spot{remaining === 1 ? '' : 's'} remaining
                </div>
              )}
            </form>
          </>
        )}
      </section>
    </main>
  );
}

function SuccessPanel() {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
        You&rsquo;re in
      </div>
      <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
        Welcome to the klub.
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-fg-secondary">
        Check your email for the sign-in link. Set up takes about a minute.
      </p>
      <a href="/funding" className="btn-primary btn-block btn-lg mt-8">
        Continue to home
      </a>
    </div>
  );
}
