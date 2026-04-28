/* eslint-disable no-console */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BulkWebSocketConfig,
  FrontendContextRow,
  Symbol,
  WSTransportConstructor,
} from "@klub/api-client";
import WebSocket from "ws";

const DEFAULT_TOP_N = 5;
const DEFAULT_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_SNAPSHOT_TIMEOUT_MS = 10_000;
const HOURS_PER_YEAR = 24 * 365;

export interface FundingRateSnapshot {
  readonly symbol: Symbol;
  /** Bulk frontendContext funding is an hourly percent value. */
  readonly fundingRate: number;
  readonly volume24h: number;
  readonly openInterest: number;
  readonly lastPrice: number;
}

export interface FundingArbOpportunity {
  readonly longSymbol: Symbol;
  readonly shortSymbol: Symbol;
  readonly spread: number;
  readonly fundingRateLong: number;
  readonly fundingRateShort: number;
  readonly estimatedAnnualizedReturn: number;
  readonly longOpenInterest: number;
  readonly shortOpenInterest: number;
  readonly longVolume24h: number;
  readonly shortVolume24h: number;
}

export interface FundingArbDetectorOnceOptions {
  readonly fundingRates?: readonly FundingRateSnapshot[];
  readonly symbols?: readonly Symbol[];
  readonly topN?: number;
  readonly wsUrl?: string;
  readonly snapshotTimeoutMs?: number;
}

export interface FundingArbDetectorOptions extends FundingArbDetectorOnceOptions {
  readonly intervalMs?: number;
  readonly logger?: Pick<Console, "error" | "log" | "warn">;
}

export interface RunningFundingArbDetector {
  readonly intervalMs: number;
  close(): void;
}

export async function runFundingArbDetectorOnce(
  options: FundingArbDetectorOnceOptions = {},
): Promise<readonly FundingArbOpportunity[]> {
  const fundingRates =
    options.fundingRates ??
    (await fetchCurrentFundingRates({
      symbols:
        options.symbols ?? parseSymbolList(process.env["FUNDING_ARB_SYMBOLS"]),
      wsUrl: options.wsUrl ?? createWsUrlFromEnv(),
      timeoutMs: options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_TIMEOUT_MS,
    }));

  return computeFundingArbOpportunities(
    fundingRates,
    options.topN ?? DEFAULT_TOP_N,
  );
}

