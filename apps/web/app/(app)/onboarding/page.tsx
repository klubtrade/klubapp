"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { useBulkFaucet } from "@/hooks/use-bulk-faucet";
import { useTradingWallet } from "@/lib/trading-wallet";
import { useUserPrefs } from "@/lib/user-prefs";

type Destination = "/portfolio" | "/trade";

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
  const [showInfo, setShowInfo] = useState(false);

  function finish(destination: Destination) {
    if (!wallet.publicKeyBase58) {
      wallet.promptConnect();
      return;
    }

    setPrefs({
      onboardingComplete: true,
      onboardingWallet: wallet.publicKeyBase58,
    });

    router.replace(destination);
  }

  async function claimFunds() {
    if (!wallet.connected || !wallet.publicKeyBase58) {
      wallet.promptConnect();
      return;
    }

    const result = await faucet.claim();
    if (!result.ok) {
      toast.info(
        "Continue when ready",
        "If this wallet already has test USDC, you can continue.",
      );
      return;
    }
    toast.success("Funded", "You can continue.");
  }

  const claiming = faucet.state.status === "claiming";
  const claimed = faucet.state.status === "success";
  const hasWallet = wallet.connected && wallet.publicKeyBase58 !== null;
  const infoText =
    "Bulk faucet gives 1,000 test USDC per wallet every 72 hours.";

  return (
    <main className="min-h-screen bg-bg-base">
      <div className="mx-auto flex min-h-screen max-w-sm flex-col px-5 pt-20 md:pt-24">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex flex-1 flex-col justify-center pb-16"
        >
          <div className="flex items-center gap-2">
            <h1 className="text-[34px] font-semibold leading-[1.02] tracking-[-0.04em]">
              Fund your wallet
            </h1>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              aria-label="Faucet info"
              className="mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-border-subtle text-[12px] text-fg-muted transition-colors hover:border-accent/40 hover:text-accent"
              title={infoText}
            >
              i
            </button>
          </div>

          {showInfo && (
            <div className="mt-3 rounded-klub border border-border-subtle bg-bg-surface px-3 py-2 text-[12px] leading-relaxed text-fg-secondary">
              {infoText}
            </div>
          )}

          <div className="mt-8 space-y-3">
            {!hasWallet ? (
              <button
                type="button"
                onClick={() => wallet.promptConnect()}
                className="btn-primary btn-block btn-lg"
              >
                {wallet.ready ? "Connect wallet" : "Loading wallet…"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={claiming}
                  onClick={() => void claimFunds()}
                  className="btn-primary btn-block btn-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {claiming
                    ? "Claiming…"
                    : claimed
                      ? "Claimed"
                      : "Claim 1,000 USDC"}
                </button>

                <button
                  type="button"
                  onClick={() => finish("/portfolio")}
                  className="btn-secondary btn-block btn-lg"
                >
                  Continue
                </button>
              </>
            )}
          </div>
        </motion.section>
      </div>
    </main>
  );
}
