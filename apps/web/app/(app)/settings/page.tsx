'use client';

import { useToast } from '@/components/toast';
import { WalletButton } from '@/components/wallet-button';
import { RISK_PRESETS, useUserPrefs, type RiskProfile } from '@/lib/user-prefs';

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
        window.location.href = '/home';
      }, 600);
    } catch {
      toast.error('Could not clear');
    }
  }

  if (!ready) {
    return (
      <main className="min-h-screen px-6 pt-28">
        <div className="mx-auto max-w-md text-fg-muted">Loading…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-md px-6 pb-20 pt-28 md:pt-32">
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          Settings
        </div>

        {/* Wallet */}
        <div className="mt-10">
          <Label>Wallet</Label>
          <div className="mt-3">
            <WalletButton variant="secondary" size="md" />
          </div>
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
