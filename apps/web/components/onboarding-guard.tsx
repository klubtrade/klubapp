'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useTradingWallet } from '@/lib/trading-wallet';
import { shouldRequireOnboarding } from '@/lib/onboarding-state';
import { useUserPrefs } from '@/lib/user-prefs';

/** Sends every newly connected wallet through the same first-run path. */
export function OnboardingGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const wallet = useTradingWallet();
  const { prefs, ready } = useUserPrefs();

  useEffect(() => {
    if (
      shouldRequireOnboarding({
        prefsReady: ready,
        walletReady: wallet.ready,
        connected: wallet.connected,
        publicKeyBase58: wallet.publicKeyBase58,
        pathname,
        prefs,
      })
    ) {
      router.replace('/onboarding');
    }
  }, [pathname, prefs, ready, router, wallet]);

  return null;
}
