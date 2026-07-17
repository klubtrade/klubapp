import type { UserPrefs } from '@/lib/user-prefs';

export function shouldRequireOnboarding(input: {
  readonly prefsReady: boolean;
  readonly walletReady: boolean;
  readonly connected: boolean;
  readonly publicKeyBase58: string | null;
  readonly pathname: string | null;
  readonly prefs: Pick<UserPrefs, 'onboardingComplete' | 'onboardingWallet'>;
}): boolean {
  if (!input.prefsReady || !input.walletReady || !input.connected || !input.publicKeyBase58) {
    return false;
  }
  if (input.pathname === '/onboarding') return false;
  return !(
    input.prefs.onboardingComplete &&
    input.prefs.onboardingWallet === input.publicKeyBase58
  );
}
