import type { Pubkey, Ticker } from "./types.js";

const DEFAULT_WS_URL = "wss://exchange-ws1.bulk.trade";
const MAX_SUBSCRIPTIONS = 100;
const MAX_MESSAGES_PER_SEC = 1000;
const MAX_BACKOFF_MS = 30_000;

export type Subscription =
  | { readonly type: "ticker"; readonly symbol: string }
  | { readonly type: "trades"; readonly symbol: string }
  | {
      readonly type: "candle";
      readonly symbol: string;
      readonly interval: CandleInterval;
    }
  | {
      readonly type: "l2Snapshot";
      readonly symbol: string;
      readonly nlevels?: number;
      readonly aggregation?: number;
    }
  | { readonly type: "l2Delta"; readonly symbol: string }
  | { readonly type: "risk"; readonly symbol: string }
  | { readonly type: "frontendContext" }
  | { readonly type: "account"; readonly user: Pubkey };

export type CandleInterval =
  | "10s"
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "8h"
  | "12h"
  | "1d"
  | "3d"
  | "1w"
  | "1M";

export interface Candle {
  readonly t: number; // open ts, ms
  readonly T: number; // close ts, ms
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
  readonly n: number; // trade count
}

export interface TradeUpdate {
  readonly s: string;
  readonly px: number;
  readonly sz: number;
  readonly time: number;
  readonly side: boolean; // true = taker bought
  readonly maker: string;
  readonly taker: string;
  readonly reason?: "liquidation" | "adl";
  readonly liq?: boolean;
}

export interface L2Snapshot {
  readonly s: string;
  readonly ts: number;
  readonly levels: readonly [readonly L2Level[], readonly L2Level[]];
}

export interface L2Delta {
  readonly s: string;
  readonly ts: number;
  readonly levels: readonly [readonly L2Level[], readonly L2Level[]];
}

export interface L2Level {
  readonly px: number;
  readonly sz: number;
  readonly n: number;
}

export interface FrontendContextRow {
  readonly symbol: string;
  readonly volume: number;
  readonly funding: number;
  readonly oi: number;
  readonly lastPrice: number;
  readonly priceChange: number;
  readonly priceChangePercent: number;
}

export interface RiskStream {
  readonly symbol: string;
  readonly timestamp: number;
  readonly regime: number;
  readonly leverage: readonly number[];
  readonly notionals: readonly number[];
  readonly buy: readonly (readonly RiskPoint[])[];
  readonly sell: readonly (readonly RiskPoint[])[];
  readonly corrs: readonly (readonly [string, number])[];
}

export type LiveRiskSurface = RiskStream & {
  readonly risk: RiskStream;
};

export interface RiskPoint {
  readonly mmrO: number;
  readonly mmrE: number;
  readonly p: number;
}

export interface AccountUpdate {
  readonly user: Pubkey;
  readonly equityUsd: number;
  readonly positions: readonly {
    readonly s: string;
    readonly sz: number;
    readonly entryPx: number;
    readonly markPx: number;
    readonly liqPx: number;
    readonly unrealizedPnl: number;
    readonly fundingAccrued: number;
    readonly leverage: number;
  }[];
  readonly ts: number;
}

export type IncomingMessage =
  | {
      readonly type: "subscriptionResponse";
      readonly topics: readonly string[];
    }
  | {
      readonly type: "ticker";
      readonly data: { readonly ticker: Ticker; readonly symbol: string };
    }
  | {
      readonly type: "trades";
      readonly data: {
        readonly trades: readonly TradeUpdate[];
        readonly symbol: string;
      };
    }
  | {
      readonly type: "candle";
      readonly data: {
        readonly candle: Candle;
        readonly symbol: string;
        readonly interval: CandleInterval;
      };
    }
  | { readonly type: "l2Snapshot"; readonly data: L2Snapshot }
  | { readonly type: "l2Delta"; readonly data: L2Delta }
  | {
      readonly type: "risk";
      readonly topic?: string;
      readonly data: RiskStream | { readonly risk: RiskStream };
    }
  | {
      readonly type: "frontendContext";
      readonly data: { readonly ctx: readonly FrontendContextRow[] };
    }
  | { readonly type: "account"; readonly data: AccountUpdate }
  | { readonly type: "error"; readonly message: string };

