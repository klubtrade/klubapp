'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useToast } from '@/components/toast';
import { useBulkFaucet } from '@/hooks/use-bulk-faucet';
import { claimHandle, isValidHandle, normalizeHandle } from '@/lib/handles';
import { useTradingWallet } from '@/lib/trading-wallet';
import { useUserPrefs } from '@/lib/user-prefs';

type Step = 0 | 1;

/** The single first-run path: identity → test funds → Funding. */
export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(0);
  const [handle, setHandle] = useState('');
  const [claimingHandle, setClaimingHandle] = useState(false);
  const wallet = useTradingWallet();
  const faucet = useBulkFaucet();
  const { setPrefs } = useUserPrefs();
  const toast = useToast();
  const router = useRouter();

  async function submitHandle() {
    const normalized = normalizeHandle(handle);
    if (!wallet.publicKeyBase58 || !wallet.signMessage) {
      toast.error('Connect a Solana wallet to continue');
      wallet.promptConnect();
      return;
    }
    if (!isValidHandle(normalized)) {
      toast.error('Use 3–30 lowercase letters, numbers, or underscores');
      return;
    }
    setClaimingHandle(true);
    const result = await claimHandle(normalized, {
      publicKeyBase58: wallet.publicKeyBase58,
      signMessage: wallet.signMessage,
    });
    setClaimingHandle(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    try {
      window.localStorage.setItem(`klub.handle.${wallet.publicKeyBase58}`, result.handle);
    } catch {
      // The signed server claim remains authoritative if storage is unavailable.
    }
    toast.success(
      result.fallback
        ? `@${result.handle} saved while the registry is being provisioned`
        : `@${result.handle} is yours`,
    );
    setStep(1);
  }

  function finish() {
    if (!wallet.publicKeyBase58) return;
    setPrefs({
      onboardingComplete: true,
      onboardingWallet: wallet.publicKeyBase58,
    });
    toast.success('Welcome to KLUB');
    router.replace('/funding');
  }

  async function claimFunds() {
    const result = await faucet.claim();
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success('Test USDC claimed');
  }

  return (
    <main className="min-h-screen bg-bg-base">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-20 md:px-8 md:pt-24">
        <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of 2`}>
          {[0, 1].map((index) => (
            <span
              key={index}
              className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                index <= step ? 'bg-accent' : 'bg-border-subtle'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 ? (
            <Panel key="identity">
              <IdentityStep
                handle={handle}
                onChange={setHandle}
                onContinue={() => void submitHandle()}
                submitting={claimingHandle}
              />
            </Panel>
          ) : (
            <Panel key="funding">
              <FundingStep
                status={faucet.state.status}
                error={faucet.state.status === 'error' ? faucet.state.result.message : null}
                onClaim={() => void claimFunds()}
                onContinue={finish}
              />
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
      transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
      className="flex flex-1 flex-col pb-12 pt-16"
    >
      {children}
    </motion.div>
  );
}

function IdentityStep({
  handle,
  onChange,
  onContinue,
  submitting,
}: {
  readonly handle: string;
  readonly onChange: (value: string) => void;
  readonly onContinue: () => void;
  readonly submitting: boolean;
}) {
  const valid = isValidHandle(handle);
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
        Your identity
      </div>
      <h1 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.03em]">
        Choose your KLUB name.
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-fg-secondary">
        This is how people find, pay, and follow you. Your wallet signs the claim; no password is stored.
      </p>

      <div className="relative mt-9">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[18px] text-fg-muted">
          @
        </span>
        <input
          type="text"
          inputMode="text"
          pattern="[a-z0-9_]{3,30}"
          placeholder="alphamamba"
          value={handle}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid && !submitting) onContinue();
          }}
          onChange={(event) => onChange(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
          className="w-full rounded-klub border border-border bg-bg-surface py-4 pl-10 pr-4 font-mono text-[18px] text-fg-primary placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="mt-auto">
        <button
          type="button"
          disabled={!valid || submitting}
          onClick={onContinue}
          className="btn-primary btn-block btn-lg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Confirm in wallet…' : 'Claim username'}
        </button>
      </div>
    </div>
  );
}

function FundingStep({
  status,
  error,
  onClaim,
  onContinue,
}: {
  readonly status: 'idle' | 'claiming' | 'success' | 'error';
  readonly error: string | null;
  readonly onClaim: () => void;
  readonly onContinue: () => void;
}) {
  const success = status === 'success';
  return (
    <div className="flex flex-1 flex-col">
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
        Testnet funds
      </div>
      <h1 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.03em]">
        Start with test USDC.
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-fg-secondary">
        Claim free test funds, then you’ll land in Funding to review your balance before trading.
      </p>

      <div className="mt-9 rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-fg-primary">Bulk testnet faucet</div>
            <div className="mt-1 text-[11px] text-fg-muted">Rate limits may apply per wallet.</div>
          </div>
          <span className={`text-[12px] ${success ? 'text-pnl-long' : 'text-accent'}`}>
            {success ? 'Claimed ✓' : 'USDC'}
          </span>
        </div>
      </div>

      {error && <p className="mt-3 text-[12px] leading-relaxed text-pnl-short">{error}</p>}

      <div className="mt-auto space-y-2">
        {!success ? (
          <button
            type="button"
            disabled={status === 'claiming'}
            onClick={onClaim}
            className="btn-primary btn-block btn-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'claiming' ? 'Claiming…' : status === 'error' ? 'Try faucet again' : 'Claim test USDC'}
          </button>
        ) : (
          <button type="button" onClick={onContinue} className="btn-primary btn-block btn-lg">
            Continue to Funding
          </button>
        )}
        {status === 'error' && (
          <button
            type="button"
            onClick={onContinue}
            className="block w-full py-2 text-center text-[12px] text-fg-muted transition-colors hover:text-fg-primary"
          >
            I already funded this wallet
          </button>
        )}
      </div>
    </div>
  );
}
