'use client';

/**
 * User preferences — small per-device store.
 *
 * Risk profile, onboarding status, UI choices (e.g. expert vs simple
 * trade mode), default copy-trade allocation. All localStorage-backed
 * so it works for unauthenticated visitors and survives page reloads.
 *
 * Phase 3.5 will mirror any prefs set while authenticated to Postgres
 * under the user's record; this library is the single source of truth
 * that both paths read through.
 */

import { useEffect, useState } from 'react';

export type RiskProfile = 'conservative' | 'balanced' | 'aggressive';

export interface UserPrefs {
  readonly riskProfile: RiskProfile;
  readonly onboardingComplete: boolean;
  readonly onboardingWallet: string | null;
  readonly preferredTradeMode: 'simple' | 'expert';
  readonly defaultCopyAllocPct: number;
  readonly alertsEnabled: boolean;
}

const DEFAULT_PREFS: UserPrefs = {
  riskProfile: 'balanced',
  onboardingComplete: false,
  onboardingWallet: null,
  preferredTradeMode: 'simple',
  defaultCopyAllocPct: 20,
  alertsEnabled: true,
};

const STORAGE_KEY = 'klub.prefs.v1';

function loadPrefs(): UserPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: UserPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // quota / private browsing
  }
}

/**
 * React hook for reading + updating user prefs. Returns the current
 * prefs and a setter that merges partial updates.
 */
export function useUserPrefs(): {
  readonly prefs: UserPrefs;
  readonly setPrefs: (update: Partial<UserPrefs>) => void;
  readonly ready: boolean;
} {
  const [prefs, setPrefsState] = useState<UserPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefsState(loadPrefs());
    setReady(true);
  }, []);

  function setPrefs(update: Partial<UserPrefs>): void {
    setPrefsState((prev) => {
      const next = { ...prev, ...update };
      savePrefs(next);
      return next;
    });
  }

  return { prefs, setPrefs, ready };
}

/**
 * Risk-profile presets. Derived leverage + allocation caps for each.
 * Used as safe defaults throughout the app.
 */
export const RISK_PRESETS: Record<
  RiskProfile,
  {
    readonly label: string;
    readonly description: string;
    readonly maxLeverage: number;
    readonly defaultLeverage: number;
    readonly defaultStopDistancePct: number;
    readonly maxCopyAllocPct: number;
  }
> = {
  conservative: {
    label: 'Conservative',
    description: 'Low leverage, tight stops, max 20% into any one position. Slow and steady.',
    maxLeverage: 5,
    defaultLeverage: 2,
    defaultStopDistancePct: 3,
    maxCopyAllocPct: 20,
  },
  balanced: {
    label: 'Balanced',
    description: 'Moderate leverage, standard stops. Default for most retail.',
    maxLeverage: 15,
    defaultLeverage: 5,
    defaultStopDistancePct: 5,
    maxCopyAllocPct: 35,
  },
  aggressive: {
    label: 'Aggressive',
    description: 'Higher leverage, wider stops. For experienced traders only.',
    maxLeverage: 30,
    defaultLeverage: 10,
    defaultStopDistancePct: 8,
    maxCopyAllocPct: 60,
  },
};
