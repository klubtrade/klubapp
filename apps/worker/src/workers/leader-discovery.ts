/* eslint-disable no-console */

import type {
  BulkWebSocket,
  Pubkey,
  TradeUpdate,
  WSTransportConstructor,
} from "@klub/api-client";
import type { Db } from "@klub/db";
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
  const unsubs = symbolsFromEnv().map((symbol) =>
    stream.onTrades(symbol, (trades) => {
      recordCandidates(candidates, trades);
    }),
  );
  let indexing = false;

  const index = async () => {
    if (indexing || candidates.size === 0) return;
    indexing = true;
    try {
      const pubkeys = [...candidates.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxCandidatesPerRun)
        .map(([pubkey]) => pubkey);
      const summaries = await runLeaderIndexerOnce({
        db,
        leaderPubkeys: pubkeys,
      });
      logger.log(
        `[leader-discovery] scored ${summaries.length} observed Bulk accounts`,
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

function normalizeTimestamp(value: number): number {
  if (value > 1_000_000_000_000_000) return Math.floor(value / 1_000_000);
  if (value < 1_000_000_000_000) return value * 1_000;
  return value;
}
