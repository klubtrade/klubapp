/* eslint-disable no-console */

import type {
  BulkWebSocket,
  Pubkey,
  TradeUpdate,
  WSTransportConstructor,
} from "@klub/api-client";
import { BulkClient, getExchangeInfo, queryUserFills } from "@klub/api-client";
import { leaderCandidates, type Db } from "@klub/db";
import { desc, eq } from "drizzle-orm";
import WebSocket from "ws";

import { runLeaderIndexerOnce } from "./leader-indexer.js";

const DEFAULT_SYMBOLS = [
  "BTC-USD",
  "ETH-USD",
  "SOL-USD",
  "BNB-USD",
  "XRP-USD",
  "DOGE-USD",
  "SUI-USD",
  "ZEC-USD",
  "FARTCOIN-USD",
  "MINIMAX-USD",
  "MU-USD",
] as const;
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,128}$/;
const MAX_TRACKED_CANDIDATES = 2_000;
const CANDIDATE_TTL_MS = 24 * 60 * 60 * 1_000;

export interface RunningLeaderDiscovery {
  readonly candidateCount: () => number;
  readonly close: () => void;
}

export async function startLeaderDiscovery({
  db,
  intervalMs = 15 * 60 * 1_000,
  maxCandidatesPerRun = 40,
  logger = console,
}: {
  readonly db: Db;
  readonly intervalMs?: number;
  readonly maxCandidatesPerRun?: number;
  readonly logger?: Pick<Console, "error" | "log" | "warn">;
}): Promise<RunningLeaderDiscovery> {
  const { BulkWebSocket: BulkWebSocketCtor } = await import("@klub/api-client");
  const stream = createStream(BulkWebSocketCtor);
  const candidates = new Map<Pubkey, number>();
  const strategyAccount = process.env.BASIS_BULK_STRATEGY_ACCOUNT?.trim();
  if (strategyAccount && PUBKEY_RE.test(strategyAccount)) {
    candidates.set(strategyAccount, Date.now());
  }
  const symbols = await symbolsForDiscovery(logger);
  const unsubs = symbols.map((symbol) =>
    stream.onTrades(symbol, (trades) => {
      recordCandidates(candidates, trades);
    }),
  );
  let indexing = false;

  const index = async () => {
    if (indexing) return;
    indexing = true;
    try {
      await persistCandidates(db, candidates);
      const stored = await db
        .select({ pubkey: leaderCandidates.pubkey })
        .from(leaderCandidates)
        .orderBy(desc(leaderCandidates.observedAt))
        .limit(maxCandidatesPerRun);
      let pubkeys = [
        ...new Set([
          ...[...candidates.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxCandidatesPerRun)
            .map(([pubkey]) => pubkey),
          ...stored.map((row) => row.pubkey),
        ]),
      ].slice(0, maxCandidatesPerRun);
      if (pubkeys.length === 0) return;
      await expandFromObservedFills(candidates, pubkeys.slice(0, 5));
      await persistCandidates(db, candidates);
      pubkeys = [
        ...new Set([
          ...pubkeys,
          ...[...candidates.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([pubkey]) => pubkey),
        ]),
      ].slice(0, maxCandidatesPerRun);
      const summaries = await runLeaderIndexerOnce({
        db,
        leaderPubkeys: pubkeys,
      });
      logger.log(
        `[leader-discovery] scored ${summaries.length} observed Bulk accounts`,
      );
      await Promise.all(
        summaries.map((summary) =>
          db
            .update(leaderCandidates)
            .set({ lastIndexedAt: new Date(), updatedAt: new Date() })
            .where(eq(leaderCandidates.pubkey, summary.leaderPubkey)),
        ),
      );
    } catch (error) {
      logger.error("[leader-discovery] indexing failed", error);
    } finally {
      indexing = false;
    }
  };

  stream.connect();
  const firstRun = setTimeout(() => void index(), 60_000);
  const timer = setInterval(() => void index(), intervalMs);

  return {
    candidateCount: () => candidates.size,
    close: () => {
      clearTimeout(firstRun);
      clearInterval(timer);
      for (const unsubscribe of unsubs) unsubscribe();
      stream.disconnect();
    },
  };
}

