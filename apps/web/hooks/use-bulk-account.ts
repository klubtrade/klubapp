'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useBulkAccount — fetch a user's Bulk account snapshot.
 *
 * Calls `/api/bulk/account`, which proxies to Bulk's `POST /account`
 * with `{type: 'fullAccount', user}`. No signature required — this is
 * a read-only query keyed off the pubkey.
 *
 * State shape:
 *   - `loading`  — first fetch is in flight and we have no data yet
 *   - `error`    — last fetch failed; `data` may still hold stale value
 *   - `data`     — the normalized account snapshot (or null if never fetched)
 *   - `refresh()` — imperative re-fetch for manual pulls
 *
 * We poll every 15 seconds while `pubkey` is non-null so the balance
 * doesn't go stale when the user leaves the menu open. Cancels
 * cleanly on unmount or pubkey change.
 *
 * Bulk's response shape isn't fully documented (see
 * `docs/bulk-integration-notes.md`). We probe several plausible field
 * names for equity/USDC rather than asserting one. If all probes miss,
 * `data.equityUsd` stays null and the UI shows "—" instead of crashing.
 */

/**
 * A single open position returned in `fullAccount.positions`.
 *
 * Field names verified against real Bulk testnet response Apr 2026.
 * Size can be negative (short). Notional is size × price (signed).
 *
 * Other fields present in the response but not yet typed here
 * (leverage, liquidationPrice, margin, pnl breakdowns) will be added
 * as we use them. Right now we surface only what the positions table
 * needs to render.
 */
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

/**
 * A single resting order returned in `fullAccount.openOrders`.
 * Shape still to be verified — we're currently surfacing zero open
 * orders in test data.
 */
export interface BulkOpenOrder {
  readonly orderId: string;
  readonly symbol: string;
  readonly isBuy: boolean;
  readonly sizeBase: number;
  readonly price: number;
  readonly tif: string | null;
  readonly raw: Record<string, unknown>;
}

/**
 * Sub-account row returned in `fullAccount.subAccounts` (Bulk v1.0.14,
 * 28 Apr 2026). Each child sub-account is identified by pubkey and
 * carries an optional name. KLUB uses these as on-chain "pots" — Cash,
 * Trading, per-leader copy-trade pools.
 */
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
   * Account kind — `MasterEOA` for the user's primary wallet, or
   * `SubAccount` if they're querying a sub-account directly. v1.0.14+.
   * `null` for older Bulk responses.
   */
  readonly kind: 'MasterEOA' | 'SubAccount' | null;
  /** Parent pubkey if this is a sub-account, else null. */
  readonly parent: string | null;
  /**
   * Sub-accounts owned by this master account. Empty if none or if the
   * Bulk response predates v1.0.14.
   */
  readonly subAccounts: readonly BulkSubAccount[];
  /** Raw response kept for debugging. */
  readonly raw: unknown;
}

export type BulkAccountState =
  | { readonly status: 'idle'; readonly data: null; readonly error: null }
  | { readonly status: 'loading'; readonly data: BulkAccountSnapshot | null; readonly error: null }
  | { readonly status: 'ready'; readonly data: BulkAccountSnapshot; readonly error: null }
  | { readonly status: 'error'; readonly data: BulkAccountSnapshot | null; readonly error: string };

const POLL_INTERVAL_MS = 15_000;

