'use client';

import { useEffect, useState } from 'react';

import { useToast } from '@/components/toast';
import { resolveHandle } from '@/lib/handles';
import { useTradingWallet } from '@/lib/trading-wallet';

/**
 * /invite — share your invite link.
 *
 * KLUB is members-only. Once a user is in, they get a personal invite
 * link that points new visitors at the onboarding flow with a
 * referral attribution. The invite-code-creation backend isn't wired
 * yet (Q2 work), so this page hands the user an immediately usable
 * pay-by-handle URL and a fallback "go to KLUB" link they can share
 * via any channel. The real invite-code claim flow lives at
 * /invite/[code] and validates server-side.
 *
 * Three states:
 *   - Disconnected: prompt to connect.
 *   - Connected, no handle: prompt to claim a handle in /settings
 *     (pay link needs a handle to look pretty).
 *   - Connected, with handle: copy buttons for {handle URL, pay URL,
 *     plain klub.app}.
 */

export default function InvitePage() {
  const wallet = useTradingWallet();
  const toast = useToast();
  const connected = wallet.connected;
  const pubkey = connected ? wallet.publicKeyBase58 : null;

  const [handle, setHandle] = useState<string | null>(null);
  const [loadingHandle, setLoadingHandle] = useState(false);

  useEffect(() => {
    if (!pubkey) {
      setHandle(null);
      return;
    }
    const cached = window.localStorage.getItem(`klub.handle.${pubkey}`);
    if (!cached) return;
    setHandle(cached);
    setLoadingHandle(true);
    void resolveHandle(cached)
      .then((res) => {
        if (!res || res.pubkey !== pubkey) {
          window.localStorage.removeItem(`klub.handle.${pubkey}`);
          setHandle(null);
        }
      })
      .catch(() => {
        // Network error — keep cache.
      })
      .finally(() => {
        setLoadingHandle(false);
      });
  }, [pubkey]);

  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://klubapptrade.vercel.app';

  const profileUrl = handle ? `${origin}/copy/${handle}` : null;
  const payUrl = handle ? `${origin}/cash?to=@${handle}` : null;
  const homeUrl = origin;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Could not copy');
    }
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <div className="mx-auto w-full max-w-md">
        <header>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            Invite friends
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Share your KLUB profile or pay link.
          </p>
        </header>

        {!connected ? (
          <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface p-7 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-elevated text-fg-muted">
              <IconLink />
            </div>
            <h2 className="mt-4 text-[18px] font-semibold tracking-tight text-fg-primary">
              Connect a wallet
            </h2>
            <p className="mx-auto mt-2 max-w-[34ch] text-[13px] leading-relaxed text-fg-secondary">
              Your invite link is tied to your handle, which is tied to
              your wallet.
            </p>
          </section>
        ) : !handle && !loadingHandle ? (
          <section className="mt-8 rounded-klub-lg border border-border-subtle bg-bg-surface p-7 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-elevated text-fg-muted">
              <IconLink />
            </div>
            <h2 className="mt-4 text-[18px] font-semibold tracking-tight text-fg-primary">
              Claim a handle first
            </h2>
            <p className="mx-auto mt-2 max-w-[34ch] text-[13px] leading-relaxed text-fg-secondary">
              You need a handle so your invite link reads like
              <span className="font-mono"> klub.app/@you</span>.
            </p>
            <a href="/settings" className="btn-primary btn-compact mt-5 inline-flex">
              Go to settings
            </a>
          </section>
        ) : (
          <section className="mt-8 space-y-3">
            <ShareCard
              label="Your profile"
              url={profileUrl ?? '—'}
              onCopy={() => profileUrl && copy(profileUrl, 'Profile link')}
              accent
            />
            <ShareCard
              label="Pay-by-handle"
              url={payUrl ?? '—'}
              onCopy={() => payUrl && copy(payUrl, 'Pay link')}
              hint="Anyone with this link can send you USDC."
            />
            <ShareCard
              label="Just KLUB"
              url={homeUrl}
              onCopy={() => copy(homeUrl, 'Link')}
              hint="Plain landing — no handle attribution."
            />
          </section>
        )}

        <footer className="mt-10 rounded-klub border border-border-subtle bg-bg-surface/40 p-4 text-[11px] text-fg-muted">
          <div className="font-mono uppercase tracking-[0.12em] text-accent">
            Coming soon
          </div>
          <ul className="mt-1.5 space-y-1 leading-relaxed">
            <li>· Personal invite codes that count signups</li>
            <li>· Referral rewards (% of fees from invitees)</li>
            <li>· Embedded Twitter / Telegram share cards</li>
          </ul>
        </footer>
      </div>
    </main>
  );
}

function ShareCard({
  label,
  url,
  onCopy,
  accent,
  hint,
}: {
  readonly label: string;
  readonly url: string;
  readonly onCopy: () => void;
  readonly accent?: boolean;
  readonly hint?: string;
}) {
  return (
    <div
      className={`rounded-klub-lg border p-4 ${
        accent
          ? 'border-accent/40 bg-accent/5'
          : 'border-border-subtle bg-bg-surface'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={`text-[10px] font-medium uppercase tracking-[0.12em] ${
              accent ? 'text-accent' : 'text-fg-muted'
            }`}
          >
            {label}
          </div>
          <div className="mt-1 truncate font-mono text-[13px] text-fg-primary">
            {url}
          </div>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-md border border-border-subtle bg-bg-elevated px-3 py-1.5 text-[11px] font-medium text-fg-secondary transition-colors hover:bg-bg-surface hover:text-fg-primary"
        >
          Copy
        </button>
      </div>
      {hint && <div className="mt-2 text-[11px] text-fg-muted">{hint}</div>}
    </div>
  );
}

function IconLink() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 14a5 5 0 0 1 0-7l3-3a5 5 0 1 1 7 7l-1.5 1.5M14 10a5 5 0 0 1 0 7l-3 3a5 5 0 0 1-7-7l1.5-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
