import type { AccountUpdate } from "@klub/api-client";

import type {
  BulkAccountSnapshot,
  BulkOpenOrder,
  BulkPosition,
  BulkSubAccount,
} from "@/hooks/use-bulk-account";

export function snapshotFromAccountUpdate(
  update: AccountUpdate,
  previous: BulkAccountSnapshot | null,
): BulkAccountSnapshot {
  const positions: BulkPosition[] = update.positions.map((position) => ({
    symbol: position.s,
    sizeBase: position.sz,
    entryPrice: position.entryPx,
    fairPrice: position.markPx,
    notionalUsd: position.sz * position.entryPx,
    unrealizedPnlUsd: position.unrealizedPnl,
    raw: { ...position },
  }));
  const unrealizedPnlUsd = positions.reduce(
    (total, position) => total + (position.unrealizedPnlUsd ?? 0),
    0,
  );
  return {
    equityUsd: update.equityUsd,
    unrealizedPnlUsd,
    freeMarginUsd:
      previous?.freeMarginUsd ??
      (positions.length === 0 ? update.equityUsd : null),
    positions,
    openOrders: previous?.openOrders ?? [],
    kind: previous?.kind ?? "MasterEOA",
    parent: previous?.parent ?? null,
    subAccounts: previous?.subAccounts ?? [],
    unavailable: false,
    stale: false,
    warning: null,
    raw: update,
  };
}

const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1_000;
const cacheKey = (pubkey: string) =>
  `klub.bulkAccount.v${CACHE_VERSION}.${pubkey}`;

export function saveCachedSnapshot(
  pubkey: string,
  snapshot: BulkAccountSnapshot,
): void {
  try {
    window.localStorage.setItem(
      cacheKey(pubkey),
      JSON.stringify({ savedAt: Date.now(), snapshot }),
    );
  } catch {
    // Private browsing can disable storage. Live data still works.
  }
}

export function loadCachedSnapshot(pubkey: string): BulkAccountSnapshot | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(pubkey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      readonly savedAt?: number;
      readonly snapshot?: BulkAccountSnapshot;
    };
    if (!parsed.snapshot || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > MAX_CACHE_AGE_MS) return null;
    return parsed.snapshot;
  } catch {
    return null;
  }
}

export function parseKind(v: unknown): "MasterEOA" | "SubAccount" | null {
  return v === "MasterEOA" || v === "SubAccount" ? v : null;
}

export function parseSubAccounts(raw: unknown): readonly BulkSubAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): BulkSubAccount[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const pubkey = stringValue(record["pubkey"]);
    if (!pubkey) return [];
    return [{ pubkey, name: stringValue(record["name"] ?? record["label"]) }];
  });
}

export function parsePositions(raw: unknown): readonly BulkPosition[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): BulkPosition[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const symbol = stringValue(record["symbol"]);
    if (!symbol) return [];
    const sizeBase = firstNumber(record, ["size", "sz", "sizeBase"]) ?? 0;
    const entryPrice =
      firstNumber(record, ["price", "entryPrice", "avgEntry"]) ?? 0;
    const fairPrice =
      firstNumber(record, ["fairPrice", "markPrice", "mark"]) ?? entryPrice;
    return [
      {
        symbol,
        sizeBase,
        entryPrice,
        fairPrice,
        notionalUsd: readNumber(record["notional"]) ?? sizeBase * entryPrice,
        unrealizedPnlUsd:
          firstNumber(record, ["unrealizedPnl", "upnl", "pnl"]) ??
          sizeBase * (fairPrice - entryPrice),
        raw: record,
      },
    ];
  });
}

export function parseOpenOrders(raw: unknown): readonly BulkOpenOrder[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): BulkOpenOrder[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const symbol = stringValue(record["symbol"]);
    if (!symbol) return [];
    const signedSize = firstNumber(record, ["size", "sz"]) ?? 0;
    const isBuyRaw = record["isBuy"] ?? record["b"] ?? record["buy"];
    return [
      {
        orderId: firstString(record, ["orderId", "oid", "id"]) ?? "",
        symbol,
        isBuy: typeof isBuyRaw === "boolean" ? isBuyRaw : signedSize >= 0,
        sizeBase: Math.abs(signedSize),
        price: firstNumber(record, ["price", "px"]) ?? 0,
        tif: firstString(record, ["tif", "timeInForce"]),
        raw: record,
      },
    ];
  });
}

function firstNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