async function expandFromObservedFills(
  candidates: Map<Pubkey, number>,
  accounts: readonly Pubkey[],
) {
  const client = new BulkClient({
    baseUrl:
      process.env.BULK_HTTP_URL ??
      process.env.BULK_API_URL ??
      "https://exchange-api.bulk.trade/api/v1",
  });
  const histories = await Promise.allSettled(
    accounts.map((account) => queryUserFills(client, account)),
  );
  const now = Date.now();
  for (const history of histories) {
    if (history.status !== "fulfilled") continue;
    for (const fill of history.value) {
      if (PUBKEY_RE.test(fill.maker)) candidates.set(fill.maker, now);
      if (PUBKEY_RE.test(fill.taker)) candidates.set(fill.taker, now);
    }
  }
}

export function recordCandidates(
  candidates: Map<Pubkey, number>,
  trades: readonly Pick<TradeUpdate, "maker" | "taker" | "time">[],
): void {
  const cutoff = Date.now() - CANDIDATE_TTL_MS;
  for (const [pubkey, observedAt] of candidates) {
    if (observedAt < cutoff) candidates.delete(pubkey);
  }
  for (const trade of trades) {
    const observedAt = normalizeTimestamp(trade.time);
    if (PUBKEY_RE.test(trade.maker)) candidates.set(trade.maker, observedAt);
    if (PUBKEY_RE.test(trade.taker)) candidates.set(trade.taker, observedAt);
  }
  if (candidates.size > MAX_TRACKED_CANDIDATES) {
    const oldest = [...candidates.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, candidates.size - MAX_TRACKED_CANDIDATES);
    for (const [pubkey] of oldest) candidates.delete(pubkey);
  }
}

function createStream(Ctor: typeof BulkWebSocket): BulkWebSocket {
  return new Ctor({
    url: process.env.BULK_WS_URL ?? "wss://exchange-ws1.bulk.trade",
    WebSocketImpl: WebSocket as unknown as WSTransportConstructor,
    log: (message, meta) => {
      if (process.env.LOG_LEVEL === "debug") console.log(message, meta);
    },
  });
}

function symbolsFromEnv(): readonly string[] {
  const configured = process.env.LEADER_DISCOVERY_SYMBOLS;
  if (!configured) return DEFAULT_SYMBOLS;
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function symbolsForDiscovery(
  logger: Pick<Console, "warn">,
): Promise<readonly string[]> {
  const configured = symbolsFromEnv();
  if (process.env.LEADER_DISCOVERY_SYMBOLS) return configured;
  try {
    const client = new BulkClient({
      baseUrl:
        process.env.BULK_HTTP_URL ??
        process.env.BULK_API_URL ??
        "https://exchange-api.bulk.trade/api/v1",
    });
    const info = await getExchangeInfo(client);
    const active = info
      .filter((symbol) => symbol.status === "TRADING")
      .map((symbol) => symbol.symbol);
    return active.length > 0 ? active : configured;
  } catch (error) {
    logger.warn(
      "[leader-discovery] exchangeInfo unavailable; using fallback",
      error,
    );
    return configured;
  }
}

async function persistCandidates(
  db: Db,
  candidates: ReadonlyMap<Pubkey, number>,
) {
  await Promise.all(
    [...candidates.entries()].map(([pubkey, observedAt]) =>
      db
        .insert(leaderCandidates)
        .values({ pubkey, observedAt: new Date(observedAt) })
        .onConflictDoUpdate({
          target: leaderCandidates.pubkey,
          set: { observedAt: new Date(observedAt), updatedAt: new Date() },
        }),
    ),
  );
}

function normalizeTimestamp(value: number): number {
  if (value > 1_000_000_000_000_000) return Math.floor(value / 1_000_000);
  if (value < 1_000_000_000_000) return value * 1_000;
  return value;
}