export type StreamHandler = {
  ticker: (t: Ticker, symbol: string) => void;
  trades: (t: readonly TradeUpdate[], symbol: string) => void;
  candle: (c: Candle, symbol: string, interval: CandleInterval) => void;
  l2Snapshot: (b: L2Snapshot) => void;
  l2Delta: (b: L2Delta) => void;
  risk: (r: RiskStream) => void;
  frontendContext: (ctx: readonly FrontendContextRow[]) => void;
  account: (a: AccountUpdate) => void;
};

export interface WSTransport {
  send(data: string): void;
  close(): void;
  readonly readyState: number;
}

export interface WSTransportConstructor {
  new (url: string): WSTransport & {
    onopen: ((ev: unknown) => void) | null;
    onclose: ((ev: unknown) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    onmessage: ((ev: { data: string | ArrayBuffer | Blob }) => void) | null;
  };
}

export interface BulkWebSocketConfig {
  readonly url?: string;
  readonly WebSocketImpl?: WSTransportConstructor;
  readonly initialBackoffMs?: number;
  readonly log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "reconnecting";

function topicKey(sub: Subscription): string {
  switch (sub.type) {
    case "ticker":
    case "trades":
    case "l2Snapshot":
    case "l2Delta":
    case "risk":
      return `${topicPrefix(sub.type)}.${sub.symbol}`;
    case "candle":
      return `candle.${sub.symbol}.${sub.interval}`;
    case "frontendContext":
      return "frontendContext";
    case "account":
      return `account.${sub.user}`;
  }
}

function topicPrefix(type: Subscription["type"]): string {
  if (type === "l2Snapshot") return "l2snapshot";
  if (type === "l2Delta") return "l2delta";
  return type;
}

function symbolFromTopic(
  topic: string | undefined,
  prefix: string,
): string | null {
  if (!topic?.startsWith(`${prefix}.`)) return null;
  const symbol = topic.slice(prefix.length + 1);
  return symbol.length > 0 ? symbol : null;
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: readonly string[],
): number {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return Number.NaN;
}

function pickString(
  obj: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

interface SubEntry {
  readonly sub: Subscription;
  readonly handlers: Set<StreamHandlerAny>;
  readonly key: string;
}

type StreamHandlerAny = (payload: any, extra?: any, extra2?: any) => void;

export class BulkWebSocket {
  private readonly url: string;
  private readonly WebSocketImpl: WSTransportConstructor;
  private readonly initialBackoffMs: number;
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;

  private socket:
    | (WSTransport & {
        onopen: ((ev: unknown) => void) | null;
        onclose: ((ev: unknown) => void) | null;
        onerror: ((ev: unknown) => void) | null;
        onmessage: ((ev: { data: string | ArrayBuffer | Blob }) => void) | null;
      })
    | null = null;

  private subs = new Map<string, SubEntry>();
  private riskSurfaces = new Map<string, LiveRiskSurface>();
  private pendingAcks = new Map<string, () => void>();
  private currentBackoffMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private connected = false;
  private state: ConnectionState = "idle";
  private stateListeners = new Set<(s: ConnectionState) => void>();

  private sendTimestamps: number[] = [];

  constructor(config: BulkWebSocketConfig = {}) {
    this.url = config.url ?? DEFAULT_WS_URL;
    const impl =
      config.WebSocketImpl ??
      (globalThis as { WebSocket?: WSTransportConstructor }).WebSocket;
    if (!impl) {
      throw new Error(
        "No WebSocket implementation available. In Node, pass a `WebSocketImpl` (e.g. from the `ws` package).",
      );
    }
    this.WebSocketImpl = impl;
    this.initialBackoffMs = config.initialBackoffMs ?? 500;
    this.currentBackoffMs = this.initialBackoffMs;
    this.log = config.log ?? (() => undefined);
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    for (const l of this.stateListeners) l(next);
  }

  connect(): void {
    if (this.socket) return;
    this.shouldReconnect = true;
    this.setState("connecting");
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
    this.setState("closed");
  }

  onTicker(symbol: string, handler: StreamHandler["ticker"]): () => void {
    return this.register({ type: "ticker", symbol }, handler);
  }
  onTrades(symbol: string, handler: StreamHandler["trades"]): () => void {
    return this.register({ type: "trades", symbol }, handler);
  }
  onCandle(
    symbol: string,
    interval: CandleInterval,
    handler: StreamHandler["candle"],
  ): () => void {
    return this.register({ type: "candle", symbol, interval }, handler);
  }
  onL2Snapshot(
    symbol: string,
    opts: { nlevels?: number; aggregation?: number } = {},
    handler: StreamHandler["l2Snapshot"],
  ): () => void {
    return this.register({ type: "l2Snapshot", symbol, ...opts }, handler);
  }
  onL2Delta(symbol: string, handler: StreamHandler["l2Delta"]): () => void {
    return this.register({ type: "l2Delta", symbol }, handler);
  }
  onRisk(symbol: string, handler: StreamHandler["risk"]): () => void {
    return this.register({ type: "risk", symbol }, handler);
  }
  subscribeRisk(symbol: string): () => void {
    return this.register({ type: "risk", symbol }, () => undefined);
  }
  getLiveRiskSurface(symbol: string): LiveRiskSurface | null {
    return this.riskSurfaces.get(symbol) ?? null;
  }
  onFrontendContext(handler: StreamHandler["frontendContext"]): () => void {
    return this.register({ type: "frontendContext" }, handler);
  }
  onAccount(user: Pubkey, handler: StreamHandler["account"]): () => void {
    return this.register({ type: "account", user }, handler);
  }

  private register(sub: Subscription, handler: StreamHandlerAny): () => void {
    const key = topicKey(sub);

    const existing = this.subs.get(key);
    if (!existing && this.subs.size >= MAX_SUBSCRIPTIONS) {
      throw new Error(
        `BulkWebSocket: subscription cap reached (${MAX_SUBSCRIPTIONS}). Consider using frontendContext for multi-symbol dashboards.`,
      );
    }

    if (existing) {
      existing.handlers.add(handler);
    } else {
      const entry: SubEntry = { sub, handlers: new Set([handler]), key };
      this.subs.set(key, entry);
      if (this.connected) {
        this.sendSubscribe([sub]);
      } else if (!this.socket) {
        this.connect();
      }
    }

    return () => this.unregister(key, handler);
  }

  waitUntilSubscribed(topic: string, timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(topic);
        reject(new Error(`ws: subscription ack timeout for ${topic}`));
      }, timeoutMs);

      this.pendingAcks.set(topic, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private unregister(key: string, handler: StreamHandlerAny): void {
    const entry = this.subs.get(key);
    if (!entry) return;
    entry.handlers.delete(handler);
    if (entry.handlers.size === 0) {
      this.subs.delete(key);
      if (this.connected) {
        this.sendRaw({ method: "unsubscribe", topic: key });
      }
    }
  }

  private openSocket(): void {
    this.log(`ws: connecting to ${this.url}`);
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.connected = true;
      this.currentBackoffMs = this.initialBackoffMs;
      this.log("ws: open");
      this.setState("open");
      if (this.subs.size > 0) {
        this.sendSubscribe(Array.from(this.subs.values()).map((e) => e.sub));
      }
    };

    socket.onclose = () => {
      this.log("ws: closed");
      this.connected = false;
      this.socket = null;
      if (this.shouldReconnect) {
        this.setState("reconnecting");
        this.scheduleReconnect();
      } else {
        this.setState("closed");
      }
    };

    socket.onerror = (err) => {
      this.log("ws: error", { err: String(err) });
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      this.handleMessage(event.data);
    };
  }

  private handleMessage(raw: string): void {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(raw) as IncomingMessage;
    } catch {
      this.log("ws: non-json frame", { raw });
      return;
    }

    switch (msg.type) {
      case "subscriptionResponse":
        this.log("ws: subs confirmed", { topics: msg.topics });
        for (const topic of msg.topics) {
          const resolve = this.pendingAcks.get(topic);
          if (resolve) {
            resolve();
            this.pendingAcks.delete(topic);
          }
        }
        return;

      case "error":
        this.log("ws: server error", { message: msg.message });
        return;

      case "ticker": {
        const entry = this.subs.get(`ticker.${msg.data.symbol}`);
        if (entry) {
          for (const h of entry.handlers) h(msg.data.ticker, msg.data.symbol);
        }
        return;
      }

      case "trades": {
        type TradesInnerObj = {
          readonly symbol?: string;
          readonly s?: string;
          readonly trades?: readonly TradeUpdate[];
        };
        type AnyTradesMsg = {
          readonly type: "trades";
          readonly symbol?: string;
          readonly data?: TradesInnerObj | readonly TradeUpdate[];
        };
        const anyMsg = msg as unknown as AnyTradesMsg;
        const data = anyMsg.data;

        let symbol: string | undefined;
        let trades: readonly TradeUpdate[] | undefined;
        if (Array.isArray(data)) {
          trades = data;
          symbol = anyMsg.symbol;
        } else if (data && typeof data === "object") {
          const inner = data as TradesInnerObj;
          trades = inner.trades;
          symbol = inner.symbol ?? inner.s;
        }

        if (symbol && trades) {
          const entry = this.subs.get(`trades.${symbol}`);
          if (entry) {
            for (const h of entry.handlers) h(trades, symbol);
            return;
          }
        }

        this.log("ws: trades frame with unknown shape — add a probe", {
          raw,
          parsed: msg,
          subsKeys: Array.from(this.subs.keys()).filter((k) =>
            k.startsWith("trades."),
          ),
        });
        return;
      }

      case "candle": {
        const entry = this.subs.get(
          `candle.${msg.data.symbol}.${msg.data.interval}`,
        );
        if (entry) {
          for (const h of entry.handlers)
            h(msg.data.candle, msg.data.symbol, msg.data.interval);
        }
        return;
      }

      case "l2Snapshot":
      case "l2Delta": {
        type L2Inner = {
          readonly book?: {
            readonly symbol?: string;
            readonly levels?: unknown;
            readonly ts?: number;
          };
          readonly s?: string;
          readonly levels?: unknown;
          readonly ts?: number;
        };
        const data = msg.data as unknown as L2Inner;
        const book = data.book;
        const symbol = book?.symbol ?? data.s;
        const levels = book?.levels ?? data.levels;
        const ts = book?.ts ?? data.ts ?? Date.now();
        if (!symbol || !levels) {
          this.log(`ws: ${msg.type} frame missing symbol/levels`, {
            parsed: msg,
          });
          return;
        }
        const normalized = {
          s: symbol,
          ts,
          levels: levels as L2Snapshot["levels"],
        };
        const prefix = msg.type === "l2Snapshot" ? "l2snapshot" : "l2delta";
        const entry = this.subs.get(`${prefix}.${symbol}`);
        if (entry) {
          for (const h of entry.handlers) h(normalized);
        }
        return;
      }

      case "risk": {
        const risk = normalizeRiskMessage(msg);
        if (!risk) {
          this.log("ws: risk frame missing symbol", { parsed: msg });
          return;
        }
        this.riskSurfaces.set(risk.symbol, risk);
        const entry = this.subs.get(`risk.${risk.symbol}`);
        if (entry) {
          for (const h of entry.handlers) h(risk.risk);
        }
        return;
      }

      case "frontendContext": {
        type AnyCtxRow = Record<string, unknown>;
        type CtxInnerObj = {
          readonly ctx?: readonly AnyCtxRow[];
          readonly rows?: readonly AnyCtxRow[];
        };
        type AnyCtxMsg = {
          readonly type: "frontendContext";
          readonly data?: CtxInnerObj | readonly AnyCtxRow[];
        };
        const anyMsg = msg as unknown as AnyCtxMsg;
        const data = anyMsg.data;

        let rawRows: readonly AnyCtxRow[] | undefined;
        if (Array.isArray(data)) {
          rawRows = data;
        } else if (data && typeof data === "object") {
          const inner = data as CtxInnerObj;
          rawRows = inner.ctx ?? inner.rows;
        }

        if (!rawRows || rawRows.length === 0) {
          this.log("ws: frontendContext frame with no rows — add a probe", {
            raw,
            parsed: msg,
          });
          return;
        }

        const rows: FrontendContextRow[] = rawRows.map((r) => ({
          symbol: pickString(r, ["symbol", "s", "c"]) ?? "",
          volume: pickNumber(r, ["volume", "quoteVolume", "vol24h", "v"]),
          funding: pickNumber(r, ["funding", "fundingRate", "funding8h", "f"]),
          oi: pickNumber(r, ["oi", "openInterest"]),
          lastPrice: pickNumber(r, ["lastPrice", "price", "px", "last"]),
          priceChange: pickNumber(r, ["priceChange", "change24h"]),
          priceChangePercent: pickNumber(r, [
            "priceChangePercent",
            "change24hPct",
            "priceChangePct",
          ]),
        }));

        const entry = this.subs.get("frontendContext");
        if (entry) {
          for (const h of entry.handlers) h(rows);
        }
        return;
      }

      case "account": {
        const entry = this.subs.get(`account.${msg.data.user}`);
        if (entry) {
          for (const h of entry.handlers) h(msg.data);
        }
        return;
      }
    }
  }