export function startFundingArbDetector(
  options: FundingArbDetectorOptions = {},
): RunningFundingArbDetector {
  const intervalMs =
    options.intervalMs ??
    parsePositiveInt(process.env["FUNDING_ARB_INTERVAL_MS"]) ??
    DEFAULT_INTERVAL_MS;
  const logger = options.logger ?? console;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      logger.warn(
        "[funding-arb-detector] previous run still active; skipping tick",
      );
      return;
    }

    running = true;
    try {
      const opportunities = await runFundingArbDetectorOnce(options);
      logger.log(
        JSON.stringify(
          {
            worker: "funding-arb-detector",
            scannedAt: new Date().toISOString(),
            opportunities,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      logger.error("[funding-arb-detector] run failed", err);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  return {
    intervalMs,
    close: () => {
      clearInterval(timer);
    },
  };
}

export function computeFundingArbOpportunities(
  fundingRates: readonly FundingRateSnapshot[],
  topN = DEFAULT_TOP_N,
): readonly FundingArbOpportunity[] {
  const opportunities: FundingArbOpportunity[] = [];
  const liquidFundingRates = fundingRates.filter(isLiquidFundingRate);

  for (let i = 0; i < liquidFundingRates.length; i += 1) {
    for (let j = i + 1; j < liquidFundingRates.length; j += 1) {
      const a = liquidFundingRates[i];
      const b = liquidFundingRates[j];
      if (!a || !b) continue;

      const rawSpread = a.fundingRate - b.fundingRate;
      if (rawSpread === 0) continue;

      const shortLeg = rawSpread > 0 ? a : b;
      const longLeg = rawSpread > 0 ? b : a;
      const spread = Math.abs(rawSpread);

      opportunities.push({
        longSymbol: longLeg.symbol,
        shortSymbol: shortLeg.symbol,
        spread: roundTo(spread, 8),
        fundingRateLong: roundTo(longLeg.fundingRate, 8),
        fundingRateShort: roundTo(shortLeg.fundingRate, 8),
        estimatedAnnualizedReturn: roundTo(spread * HOURS_PER_YEAR, 4),
        longOpenInterest: roundTo(longLeg.openInterest, 2),
        shortOpenInterest: roundTo(shortLeg.openInterest, 2),
        longVolume24h: roundTo(longLeg.volume24h, 2),
        shortVolume24h: roundTo(shortLeg.volume24h, 2),
      });
    }
  }

  return opportunities
    .sort((a, b) => b.spread - a.spread)
    .slice(0, Math.max(0, topN));
}

function isLiquidFundingRate(row: FundingRateSnapshot): boolean {
  return (
    Number.isFinite(row.fundingRate) &&
    Number.isFinite(row.volume24h) &&
    row.volume24h > 0 &&
    Number.isFinite(row.openInterest) &&
    row.openInterest > 0
  );
}

export async function fetchCurrentFundingRates({
  symbols,
  wsUrl,
  timeoutMs = DEFAULT_SNAPSHOT_TIMEOUT_MS,
}: {
  readonly symbols?: readonly Symbol[];
  readonly wsUrl?: string;
  readonly timeoutMs?: number;
} = {}): Promise<readonly FundingRateSnapshot[]> {
  const { BulkWebSocket } = await import("@klub/api-client");
  const wantedSymbols =
    symbols && symbols.length > 0 ? new Set(symbols) : undefined;
  const wsConfig: BulkWebSocketConfig = {
    WebSocketImpl: WebSocket as unknown as WSTransportConstructor,
    ...(wsUrl ? { url: wsUrl } : {}),
  };
  const ws = new BulkWebSocket(wsConfig);

  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const timer = setTimeout(() => {
      cleanup();
      rejectPromise(
        new Error(
          `Timed out waiting ${timeoutMs}ms for Bulk frontendContext funding snapshot.`,
        ),
      );
    }, timeoutMs);

    const cleanup = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      ws.disconnect();
    };

    unsubscribe = ws.onFrontendContext((rows) => {
      const snapshots = normalizeFundingRows(rows, wantedSymbols);
      if (snapshots.length < 2) return;

      cleanup();
      resolvePromise(snapshots);
    });
  });
}

export function parseSymbolList(raw: string | undefined): readonly Symbol[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => symbol.length > 0);
}

function normalizeFundingRows(
  rows: readonly FrontendContextRow[],
  wantedSymbols: ReadonlySet<Symbol> | undefined,
): readonly FundingRateSnapshot[] {
  return rows
    .filter((row) => !wantedSymbols || wantedSymbols.has(row.symbol))
    .map((row) => ({
      symbol: row.symbol,
      fundingRate: row.funding,
      volume24h: row.volume,
      openInterest: row.oi,
      lastPrice: row.lastPrice,
    }))
    .filter((row) => row.symbol.length > 0 && isLiquidFundingRate(row));
}

function createWsUrlFromEnv(): string | undefined {
  return process.env["BULK_WS_URL"] ?? process.env["NEXT_PUBLIC_BULK_WS_URL"];
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === fileURLToPath(import.meta.url);
}

async function runCli(): Promise<void> {
  if (process.argv.includes("--once")) {
    const opportunities = await runFundingArbDetectorOnce();
    console.log(JSON.stringify(opportunities, null, 2));
    return;
  }

  startFundingArbDetector();
}

if (isDirectRun()) {
  void runCli().catch((err) => {
    console.error("[funding-arb-detector] fatal", err);
    process.exit(1);
  });
}
