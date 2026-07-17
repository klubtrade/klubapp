'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { useToast } from '@/components/toast';
import { useBulkFaucet } from '@/hooks/use-bulk-faucet';
import { useTradingWallet } from '@/lib/trading-wallet';
import { useUserPrefs } from '@/lib/user-prefs';

type Destination = '/portfolio' | '/trade';

/**
 * First-run onboarding.
 *
 * Current product decision: no username step. The only required setup is
 * giving the user a clean testnet funding path, then letting them continue
 * even if they already claimed the faucet in the current 72h window.
 */
export default function OnboardingPage() {
  const wallet = useTradingWallet();
  const faucet = useBulkFaucet();
  const { setPrefs } = useUserPrefs();
  const toast = useToast();
  const router = useRouter();

  function finish(destination: Destination) {
    if (!wallet.publicKeyBase58) {
      wallet.promptConnect();
      return;
    }

    setPrefs({
      onboardingComplete: true,
      onboardingWallet: wallet.publicKeyBase58,
    });

    toast.success('Setup complete', 'You can claim again after the 72 hour faucet reset.');
    router.replace(destination);
  }

  async function claimFunds() {
    if (!wallet.connected || !wallet.publicKeyBase58) {
      wallet.promptConnect();
      return;
    }

    const result = await faucet.claim();
    if (!result.ok) {
      toast.info('Faucet claim not confirmed', result.message);
      return;
    }
    toast.success('1,000 test USDC claimed', 'You can continue to Portfolio or start trading.');
  }

  const claiming = faucet.state.status === 'claiming';
  const claimed = faucet.state.status === 'success';
  const error = faucet.state.status === 'error' ? faucet.state.result.message : null;

  return (
    <main className="min-h-screen bg-bg-base">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pt-20 md:px-8 md:pt-24">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex flex-1 flex-col pb-12 pt-16"
        >
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
            Testnet setup
          </div>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.03em]">
            Fund your test wallet.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-fg-secondary">
            Bulk faucet gives this wallet 1,000 test USDC. It resets every 72 hours. If
            you already claimed, skip this and continue.
          </p>

          <div className="mt-9 rounded-klub-lg border border-border-subtle bg-bg-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[13px] font-medium text-fg-primary">
                  Bulk testnet faucet
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-fg-muted">
                  1,000 test USDC per wallet. Next claim after 72 hours.
                </div>
              </div>
              <span className={`shrink-0 text-[12px] ${claimed ? 'text-pnl-long' : 'text-accent'}`}>
                {claimed ? 'Claimed ✓' : '1,000 USDC'}
              </span>
            </div>

            {wallet.publicKeyBase58 && (
              <div className="mt-4 truncate rounded-klub border border-border-subtle bg-bg-base px-3 py-2 font-mono text-[11px] text-fg-muted">
                {wallet.publicKeyBase58}
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-klub border border-accent/20 bg-accent/5 p-3 text-[12px] leading-relaxed text-fg-secondary">
              {error}
            </div>
          )}

          <div className="mt-auto space-y-3">
            <button
              type="button"
              disabled={claiming || !wallet.ready}
              onClick={() => void claimFunds()}
              className="btn-primary btn-block btn-lg disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!wallet.ready
                ? 'Loading…'
                : !wallet.connected
                  ? 'Connect wallet'
                  : claiming
                    ? 'Claiming…'
                    : claimed
                      ? 'Claimed'
                      : 'Claim 1,000 test USDC'}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  finish('/portfolio');
                }}
                className="btn-secondary btn-block"
              >
                Continue to Portfolio
              </button>
              <button
                type="button"
                onClick={() => {
                  finish('/trade');
                }}
                className="btn-secondary btn-block"
              >
                Start Trading
              </button>
            </div>

            <p className="text-center text-[11px] leading-relaxed text-fg-muted">
              Already claimed in the last 72 hours? Use either continue button.
            </p>
          </div>
        </motion.section>
      </div>
    </main>
  );
}