export function useBulkAccount(pubkey: string | null): {
  readonly state: BulkAccountState;
  readonly refresh: () => void;
} {
  const [state, setState] = useState<BulkAccountState>({
    status: 'idle',
    data: null,
    error: null,
  });

  const fetchAccount = useCallback(
    async (key: string, signal: AbortSignal): Promise<void> => {
      setState((prev) => ({
        status: 'loading',
        data: prev.data,
        error: null,
      }));

      let response: Response;
      try {
        response = await fetch('/api/bulk/account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: key }),
          signal,
        });
      } catch (err) {
        if (signal.aborted) return;
        setState((prev) => ({
          status: 'error',
          data: prev.data,
          error: err instanceof Error ? err.message : 'Network error',
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
          status: 'error',
          data: prev.data,
          error: extractMessage(raw) ?? `HTTP ${response.status}`,
        }));
        return;
      }

      const snapshot = normalizeAccount(raw);
      setState({ status: 'ready', data: snapshot, error: null });
    },
    [],
  );

  useEffect(() => {
    if (!pubkey) {
      setState({ status: 'idle', data: null, error: null });
      return;
    }

    const controller = new AbortController();
    void fetchAccount(pubkey, controller.signal);

    const interval = window.setInterval(() => {
      void fetchAccount(pubkey, controller.signal);
    }, POLL_INTERVAL_MS);

    return () => {
      controller.abort();
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

/**
 * Bulk's `/account` response (verified by observation, Apr 2026):
 *
 *   {
 *     fullAccount: {
 *       margin: { total, free, available, unrealized, ... },
 *       positions: [...],
 *       openOrders: [...],
 *       leverageSettings: [...]
 *     }
 *   }
 *
 * We unwrap `fullAccount`, then probe `margin.*` for the dollar
 * values. If the actual field names inside `margin` don't match our
 * probes, we log the unwrapped object so the next iteration knows
 * what to add.
 */
function normalizeAccount(raw: unknown): BulkAccountSnapshot {
  // Unwrap the envelope. Supports three shapes, most-specific first:
  //   1. `{fullAccount: {...}}` — observed actual response
  //   2. `[{...}]` — documented pattern for some endpoints
  //   3. `{...}` — fallback if Bulk ever flattens
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
  let stage2: unknown = stage1;
  if (stage2 && typeof stage2 === 'object' && 'fullAccount' in (stage2 as object)) {
    stage2 = (stage2 as Record<string, unknown>)['fullAccount'];
  }
  const acct = (stage2 ?? {}) as Record<string, unknown>;
  const margin = readObject(acct, 'margin') ?? {};

  // Field names verified against a real Bulk testnet /account
  // response (Apr 2026). The margin sub-object uses `totalBalance`,
  // `availableBalance`, and `unrealizedPnl`. Other plausible names
  // retained as fallbacks in case the schema evolves.
  const equityUsd =
    readNumber(margin['totalBalance']) ??
    readNumber(margin['total']) ??
    readNumber(margin['accountValue']) ??
    readNumber(margin['equity']) ??
    readNumber(margin['totalValue']) ??
    readNumber(acct['equity']) ??
    readNumber(acct['accountValue']) ??
    null;

  const unrealizedPnlUsd =
    readNumber(margin['unrealizedPnl']) ??
    readNumber(margin['unrealized']) ??
    readNumber(margin['upnl']) ??
    null;

  const freeMarginUsd =
    readNumber(margin['availableBalance']) ??
    readNumber(margin['free']) ??
    readNumber(margin['available']) ??
    readNumber(margin['availableMargin']) ??
    readNumber(margin['freeMargin']) ??
    null;

  // If ALL margin probes missed, log the unwrapped shape so we can see
  // the actual field names inside `margin`. One-shot log per shape to
  // avoid spamming the 15s polling loop.
  if (equityUsd === null && unrealizedPnlUsd === null && freeMarginUsd === null) {
    warnOnceForShape(acct);
  }

  const positions = parsePositions(acct['positions']);
  const openOrders = parseOpenOrders(acct['openOrders']);
  const kind = parseKind(acct['kind']);
  const parent = typeof acct['parent'] === 'string' ? acct['parent'] : null;
  const subAccounts = parseSubAccounts(acct['subAccounts']);

  return {
    equityUsd,
    unrealizedPnlUsd,
    freeMarginUsd,
    positions,
    openOrders,
    kind,
    parent,
    subAccounts,
    raw,
  };
}

function parseKind(v: unknown): 'MasterEOA' | 'SubAccount' | null {
  if (v === 'MasterEOA' || v === 'SubAccount') return v;
  return null;
}

/**
 * Parse `fullAccount.subAccounts`. Bulk v1.0.14 returns
 * `[{pubkey, name?}, ...]`. We accept either field key for `name`
 * (`name` or `label`) and filter out rows missing a pubkey.
 */
function parseSubAccounts(raw: unknown): readonly BulkSubAccount[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkSubAccount[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const pubkey = typeof r['pubkey'] === 'string' ? r['pubkey'] : null;
    if (!pubkey) continue;
    const nameRaw = r['name'] ?? r['label'];
    const name = typeof nameRaw === 'string' && nameRaw.length > 0 ? nameRaw : null;
    out.push({ pubkey, name });
  }
  return out;
}

/**
 * Parse the `positions` array. Each item looks like:
 *   { symbol, size, price, fairPrice, notional, ... }
 *
 * Size is signed (negative = short). We rename size → sizeBase and
 * price → entryPrice for clarity downstream, and try to surface an
 * unrealizedPnl field if Bulk includes one. If the inner field names
 * differ from what we probe, the affected record's values become
 * null/0 rather than throwing — the UI handles that gracefully.
 */
function parsePositions(raw: unknown): readonly BulkPosition[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkPosition[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const symbol = typeof r['symbol'] === 'string' ? r['symbol'] : null;
    if (!symbol) continue;

    // Size — per verified response field is `size`; fallbacks for
    // future Bulk renames.
    const sizeBase =
      readNumber(r['size']) ??
      readNumber(r['sz']) ??
      readNumber(r['sizeBase']) ??
      0;
    // Entry price — verified as `price`; some exchanges use
    // avgEntryPrice or entry.
    const entryPrice =
      readNumber(r['price']) ??
      readNumber(r['entryPrice']) ??
      readNumber(r['avgEntry']) ??
      0;
    // Mark/fair — verified as `fairPrice`.
    const fairPrice =
      readNumber(r['fairPrice']) ??
      readNumber(r['markPrice']) ??
      readNumber(r['mark']) ??
      entryPrice;
    // Notional — verified field name; recompute if missing.
    const notionalUsd =
      readNumber(r['notional']) ??
      (Number.isFinite(sizeBase) && Number.isFinite(entryPrice)
        ? sizeBase * entryPrice
        : 0);
    // Unrealized pnl is not shown as a single field in the item
    // we've seen — it's probably computed from sizeBase×(fairPrice−entryPrice).
    // Still probe first, in case Bulk adds it.
    const probed =
      readNumber(r['unrealizedPnl']) ??
      readNumber(r['upnl']) ??
      readNumber(r['pnl']) ??
      null;
    const unrealizedPnlUsd =
      probed ??
      (Number.isFinite(sizeBase) && Number.isFinite(fairPrice) && Number.isFinite(entryPrice)
        ? sizeBase * (fairPrice - entryPrice)
        : null);

    out.push({
      symbol,
      sizeBase,
      entryPrice,
      fairPrice,
      notionalUsd,
      unrealizedPnlUsd,
      raw: r,
    });
  }
  return out;
}

/**
 * Parse the `openOrders` array. We don't have real field names yet
 * (user's test account has zero resting orders), so this is best-effort
 * — probes common names and falls back to null/empty. When we see
 * real open-order data we'll lock the field names in.
 */
function parseOpenOrders(raw: unknown): readonly BulkOpenOrder[] {
  if (!Array.isArray(raw)) return [];
  const out: BulkOpenOrder[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const symbol = typeof r['symbol'] === 'string' ? r['symbol'] : null;
    if (!symbol) continue;

    const orderId =
      (typeof r['orderId'] === 'string' && r['orderId']) ||
      (typeof r['oid'] === 'string' && r['oid']) ||
      (typeof r['id'] === 'string' && r['id']) ||
      '';

    const sizeBase = readNumber(r['size']) ?? readNumber(r['sz']) ?? 0;
    const price = readNumber(r['price']) ?? readNumber(r['px']) ?? 0;
    // is_buy / side — signed size is a common encoding, so fall back
    // to sign check.
    const isBuyRaw = r['isBuy'] ?? r['b'] ?? r['buy'];
    const isBuy =
      typeof isBuyRaw === 'boolean' ? isBuyRaw : sizeBase >= 0;
    const tif =
      (typeof r['tif'] === 'string' && r['tif']) ||
      (typeof r['timeInForce'] === 'string' && r['timeInForce']) ||
      null;

    out.push({
      orderId,
      symbol,
      isBuy,
      sizeBase: Math.abs(sizeBase),
      price,
      tif,
      raw: r,
    });
  }
  return out;
}

const warnedShapes = new Set<string>();
function warnOnceForShape(raw: unknown): void {
  try {
    const shape = raw && typeof raw === 'object' ? Object.keys(raw).sort().join(',') : typeof raw;
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
      jsonStr = '(not JSON-serializable)';
    }
    // eslint-disable-next-line no-console
    console.warn(
      '[useBulkAccount] No known field in response. Paste the JSON below to get balance probes updated:\n' +
        jsonStr,
    );
    // eslint-disable-next-line no-console
    console.warn('[useBulkAccount] Same data as live object:', raw);
  } catch {
    // swallow
  }
}

function readNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readObject(r: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = r[key];
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function extractMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['error'] === 'string') return r['error'];
  if (typeof r['detail'] === 'string') return r['detail'];
  if (typeof r['message'] === 'string') return r['message'];
  return null;
}