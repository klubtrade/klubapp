"use client";

/**
 * User preferences — server-backed when connected, local fallback otherwise.
 *
 * Risk profile, onboarding status, UI choices (e.g. expert vs simple
 * trade mode), default copy-trade allocation. localStorage remains a fast
 * cache and unauthenticated fallback; `/api/profile` becomes authoritative
 * once a wallet is connected and the production database is configured.
 */

import bs58 from "bs58";
import { useEffect, useState } from "react";

import { useTradingWallet } from "@/lib/trading-wallet";
import {
  DEFAULT_PREFS,
  profileUpdateMessage,
  type ProfilePrefsUpdate,
  type RiskProfile,
  type UserPrefs,
} from "@/lib/profile-contract";

export {
  DEFAULT_PREFS,
  type ProfilePrefsUpdate,
  type RiskProfile,
  type UserPrefs,
};

const STORAGE_KEY = "klub.prefs.v1";
const PREFS_CHANGED_EVENT = "klub:prefs-changed";

function loadPrefs(): UserPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
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
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    window.dispatchEvent(
      new CustomEvent<UserPrefs>(PREFS_CHANGED_EVENT, { detail: prefs }),
    );
  } catch {
    // quota / private browsing
  }
}

function mergeServerPrefs(
  local: UserPrefs,
  server: UserPrefs,
  pubkey: string,
): UserPrefs {
  const localCompletedCurrentWallet =
    local.onboardingComplete && local.onboardingWallet === pubkey;

  if (localCompletedCurrentWallet && !server.onboardingComplete) {
    return {
      ...local,
      ...server,
      onboardingComplete: true,
      onboardingWallet: pubkey,
    };
  }

  return { ...local, ...server };
}

async function loadServerPrefs(pubkey: string): Promise<UserPrefs | null> {
  const res = await fetch(`/api/profile?pubkey=${encodeURIComponent(pubkey)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { prefs?: UserPrefs };
  return body.prefs ?? null;
}

export async function persistUserProfile(input: {
  readonly pubkey: string;
  readonly signMessage: (bytes: Uint8Array) => Promise<Uint8Array>;
  readonly update: ProfilePrefsUpdate;
}): Promise<
  { readonly ok: true } | { readonly ok: false; readonly message: string }
> {
  let signature: Uint8Array;
  try {
    signature = await input.signMessage(
      new TextEncoder().encode(
        profileUpdateMessage({ pubkey: input.pubkey, update: input.update }),
      ),
    );
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Profile signature was rejected",
    };
  }

  try {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pubkey: input.pubkey,
        signature: bs58.encode(signature),
        update: input.update,
      }),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    return {
      ok: false,
      message: body?.message ?? `Profile save failed (${res.status})`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Profile save failed",
    };
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
  const wallet = useTradingWallet();

  useEffect(() => {
    setPrefsState(loadPrefs());
    setReady(true);
  }, []);

  useEffect(() => {
    function onPrefsChanged(event: Event) {
      const detail = (event as CustomEvent<UserPrefs>).detail;
      setPrefsState(detail ?? loadPrefs());
    }

    window.addEventListener(PREFS_CHANGED_EVENT, onPrefsChanged);
    return () => {
      window.removeEventListener(PREFS_CHANGED_EVENT, onPrefsChanged);
    };
  }, []);

  useEffect(() => {
    if (!wallet.ready || !wallet.connected || !wallet.publicKeyBase58) return;
    const pubkey = wallet.publicKeyBase58;
    let cancelled = false;
    void loadServerPrefs(pubkey)
      .then((serverPrefs) => {
        if (cancelled || !serverPrefs) return;
        const next = mergeServerPrefs(loadPrefs(), serverPrefs, pubkey);
        setPrefsState(next);
        savePrefs(next);
      })
      .catch(() => {
        // Local prefs remain usable when the DB is offline or not provisioned.
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.connected, wallet.publicKeyBase58, wallet.ready]);

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
    label: "Conservative",
    description:
      "Low leverage, tight stops, max 20% into any one position. Slow and steady.",
    maxLeverage: 5,
    defaultLeverage: 2,
    defaultStopDistancePct: 3,
    maxCopyAllocPct: 20,
  },
  balanced: {
    label: "Balanced",
    description: "Moderate leverage, standard stops. Default for most retail.",
    maxLeverage: 15,
    defaultLeverage: 5,
    defaultStopDistancePct: 5,
    maxCopyAllocPct: 35,
  },
  aggressive: {
    label: "Aggressive",
    description: "Higher leverage, wider stops. For experienced traders only.",
    maxLeverage: 30,
    defaultLeverage: 10,
    defaultStopDistancePct: 8,
    maxCopyAllocPct: 60,
  },
};
