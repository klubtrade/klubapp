'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '@/components/toast';
import { RISK_PRESETS, useUserPrefs, type RiskProfile } from '@/lib/user-prefs';

/**
 * /onboarding — minimalist 3-step first-run.
 *
 * Every step: one question, one answer pattern. No headers larger
 * than the question itself. No explanatory paragraphs.
 */

type Step = 0 | 1 | 2;

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(0);
  const [handle, setHandle] = useState('');
  const [profile, setProfile] = useState<RiskProfile>('balanced');
  const { setPrefs } = useUserPrefs();
  const toast = useToast();
  const router = useRouter();

  function finish(action: 'trade' | 'follow' | 'practice') {
    setPrefs({ riskProfile: profile, onboardingComplete: true });
    toast.success('Welcome to the klub');
    const route =
      action === 'trade' ? '/trade' : action === 'follow' ? '/copy' : '/practice';
    router.push(route);
  }

  return (
    <main className="min-h-screen bg-bg-base">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-20 md:px-8 md:pt-24">
        {/* Progress */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                i <= step ? 'bg-accent' : 'bg-border-subtle'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <Panel key="s0">
              <StepHandle
                handle={handle}
                onChange={setHandle}
                onNext={() => {
                  setStep(1);
                }}
              />
            </Panel>
          )}
          {step === 1 && (
            <Panel key="s1">
              <StepRisk
                profile={profile}
                onChange={setProfile}
                onNext={() => {
                  setStep(2);
                }}
              />
            </Panel>
          )}
          {step === 2 && (
            <Panel key="s2">
              <StepStart onFinish={finish} />
            </Panel>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function Panel({ children }: { readonly children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
      className="flex flex-1 flex-col pb-12 pt-16"
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------

function StepHandle({
  handle,
  onChange,
  onNext,
}: {
  readonly handle: string;
  readonly onChange: (v: string) => void;
  readonly onNext: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[32px]">
        Pick a handle.
      </h1>

      <div className="mt-8">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[18px] text-fg-muted">
            @
          </span>
          <input
            type="text"
            inputMode="text"
            pattern="[a-z0-9_]{3,20}"
            placeholder="alphamamba"
            value={handle}
            autoFocus
            onChange={(e) => {
              onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
            }}
            className="w-full rounded-klub border border-border bg-bg-surface py-4 pl-10 pr-4 font-mono text-[18px] text-fg-primary placeholder:text-fg-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-auto space-y-2">
        <button type="button" onClick={onNext} className="btn-primary btn-block btn-lg">
          Continue
        </button>
        <button
          type="button"
          onClick={onNext}
          className="block w-full text-center text-[13px] text-fg-muted transition-colors hover:text-fg-primary"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function StepRisk({
  profile,
  onChange,
  onNext,
}: {
  readonly profile: RiskProfile;
  readonly onChange: (p: RiskProfile) => void;
  readonly onNext: () => void;
}) {
  const options: readonly RiskProfile[] = ['conservative', 'balanced', 'aggressive'];

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[32px]">
        How much risk?
      </h1>

      <div className="mt-8 space-y-2">
        {options.map((opt) => {
          const preset = RISK_PRESETS[opt];
          const active = profile === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt);
              }}
              className={`flex w-full items-center justify-between rounded-klub border px-4 py-4 text-left transition-colors ${
                active
                  ? 'border-accent bg-accent/5'
                  : 'border-border-subtle bg-bg-surface hover:border-border'
              }`}
            >
              <div>
                <div
                  className={`text-[15px] font-medium ${active ? 'text-accent' : 'text-fg-primary'}`}
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

      <div className="mt-auto">
        <button type="button" onClick={onNext} className="btn-primary btn-block btn-lg">
          Continue
        </button>
      </div>
    </div>
  );
}

function StepStart({
  onFinish,
}: {
  readonly onFinish: (action: 'trade' | 'follow' | 'practice') => void;
}) {
  const actions: readonly { id: 'trade' | 'follow' | 'practice'; label: string }[] = [
    { id: 'practice', label: 'Practice first' },
    { id: 'follow', label: 'Follow a leader' },
    { id: 'trade', label: 'Open a trade' },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[32px]">
        Where do you start?
      </h1>

      <div className="mt-8 space-y-2">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              onFinish(a.id);
            }}
            className="flex w-full items-center justify-between rounded-klub border border-border-subtle bg-bg-surface px-4 py-4 text-left transition-colors hover:border-border"
          >
            <span className="text-[15px] font-medium text-fg-primary">{a.label}</span>
            <span className="text-fg-muted">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
