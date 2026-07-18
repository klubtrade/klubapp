"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { useWalletGate } from "@/hooks/use-wallet-gate";
import { useUserPrefs } from "@/lib/user-prefs";

// Shared fly-in variant - used by every section block + nested children
export const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delay: i * 0.08,
      ease: [0.2, 0.7, 0.2, 1] as const,
    },
  }),
};

export const viewport = { once: true, amount: 0.2 } as const;

export function EnterAppButton({
  large = false,
}: {
  readonly large?: boolean;
}) {
  const router = useRouter();
  const wallet = useWalletGate();
  const { prefs, ready: prefsReady } = useUserPrefs();
  const [requested, setRequested] = useState(false);

  function appDestination(): string {
    if (
      prefsReady &&
      prefs.onboardingComplete &&
      prefs.onboardingWallet === wallet.pubkey
    ) {
      return "/portfolio";
    }
    return "/onboarding";
  }

  function enter() {
    if (wallet.connected) {
      router.push(appDestination());
      return;
    }
    setRequested(true);
    wallet.promptConnect();
  }

  useEffect(() => {
    if (!requested || !wallet.connected) return;
    router.push(appDestination());
    setRequested(false);
    // `appDestination` is intentionally inline logic; dependencies below
    // capture the route decision without memo noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    prefs.onboardingComplete,
    prefs.onboardingWallet,
    prefsReady,
    requested,
    router,
    wallet.connected,
    wallet.pubkey,
  ]);

  return (
    <button
      type="button"
      onClick={enter}
      className={`btn-primary group ${large ? "btn-lg" : ""}`}
    >
      Enter the app
      <span className="transition-transform duration-200 group-hover:translate-x-0.5">
        →
      </span>
    </button>
  );
}

// =============================================================================
// Shared bits
// =============================================================================

export function Kicker({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
      {children}
    </div>
  );
}
