export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

export interface UserPrefs {
  readonly riskProfile: RiskProfile;
  readonly onboardingComplete: boolean;
  readonly onboardingWallet: string | null;
  readonly preferredTradeMode: 'simple' | 'expert';
  readonly defaultCopyAllocPct: number;
  readonly alertsEnabled: boolean;
}

export type ProfilePrefsUpdate = Partial<
  Pick<
    UserPrefs,
    | 'riskProfile'
    | 'onboardingComplete'
    | 'preferredTradeMode'
    | 'defaultCopyAllocPct'
    | 'alertsEnabled'
  >
> & {
  readonly handle?: string | null;
};

export const DEFAULT_PREFS: UserPrefs = {
  riskProfile: 'balanced',
  onboardingComplete: false,
  onboardingWallet: null,
  preferredTradeMode: 'simple',
  defaultCopyAllocPct: 20,
  alertsEnabled: true,
};

const UPDATE_KEYS = [
  'handle',
  'riskProfile',
  'onboardingComplete',
  'preferredTradeMode',
  'defaultCopyAllocPct',
  'alertsEnabled',
] as const;

export function cleanProfileUpdate(update: ProfilePrefsUpdate): ProfilePrefsUpdate {
  const cleaned: Record<string, unknown> = {};
  for (const key of UPDATE_KEYS) {
    const value = update[key];
    if (value !== undefined) cleaned[key] = value;
  }
  return cleaned as ProfilePrefsUpdate;
}

export function profileUpdateMessage(input: {
  readonly pubkey: string;
  readonly update: ProfilePrefsUpdate;
}): string {
  return `klub:profile:update:${JSON.stringify({
    pubkey: input.pubkey,
    update: cleanProfileUpdate(input.update),
  })}`;
}
