"use client";

import { motion } from "framer-motion";
import { Check, Info, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { useBulkFaucet } from "@/hooks/use-bulk-faucet";
import { useAgentWallet } from "@/hooks/use-agent-wallet";
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
  const fastTrading = useAgentWallet();
  const { setPrefs } = useUserPrefs();
  const toast = useToast();
  const router = useRouter();
  const [showInfo, setShowInfo] = useState(false);
  const [connectStarted, setConnectStarted] = useState(false);

  const hasWallet = wallet.connected && wallet.publicKeyBase58 !== null;

  useEffect(() => {
    if (hasWallet) setConnectStarted(false);
  }, [hasWallet]);

  function connectWallet() {
    setConnectStarted(true);
    wallet.promptConnect();
  }

  function finish(destination: Destination) {
    if (!wallet.publicKeyBase58) {
      connectWallet();
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
      connectWallet();
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

  async function enableFastTrading() {
    const result = await fastTrading.authorize();
    if (result.ok) {
      toast.success("Fast trading enabled");
      return;
    }
    toast.warning("Fast trading was not enabled", result.message);
  }

  const claiming = faucet.state.status === "claiming";
  const claimed = faucet.state.status === "success";
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
              <Info size={13} strokeWidth={1.8} aria-hidden />
            </button>
          </div>

          {showInfo && (
            <div className="mt-3 rounded-klub border border-border-subtle bg-bg-surface px-3 py-2 text-[12px] leading-relaxed text-fg-secondary">
              {infoText}
            </div>
          )}

          <div className="mt-8 space-y-4">
            {!hasWallet ? (
              <>
                <button
                  type="button"
                  onClick={connectWallet}
                  disabled={!wallet.ready}
                  className="btn-primary btn-compact btn-lg mx-auto flex disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {wallet.ready ? "Connect wallet" : "Loading…"}
                </button>
                {connectStarted && !wallet.connectionError && (
                  <p className="text-center text-[12px] text-fg-muted">
                    Finish in Privy.
                  </p>
                )}
                {wallet.connectionError && (
                  <p className="text-center text-[12px] text-pnl-short">
                    Wallet setup failed. Try again.
                  </p>
                )}
              </>
            ) : (
              <>
                <SetupRow
                  title="Test funds"
                  detail={claimed ? "Ready" : "1,000 test USDC"}
                  complete={claimed}
                  action={
                    claiming ? "Claiming…" : claimed ? "Claimed" : "Claim"
                  }
                  disabled={claiming || claimed}
                  onClick={() => void claimFunds()}
                />

                {fastTrading.creationEnabled && (
                  <SetupRow
                    title="Fast trading"
                    detail="One approval"
                    complete={fastTrading.agent !== null}
                    action={
                      fastTrading.pending
                        ? "Enabling…"
                        : fastTrading.agent
                          ? "Enabled"
                          : "Enable"
                    }
                    disabled={fastTrading.pending || fastTrading.agent !== null}
                    onClick={() => void enableFastTrading()}
                    icon={<Zap size={17} strokeWidth={1.8} aria-hidden />}
                  />
                )}

                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={() => finish("/portfolio")}
                    className="btn-primary btn-compact btn-lg"
                  >
                    Continue
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.section>
      </div>
    </main>
  );
}

function SetupRow({
  title,
  detail,
  complete,
  action,
  disabled,
  onClick,
  icon,
}: {
  readonly title: string;
  readonly detail: string;
  readonly complete: boolean;
  readonly action: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-klub border border-border-subtle bg-bg-surface px-4 py-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          complete ? "bg-pnl-long/10 text-pnl-long" : "bg-accent/10 text-accent"
        }`}
      >
        {complete ? (
          <Check size={17} strokeWidth={2} aria-hidden />
        ) : (
          (icon ?? <span className="h-2 w-2 rounded-full bg-current" />)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-fg-primary">{title}</div>
        <div className="text-[11px] text-fg-muted">{detail}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="btn-secondary btn-sm min-w-[84px] disabled:cursor-default disabled:opacity-60"
      >
        {action}
      </button>
    </div>
  );
}
