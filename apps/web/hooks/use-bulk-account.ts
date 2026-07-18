"use client";

import { useCallback, useEffect, useState } from "react";

import { authenticatedFetch } from "@/lib/authenticated-fetch";
import {
  loadCachedSnapshot,
  parseKind,
  parseOpenOrders,
  parsePositions,
  parseSubAccounts,
  saveCachedSnapshot,
  snapshotFromAccountUpdate,
} from "@/lib/bulk/account-snapshot";
import { normalizeBulkErrorMessage } from "@/lib/bulk/error-messages";
import { marketData } from "@/lib/market-data/client";

export interface BulkPosition {
  readonly symbol: string;
  /** Base-asset size. Negative for short. */
  readonly sizeBase: number;
  /** Average entry price. */
  readonly entryPrice: number;
  /** Latest mark/fair price Bulk uses for MTM. */
  readonly fairPrice: number;
  /** Signed notional (size × entry price). */
  readonly notionalUsd: number;
  /** Live unrealized PnL. Null if not surfaced. */
  readonly unrealizedPnlUsd: number | null;
  /** Raw kept for fields we haven't surfaced yet. */
  readonly raw: Record<string, unknown>;
}

export interface BulkOpenOrder {
  readonly orderId: string;
  readonly symbol: string;
  readonly isBuy: boolean;
  readonly sizeBase: number;
  readonly price: number;
  readonly tif: string | null;
  readonly raw: Record<string, unknown>;
}

export interface BulkSubAccount {
  readonly pubkey: string;
  readonly name: string | null;
}

export interface BulkAccountSnapshot {
  /** Equity / collateral in USD-equivalent (mock USDC on testnet). */
  readonly equityUsd: number | null;
  /** Unsettled PnL across open positions, USD. Null if not surfaced. */
  readonly unrealizedPnlUsd: number | null;
  /** Free margin available for new orders, USD. Null if not surfaced. */
  readonly freeMarginUsd: number | null;
  /** Parsed open positions. Empty array if none or if parse failed. */
  readonly positions: readonly BulkPosition[];
  /** Parsed resting orders. Empty array if none or if parse failed. */
  readonly openOrders: readonly BulkOpenOrder[];
  /**
   * Account kind - `MasterEOA` for the user's primary wallet, or
   * `SubAccount` if they're querying a sub-account directly. v1.0.14+.
   * `null` for older Bulk responses.
   */
  readonly kind: "MasterEOA" | "SubAccount" | null;
  /** Parent pubkey if this is a sub-account, else null. */
  readonly parent: string | null;
  /**
   * Sub-accounts owned by this master account. Empty if none or if the
   * Bulk response predates v1.0.14.
   */
  readonly subAccounts: readonly BulkSubAccount[];
  /** True when the server returned an app-safe degraded snapshot. */
  readonly unavailable: boolean;
  /** True when the UI is showing a last-known snapshot while REST catches up. */
  readonly stale: boolean;
  /** Calm user-facing message for degraded snapshots. */
  readonly warning: string | null;
  /** Raw response kept for debugging. */
  readonly raw: unknown;
}

export type BulkAccountState =
  | { readonly status: "idle"; readonly data: null; readonly error: null }
  | {
      readonly status: "loading";
      readonly data: BulkAccountSnapshot | null;
      readonly error: null;
    }
  | {
      readonly status: "ready";
      readonly data: BulkAccountSnapshot;
      readonly error: null;
    }
  | {
      readonly status: "error";
      readonly data: BulkAccountSnapshot | null;
      readonly error: string;
    };

const POLL_INTERVAL_MS = 15_000;

export function useBulkAccount(pubkey: string | null): {
  readonly state: BulkAccountState;
  readonly refresh: () => void;
} {
  const [state, setState] = useState<BulkAccountState>({
    status: "idle",
    data: null,
    error: null,
  });

  const fetchAccount = useCallback(
    async (key: string, signal: AbortSignal): Promise<void> => {
      setState((prev) => ({
        status: "loading",
        data: prev.data,
        error: null,
      }));

      let response: Response;
      try {
        response = await authenticatedFetch("/api/bulk/account", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: key }),
          signal,
        });
      } catch (err) {
        if (signal.aborted) return;
        setState((prev) => ({
          status: "error",
          data: prev.data,
          error: normalizeBulkErrorMessage(
            err instanceof Error ? err.message : "Network error",
          ),
        }));
        return;
      }

      if (signal.aborted) return;

      let raw: unknown = null;
      try {
        raw = await response.json();
      } catch {
        raw = null;
      }

      if (!response.ok) {
        setState((prev) => ({
          status: "error",
          data: prev.data,
          error: normalizeBulkErrorMessage(
            extractMessage(raw) ??
              rawToString(raw) ??
              `HTTP ${response.status}`,
            response.status,
          ),
        }));
        return;
      }

      const snapshot = normalizeAccount(raw);
      setState((previous) => {
        if (
          snapshot.unavailable &&
          previous.data &&
          !previous.data.unavailable
        ) {
          return {
            status: "ready",
            data: {
              ...previous.data,
              stale: true,
              warning:
                "Account sync is delayed. Showing your last saved balance.",
            },
            error: null,
          };
        }
        if (!snapshot.unavailable) saveCachedSnapshot(key, snapshot);
        return { status: "ready", data: snapshot, error: null };
      });
    },
    [],
  );

  useEffect(() => {
    if (!pubkey) {
      setState({ status: "idle", data: null, error: null });
      return;
    }

    const cached = loadCachedSnapshot(pubkey);
    if (cached) {
      setState({
        status: "ready",
        data: {
          ...cached,
          stale: true,
          warning: "Account sync is delayed. Showing your last saved balance.",
        },
        error: null,
      });
    }

    const unsubscribeAccount = marketData.onAccount(pubkey, (update) => {
      setState((previous) => {
        const snapshot = snapshotFromAccountUpdate(update, previous.data);
        saveCachedSnapshot(pubkey, snapshot);
        return { status: "ready", data: snapshot, error: null };
      });
    });

    const controller = new AbortController();
    void fetchAccount(pubkey, controller.signal);

    const interval = window.setInterval(() => {
      void fetchAccount(pubkey, controller.signal);
    }, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      unsubscribeAccount();
      window.clearInterval(interval);
    };
  }, [pubkey, fetchAccount]);

  const refresh = useCallback(() => {
    if (!pubkey) return;
    const controller = new AbortController();
    void fetchAccount(pubkey, controller.signal);
  }, [pubkey, fetchAccount]);

  return { state, refresh };
}