  private sendSubscribe(subs: readonly Subscription[]): void {
    if (subs.length === 0) return;
    this.sendRaw({ method: "subscribe", subscription: subs });
  }

  private sendRaw(frame: unknown): void {
    if (!this.socket || !this.connected) return;

    const now = Date.now();
    while (
      this.sendTimestamps.length > 0 &&
      now - (this.sendTimestamps[0] ?? 0) > 1000
    ) {
      this.sendTimestamps.shift();
    }
    if (this.sendTimestamps.length >= MAX_MESSAGES_PER_SEC) {
      this.log("ws: outbound rate limit hit, dropping frame", {
        cap: MAX_MESSAGES_PER_SEC,
      });
      return;
    }
    this.sendTimestamps.push(now);
    this.socket.send(JSON.stringify(frame));
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.currentBackoffMs, MAX_BACKOFF_MS);
    this.log(`ws: reconnect in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.currentBackoffMs = Math.min(
        this.currentBackoffMs * 2,
        MAX_BACKOFF_MS,
      );
      this.openSocket();
    }, delay);
  }
}

function normalizeRiskMessage(
  msg: Extract<IncomingMessage, { readonly type: "risk" }>,
): LiveRiskSurface | null {
  const nestedRisk =
    "risk" in msg.data && msg.data.risk && typeof msg.data.risk === "object"
      ? msg.data.risk
      : null;
  const rawRiskValue = nestedRisk ?? msg.data;
  if (!rawRiskValue || typeof rawRiskValue !== "object") {
    return null;
  }
  const rawRisk = rawRiskValue as Partial<RiskStream> & {
    readonly symbol?: string;
  };
  const symbol =
    (typeof rawRisk.symbol === "string" && rawRisk.symbol.length > 0
      ? rawRisk.symbol
      : symbolFromTopic(msg.topic, "risk")) ?? null;

  if (!symbol) {
    return null;
  }

  const risk = {
    ...(rawRiskValue as RiskStream),
    symbol,
  } as RiskStream;

  return {
    ...risk,
    risk,
  };
}
