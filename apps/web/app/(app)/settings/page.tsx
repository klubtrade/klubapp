'use client';

import { useEffect, useState } from 'react';

import { useToast } from '@/components/toast';
import { WalletButton } from '@/components/wallet-button';
import {
  claimHandle,
  isValidHandle,
  normalizeHandle,
  resolveHandle,
} from '@/lib/handles';
import { RISK_PRESETS, useUserPrefs, type RiskProfile } from '@/lib/user-prefs';
import { useTradingWallet } from '@/lib/trading-wallet';

/**
 * /settings — minimalist.
 *
 * A quiet list. Each row is one setting. No section descriptions,
 * no "Danger zone" framing, no introductions.
 */

export default function SettingsPage() {
  const { prefs, setPrefs, ready } = useUserPrefs();
  const toast = useToast();

  function setRisk(r: RiskProfile) {
    setPrefs({ riskProfile: r });
    toast.success('Risk profile updated');
  }

  function toggleAlerts() {
    setPrefs({ alertsEnabled: !prefs.alertsEnabled });
  }

  function clearLocalData() {
    if (!confirm('Clear all local KLUB data? Your Bulk account is unaffected.')) return;
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('klub.')) localStorage.removeItem(key);
      }
      toast.success('Cleared');
      setTimeout(() => {
        window.location.href = '/portfolio';
      }, 600);
    } catch {
      toast.error('Could not clear');
    }
  }

  if (!ready) {
    return (
      <main className="min-h-screen px-4 pt-20 md:px-8 md:pt-24">
        <div className="mx-auto max-w-md text-fg-muted">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base px-4 pb-24 pt-20 md:px-8 md:pt-24">
      <section className="mx-auto w-full max-w-md">
        <header>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-fg-primary md:text-[36px]">
            Settings
          </h1>
          <p className="mt-1 text-[13px] text-fg-muted">
            Wallet, handle, risk profile, alerts.
          </p>
        </header>

        {/* Wallet */}
        <div className="mt-10">
          <Label>Wallet</Label>
          <div className="mt-3">
            <WalletButton variant="secondary" size="md" />
          </div>
        </div>

        {/* Handle */}
        <div className="mt-10">
          <Label>Your handle</Label>
          <HandleCard />
        </div>

        {/* Risk profile */}
        <div className="mt-10">
          <Label>Risk profile</Label>
          <div className="mt-3 space-y-2">
            {(['conservative', 'balanced', 'aggressive'] as const).map((opt) => {
              const preset = RISK_PRESETS[opt];
              const active = prefs.riskProfile === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setRisk(opt);
                  }}
                  className={`flex w-full items-center justify-between rounded-klub border px-4 py-3.5 text-left transition-colors ${
                    active
                      ? 'border-accent bg-accent/5'
                      : 'border-border-subtle bg-bg-surface hover:border-border'
                  }`}
                >
                  <div>
                    <div
                      className={`text-[14px] font-medium ${active ? 'text-accent' : 'text-fg-primary'}`}
                    >
                      {preset.label}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
                      Max {preset.maxLeverage}× · default {preset.defaultLeverage}×
                    </div>
                  </div>
                  {active && <span className="text-accent">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Alerts */}
        <div className="mt-10">
          <Label>Alerts</Label>
          <button
            type="button"
            role="switch"
            aria-checked={prefs.alertsEnabled}
            onClick={toggleAlerts}
            className="mt-3 flex w-full items-center justify-between rounded-klub border border-border-subtle bg-bg-surface px-4 py-3.5 text-left transition-colors hover:border-border"
          >
            <div>
              <div className="text-[14px] font-medium text-fg-primary">
                Liquidation warnings
              </div>
              <div className="mt-0.5 text-[11px] text-fg-muted">
                {prefs.alertsEnabled ? 'On — pings at 25% / 10% / 3%' : 'Off'}
              </div>
            </div>
            <span
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
                prefs.alertsEnabled ? 'bg-accent' : 'bg-border-default'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg-base transition-transform ${
                  prefs.alertsEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </div>

        {/* Clear data */}
        <div className="mt-10">
          <Label>Local data</Label>
          <button
            type="button"
            onClick={clearLocalData}
            className="mt-3 w-full rounded-klub border border-border-subtle bg-bg-surface px-4 py-3.5 text-left text-[14px] text-fg-secondary transition-colors hover:border-pnl-short/40 hover:text-pnl-short"
          >
            Clear KLUB data on this device
          </button>
        </div>
      </section>
    </main>
  );
}

function Label({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
      {children}
    </div>
  );
}

/**
 * Handle card. On mount, looks up "what handle does my pubkey already
 * own?" via a reverse lookup. Since we don't have a /api/handles/by-pubkey
 * route yet, we instead store the claimed handle in localStorage and
 * verify against the API on demand. Good enough for v1; a proper reverse
 * index (or index on `pubkey`) lets us drop the localStorage cache later.
 */
function HandleCard() {
  const wallet = useTradingWallet();
  const toast = useToast();
  const pubkey = wallet.connected ? wallet.publicKeyBase58 : null;
  const signMessage = wallet.signMessage;

  const [claimed, setClaimed] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Hydrate the claimed handle from localStorage, then verify with the
  // server (the local cache may be stale if the user revoked from
  // another device).
  useEffect(() => {
    if (!pubkey) {
      setClaimed(null);
      return;
    }
    const cached = window.localStorage.getItem(`klub.handle.${pubkey}`);
    if (!cached) return;
    setClaimed(cached);
    setVerifying(true);
    void resolveHandle(cached)
      .then((res) => {
        if (!res || res.pubkey !== pubkey) {
          window.localStorage.removeItem(`klub.handle.${pubkey}`);
          setClaimed(null);
        }
      })
      .catch(() => {
        // Network error — keep cache; user can retry on next mount
      })
      .finally(() => setVerifying(false));
  }, [pubkey]);

  async function onClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!pubkey || !signMessage) {
      toast.error('Connect a wallet first');
      return;
    }
    const handle = normalizeHandle(draft);
    if (!isValidHandle(handle)) {
      toast.error('Handle must be 3–30 lowercase letters, digits, or _');
      return;
    }
    setSubmitting(true);
    const result = await claimHandle(handle, {
      publicKeyBase58: pubkey,
      signMessage,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    window.localStorage.setItem(`klub.handle.${pubkey}`, result.handle);
    setClaimed(result.handle);
    setDraft('');
    toast.success(`Claimed @${result.handle}`);
  }

  async function copyPayLink() {
    if (!claimed) return;
    const url = `${window.location.origin}/cash?to=@${claimed}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Pay link copied');
    } catch {
      toast.error('Could not copy');
    }
  }

  if (!pubkey) {
    return (
      <div className="mt-3 rounded-klub border border-border-subtle bg-bg-surface px-4 py-3.5 text-[13px] text-fg-muted">
        Connect a wallet to claim a handle.
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="mt-3 space-y-2">
        <div className="flex items-baseline justify-between rounded-klub border border-border-subtle bg-bg-surface px-4 py-3.5">
          <div>
            <div className="font-mono text-[15px] font-medium text-accent">@{claimed}</div>
            <div className="mt-0.5 text-[11px] text-fg-muted">
              {verifying ? 'Verifying…' : 'Claimed on-chain'}
            </div>
          </div>
          <button
            type="button"
            onClick={copyPayLink}
            className="text-[11px] text-fg-secondary transition-colors hover:text-accent"
          >
            Copy pay link
          </button>
        </div>
        <div className="font-mono text-[10px] text-fg-muted">
          klub.app/pay/@{claimed}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onClaim} className="mt-3 space-y-2">
      <div className="flex items-stretch overflow-hidden rounded-klub border border-border bg-bg-surface focus-within:border-accent">
        <span className="flex items-center px-3 font-mono text-[13px] text-fg-muted">@</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.toLowerCase())}
          placeholder="your_handle"
          maxLength={30}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 bg-transparent py-3 font-mono text-[13px] text-fg-primary outline-none"
        />
        <button
          type="submit"
          disabled={submitting || draft.length < 3}
          className="border-l border-border-subtle bg-bg-elevated px-4 text-[12px] font-medium text-fg-primary transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50"
        >
          {submitting ? 'Claiming…' : 'Claim'}
        </button>
      </div>
      <div className="text-[11px] text-fg-muted">
        Lowercase letters, digits, and _. Anyone can pay you with{' '}
        <span className="font-mono">klub.app/pay/@you</span>.
      </div>
    </form>
  );
}