function normalizeAccount(raw: unknown): BulkAccountSnapshot {
  // Unwrap the envelope. Supports three shapes, most-specific first:
  //   1. `{fullAccount: {...}}` - observed actual response
  //   2. `[{...}]` - documented pattern for some endpoints
  //   3. `{...}` - fallback if Bulk ever flattens
  // Two-stage unwrap, in order:
  //   Stage 1: if response is an array, take first element
  //            (Bulk's /account has been observed returning both
  //             `{fullAccount: {...}}` and `[{fullAccount: {...}}]`
  //             depending on caller context; normalize here).
  //   Stage 2: if that object has `fullAccount`, unwrap it.
  //   Stage 3: fall through to treating the object itself as
  //            the account if neither wrap is present.
  let stage1: unknown = raw;
  if (Array.isArray(stage1) && stage1.length >= 1) {
    stage1 = stage1[0];
  }
  const envelope =
    stage1 && typeof stage1 === "object"
      ? (stage1 as Record<string, unknown>)
      : {};
  let stage2: unknown = stage1;
  if (
    stage2 &&
    typeof stage2 === "object" &&
    "fullAccount" in (stage2 as object)
  ) {
    stage2 = (stage2 as Record<string, unknown>)["fullAccount"];
  }
  const acct = (stage2 ?? {}) as Record<string, unknown>;
  const margin = readObject(acct, "margin") ?? {};

  // Field names verified against a real Bulk testnet /account
  // response (Apr 2026). The margin sub-object uses `totalBalance`,
  // `availableBalance`, and `unrealizedPnl`. Other plausible names
  // retained as fallbacks in case the schema evolves.
  const equityUsd =
    readNumber(margin["totalBalance"]) ??
    readNumber(margin["total"]) ??
    readNumber(margin["accountValue"]) ??
    readNumber(margin["equity"]) ??
    readNumber(margin["totalValue"]) ??
    readNumber(acct["equity"]) ??
    readNumber(acct["accountValue"]) ??
    null;

  const unrealizedPnlUsd =
    readNumber(margin["unrealizedPnl"]) ??
    readNumber(margin["unrealized"]) ??
    readNumber(margin["upnl"]) ??
    null;

  const freeMarginUsd =
    readNumber(margin["availableBalance"]) ??
    readNumber(margin["free"]) ??
    readNumber(margin["available"]) ??
    readNumber(margin["availableMargin"]) ??
    readNumber(margin["freeMargin"]) ??
    null;

  // If ALL margin probes missed, log the unwrapped shape so we can see
  // the actual field names inside `margin`. One-shot log per shape to
  // avoid spamming the 15s polling loop.
  if (
    equityUsd === null &&
    unrealizedPnlUsd === null &&
    freeMarginUsd === null
  ) {
    warnOnceForShape(acct);
  }

  const positions = parsePositions(acct["positions"]);
  const openOrders = parseOpenOrders(acct["openOrders"]);
  const kind = parseKind(acct["kind"]);
  const parent = typeof acct["parent"] === "string" ? acct["parent"] : null;
  const subAccounts = parseSubAccounts(acct["subAccounts"]);
  const unavailable = envelope["unavailable"] === true;
  const warning = unavailable
    ? normalizeBulkErrorMessage(
        extractMessage(envelope) ?? "Bulk exchange is temporarily unavailable.",
      )
    : null;

  return {
    equityUsd,
    unrealizedPnlUsd,
    freeMarginUsd,
    positions,
    openOrders,
    kind,
    parent,
    subAccounts,
    unavailable,
    stale: unavailable,
    warning,
    raw,
  };
}

const warnedShapes = new Set<string>();
function warnOnceForShape(raw: unknown): void {
  try {
    const shape =
      raw && typeof raw === "object"
        ? Object.keys(raw).sort().join(",")
        : typeof raw;
    if (warnedShapes.has(shape)) return;
    warnedShapes.add(shape);
    // Log as JSON string AND as a live object. The string shows up
    // copy-pasteable in console logs; the live object lets devs
    // expand it interactively. Either form is enough to update our
    // field probes.
    let jsonStr: string;
    try {
      jsonStr = JSON.stringify(raw, null, 2);
    } catch {
      jsonStr = "(not JSON-serializable)";
    }
    // eslint-disable-next-line no-console
    console.warn(
      "[useBulkAccount] No known field in response. Paste the JSON below to get balance probes updated:\n" +
        jsonStr,
    );
    // eslint-disable-next-line no-console
    console.warn("[useBulkAccount] Same data as live object:", raw);
  } catch {
    // swallow
  }
}

function readNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readObject(
  r: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const v = r[key];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function extractMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["error"] === "string") return r["error"];
  if (typeof r["detail"] === "string") return r["detail"];
  if (typeof r["message"] === "string") return r["message"];
  return null;
}

function rawToString(raw: unknown): string | null {
  if (typeof raw === "string") return raw;
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}
