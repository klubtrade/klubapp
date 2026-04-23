// packages/api-client/src/websocket.ts
/**
 * Bulk WebSocket client.
 *
 * Verified against:
 *   - https://docs.bulk.trade/api-reference/websocket-intro
 *   - https://docs.bulk.trade/api-reference/ws-market-data
 *   - https://docs.bulk.trade/api-reference/ws-account
 *
 * Wire protocol:
 *   ┌ Subscribe ─────────────────────────────────────┐
 *   │ { method: 'subscribe',                         │
 *   │   subscription: [ { type, symbol, ... } ] }    │
 *   └────────────────────────────────────────────────┘
 *
 *   ┌ Server confirms ───────────────────────────────┐
 *   │ { type: 'subscriptionResponse',                │
 *   │   topics: ['ticker.BTC-USD', ...] }            │
 *   └────────────────────────────────────────────────┘
 *
 *   ┌ Data frame ────────────────────────────────────┐
 *   │ { type: 'ticker',                              │
 *   │   data: { ticker: {...}, symbol: 'BTC-USD' } } │
 *   └────────────────────────────────────────────────┘
 *
 * Keep-alive: Bulk sends WebSocket PING frames every 30s; client must
 * reply with PONG within 10s. Native `WebSocket` (browser) and `ws`
 * (Node) both auto-pong per the WebSocket spec — no JSON heartbeat
 * needed.
 *
 * Rate limits (enforced by server; we add local guards):
 *   - 100 subscriptions per connection
 *   - 1000 messages per second
 */

import type { Pubkey, Ticker } from './types.js';

const DEFAULT_WS_URL = 'wss://exchange-ws1.bulk.trade';
const MAX_SUBSCRIPTIONS = 100;
const MAX_MESSAGES_PER_SEC = 1000;
const MAX_BACKOFF_MS = 30_000;

// ---------------------------------------------------------------------------
// Subscription & payload types — mirror Bulk's real WS vocabulary
// ---------------------------------------------------------------------------

/**
 * A subscription descriptor — what we send inside
 * `{method: 'subscribe', subscription: [...]}`.
 */
export type Subscription =
  | { readonly type: 'ticker'; readonly symbol: string }
  | { readonly type: 'trades'; readonly symbol: string }
  | { readonly type: 'candle'; readonly symbol: string; readonly interval: CandleInterval }
  | { readonly type: 'l2Snapshot'; readonly symbol: string; readonly nlevels?: number; readonly aggregation?: number }
  | { readonly type: 'l2Delta'; readonly symbol: string }
  | { readonly type: 'risk'; readonly symbol: string }
  | { readonly type: 'frontendContext' }
  | { readonly type: 'account'; readonly user: Pubkey };

export type CandleInterval =
  | '10s' | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '8h' | '12h'
  | '1d' | '3d' | '1w' | '1M';

/** Inbound candle. */
export interface Candle {
  readonly t: number;   // open ts, ms
  readonly T: number;   // close ts, ms
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
  readonly n: number;   // trade count
}

/** Inbound trade from the trades stream. */
export interface TradeUpdate {
  readonly s: string;
  readonly px: number;
  readonly sz: number;
  readonly time: number;
  readonly side: boolean;   // true = taker bought
  readonly maker: string;
  readonly taker: string;
  readonly reason?: 'liquidation' | 'adl';
  readonly liq?: boolean;
}

/** L2 book snapshot. levels[0] = bids desc, levels[1] = asks asc. */
export interface L2Snapshot {
  readonly s: string;
  readonly ts: number;
  readonly levels: readonly [readonly L2Level[], readonly L2Level[]];
}

/** L2 book delta. Only one side populated per update. sz=0 removes. */
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

/**
 * Frontend context — aggregated ticker for ALL markets at once.
 * Updates every 2s. Use this in preference to per-symbol ticker
 * subscriptions for dashboard views (saves sub count against 100 limit).
 */
export interface FrontendContextRow {
  readonly symbol: string;
  readonly volume: number;
  readonly funding: number;
  readonly oi: number;
  readonly lastPrice: number;
  readonly priceChange: number;
  readonly priceChangePercent: number;
}

/**
 * Risk stream payload — per-asset lambda grid for portfolio-margin
 * math. Published on the `risk:{symbol}` WebSocket topic,
 * event-driven (when underlying regime / lambda grid changes).
 *
 * Named `RiskStream` to disambiguate from the REST endpoint's
 * `RiskSurface` type in `types.ts`, which is a SMALLER shape
 * `{s, imFraction, mmFraction, adlRank}`. The two names referring
 * to the same concept but different payloads was confusing; the
 * streaming one got renamed.
 *
 * Consumers on the web side typically want this (streaming) one
 * because it's kept live, not the snapshot from REST.
 */
export interface RiskStream {
  readonly symbol: string;
  readonly timestamp: number;
  readonly regime: number;
  /** Leverage knot points, e.g. [1, 2, 5, 10, 20, 50]. */
  readonly leverage: readonly number[];
  /** Notional knot points, e.g. [50_000, 100_000, 1_000_000, 10_000_000]. */
  readonly notionals: readonly number[];
  /** 2D grid [notional_idx][leverage_idx] for buy side. */
  readonly buy: readonly (readonly RiskPoint[])[];
  /** 2D grid [notional_idx][leverage_idx] for sell side. */
  readonly sell: readonly (readonly RiskPoint[])[];
  /** Correlation tuples, e.g. [["BTC:ETH", 0.71], ...]. */
  readonly corrs: readonly (readonly [string, number])[];
}

export interface RiskPoint {
  /** Maintenance margin ratio at regime start. */
  readonly mmrO: number;
  /** Maintenance margin ratio at regime end. */
  readonly mmrE: number;
  /** Probability of remaining in regime. */
  readonly p: number;
}

/** Account stream payload — positions + balances. */
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

// ---------------------------------------------------------------------------
// Inbound message envelope — per Bulk's real format
// ---------------------------------------------------------------------------

export type IncomingMessage =
  | { readonly type: 'subscriptionResponse'; readonly topics: readonly string[] }
  | { readonly type: 'ticker'; readonly data: { readonly ticker: Ticker; readonly symbol: string } }
  | { readonly type: 'trades'; readonly data: { readonly trades: readonly TradeUpdate[]; readonly symbol: string } }
  | { readonly type: 'candle'; readonly data: { readonly candle: Candle; readonly symbol: string; readonly interval: CandleInterval } }
  | { readonly type: 'l2Snapshot'; readonly data: L2Snapshot }
  | { readonly type: 'l2Delta'; readonly data: L2Delta }
  | { readonly type: 'risk'; readonly data: RiskStream }
  | { readonly type: 'frontendContext'; readonly data: { readonly ctx: readonly FrontendContextRow[] } }
  | { readonly type: 'account'; readonly data: AccountUpdate }
  | { readonly type: 'error'; readonly message: string };

/** Typed handler for each stream. */
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

// ---------------------------------------------------------------------------
// WSTransport abstraction — lets us swap WebSocket for tests
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface BulkWebSocketConfig {
  readonly url?: string;
  readonly WebSocketImpl?: WSTransportConstructor;
  readonly initialBackoffMs?: number;
  readonly log?: (msg: string, meta?: Record<string, unknown>) => void;
}

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'reconnecting';

/**
 * `topicKey` produces the stable local key we use to dedupe subscriptions
 * and look up handlers. Derived from the `topics` string that Bulk sends
 * back in `subscriptionResponse` (e.g. `ticker.BTC-USD`, `candle.BTC-USD.1m`).
 */
function topicKey(sub: Subscription): string {
  switch (sub.type) {
    case 'ticker':
    case 'trades':
    case 'l2Snapshot':
    case 'l2Delta':
    case 'risk':
      return `${topicPrefix(sub.type)}.${sub.symbol}`;
    case 'candle':
      return `candle.${sub.symbol}.${sub.interval}`;
    case 'frontendContext':
      return 'frontendContext';
    case 'account':
      return `account.${sub.user}`;
  }
}

function topicPrefix(type: Subscription['type']): string {
  // Bulk lowercases 'l2Snapshot' -> 'l2snapshot' in topic strings per docs
  if (type === 'l2Snapshot') return 'l2snapshot';
  if (type === 'l2Delta') return 'l2delta';
  return type;
}

/**
 * Pull the first finite number from `obj` at any of the given keys,
 * or NaN if none are present. Used in the frontendContext adapter
 * where Bulk's row shape has drifted over the past few releases and
 * we don't want to chase schema changes with code edits — we probe.
 *
 * `NaN` is the intentional sentinel (not 0) so consumer code can
 * `Number.isFinite(x)` to detect "missing" without mistakenly treating
 * missing funding as "zero funding" (which on /desk would render a
 * misleading "+0.0000%" row instead of an honest "—").
 */
function pickNumber(obj: Record<string, unknown>, keys: readonly string[]): number {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return Number.NaN;
}

function pickString(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/**
 * One subscription entry in our local map, keyed by topic string.
 * Holds a SET of handlers (not a single one) so multiple consumers
 * in the same process can share ONE server-side subscription. This
 * matters because Bulk caps subscriptions at 100 per socket AND
 * because callsites in the app commonly mount two hooks (e.g. /desk
 * mounts both `useFundingRates` and `useTickers`) that each want
 * to listen to `frontendContext`.
 *
 * Previously this stored a single handler and `register()` called
 * `map.set(key, entry)` which silently overwrote the prior
 * subscriber — the LAST subscriber won, earlier subscribers went
 * dark. Manifested as /desk showing tickers (late subscriber) but
 * no funding (early subscriber, orphaned).
 */
interface SubEntry {
  readonly sub: Subscription;
  readonly handlers: Set<StreamHandlerAny>;
  readonly key: string;
}

// Handler is typed per topic, but we store as a loose wrapper so one map holds all.
// Use of `any` here is the dispatch seam; typed entry points guarantee safety above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamHandlerAny = (payload: any, extra?: any, extra2?: any) => void;

export class BulkWebSocket {
  private readonly url: string;
  private readonly WebSocketImpl: WSTransportConstructor;
  private readonly initialBackoffMs: number;
  private readonly log: (msg: string, meta?: Record<string, unknown>) => void;

  private socket: (WSTransport & {
    onopen: ((ev: unknown) => void) | null;
    onclose: ((ev: unknown) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    onmessage: ((ev: { data: string | ArrayBuffer | Blob }) => void) | null;
  }) | null = null;

  private subs = new Map<string, SubEntry>();
  private pendingAcks = new Map<string, () => void>();
  private currentBackoffMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private connected = false;
  private state: ConnectionState = 'idle';
  private stateListeners = new Set<(s: ConnectionState) => void>();

  /**
   * Outbound message rate limiter. Bulk disconnects clients exceeding
   * 1000 msg/sec. We track a rolling 1-second window of send timestamps
   * and drop + log sends that would trip it.
   */
  private sendTimestamps: number[] = [];

  constructor(config: BulkWebSocketConfig = {}) {
    this.url = config.url ?? DEFAULT_WS_URL;
    const impl =
      config.WebSocketImpl ??
      (globalThis as { WebSocket?: WSTransportConstructor }).WebSocket;
    if (!impl) {
      throw new Error(
        'No WebSocket implementation available. In Node, pass a `WebSocketImpl` (e.g. from the `ws` package).',
      );
    }
    this.WebSocketImpl = impl;
    this.initialBackoffMs = config.initialBackoffMs ?? 500;
    this.currentBackoffMs = this.initialBackoffMs;
    this.log = config.log ?? (() => undefined);
  }

  // ------------------- state observers -------------------

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

  // ------------------- lifecycle -------------------

  connect(): void {
    if (this.socket) return;
    this.shouldReconnect = true;
    this.setState('connecting');
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
    this.setState('closed');
  }

  // ------------------- typed subscribes -------------------

  onTicker(symbol: string, handler: StreamHandler['ticker']): () => void {
    return this.register({ type: 'ticker', symbol }, handler);
  }
  onTrades(symbol: string, handler: StreamHandler['trades']): () => void {
    return this.register({ type: 'trades', symbol }, handler);
  }
  onCandle(symbol: string, interval: CandleInterval, handler: StreamHandler['candle']): () => void {
    return this.register({ type: 'candle', symbol, interval }, handler);
  }
  onL2Snapshot(
    symbol: string,
    opts: { nlevels?: number; aggregation?: number } = {},
    handler: StreamHandler['l2Snapshot'],
  ): () => void {
    return this.register({ type: 'l2Snapshot', symbol, ...opts }, handler);
  }
  onL2Delta(symbol: string, handler: StreamHandler['l2Delta']): () => void {
    return this.register({ type: 'l2Delta', symbol }, handler);
  }
  onRisk(symbol: string, handler: StreamHandler['risk']): () => void {
    return this.register({ type: 'risk', symbol }, handler);
  }
  onFrontendContext(handler: StreamHandler['frontendContext']): () => void {
    return this.register({ type: 'frontendContext' }, handler);
  }
  onAccount(user: Pubkey, handler: StreamHandler['account']): () => void {
    return this.register({ type: 'account', user }, handler);
  }

  private register(sub: Subscription, handler: StreamHandlerAny): () => void {
    const key = topicKey(sub);

    // Client-side sub cap — Bulk disconnects on violation. Only
    // count against the cap when we'd actually CREATE a new topic
    // subscription on the wire; adding a second handler to an
    // already-subscribed topic is free server-side.
    const existing = this.subs.get(key);
    if (!existing && this.subs.size >= MAX_SUBSCRIPTIONS) {
      throw new Error(
        `BulkWebSocket: subscription cap reached (${MAX_SUBSCRIPTIONS}). Consider using frontendContext for multi-symbol dashboards.`,
      );
    }

    if (existing) {
      // Already subscribed on the server — just add our handler to
      // the fan-out set. No network traffic. The Set dedupes so the
      // same handler reference registered twice stays in at size 1.
      existing.handlers.add(handler);
    } else {
      const entry: SubEntry = { sub, handlers: new Set([handler]), key };
      this.subs.set(key, entry);
      if (this.connected) {
        this.sendSubscribe([sub]);
      }
    }

    return () => this.unregister(key, handler);
  }

  /**
   * Resolve once Bulk has confirmed the topic is active (via `subscriptionResponse`).
   * If already active, resolves immediately. If the socket is not connected,
   * resolves when the server acks on next connect.
   *
   * Use when you need a hard signal that live data is flowing before
   * proceeding — e.g. before placing an order that depends on current mark.
   */
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
    // Only tear down the server-side subscription when the LAST
    // local listener unsubscribes. Otherwise we'd kill the stream
    // out from under sibling subscribers.
    if (entry.handlers.size === 0) {
      this.subs.delete(key);
      if (this.connected) {
        this.sendRaw({ method: 'unsubscribe', topic: key });
      }
    }
  }

  // ------------------- socket handling -------------------

  private openSocket(): void {
    this.log(`ws: connecting to ${this.url}`);
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.connected = true;
      this.currentBackoffMs = this.initialBackoffMs;
      this.log('ws: open');
      this.setState('open');
      if (this.subs.size > 0) {
        this.sendSubscribe(Array.from(this.subs.values()).map((e) => e.sub));
      }
    };

    socket.onclose = () => {
      this.log('ws: closed');
      this.connected = false;
      this.socket = null;
      if (this.shouldReconnect) {
        this.setState('reconnecting');
        this.scheduleReconnect();
      } else {
        this.setState('closed');
      }
    };

    socket.onerror = (err) => {
      this.log('ws: error', { err: String(err) });
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      this.handleMessage(event.data);
    };
  }

  private handleMessage(raw: string): void {
    let msg: IncomingMessage;
    try {
      msg = JSON.parse(raw) as IncomingMessage;
    } catch {
      this.log('ws: non-json frame', { raw });
      return;
    }

    switch (msg.type) {
      case 'subscriptionResponse':
        this.log('ws: subs confirmed', { topics: msg.topics });
        // Resolve any pending-ack waiters for these topics.
        for (const topic of msg.topics) {
          const resolve = this.pendingAcks.get(topic);
          if (resolve) {
            resolve();
            this.pendingAcks.delete(topic);
          }
        }
        return;

      case 'error':
        this.log('ws: server error', { message: msg.message });
        return;

      case 'ticker': {
        const entry = this.subs.get(`ticker.${msg.data.symbol}`);
        if (entry) {
          for (const h of entry.handlers) h(msg.data.ticker, msg.data.symbol);
        }
        return;
      }

      case 'trades': {
        // Adapter: Bulk's wire format for trades hasn't been nailed
        // down in our types yet. We defensively probe three shapes:
        //   1. { type, data: { symbol, trades: [...] } }  ← matches IncomingMessage
        //   2. { type, data: { s,      trades: [...] } }  ← Bulk often uses `s`
        //   3. { type, symbol,         data:   [...] }    ← symbol at top level
        //
        // For every trade tape subscription key we have, we try each
        // wire shape and dispatch on the first hit. If nothing hits,
        // we log the raw frame so a future edit can add the right
        // probe. Ticker works fine with shape (1), so trades-specific
        // drift is the hypothesis.
        //
        // This was added because useRecentTrades never populated —
        // the original dispatcher assumed `msg.data.symbol` with no
        // fallback, so mismatched wire shapes silently drop every
        // trade batch.
        type TradesInnerObj = {
          readonly symbol?: string;
          readonly s?: string;
          readonly trades?: readonly TradeUpdate[];
        };
        type AnyTradesMsg = {
          readonly type: 'trades';
          readonly symbol?: string;
          readonly data?: TradesInnerObj | readonly TradeUpdate[];
        };
        const anyMsg = msg as unknown as AnyTradesMsg;
        const data = anyMsg.data;

        let symbol: string | undefined;
        let trades: readonly TradeUpdate[] | undefined;
        if (Array.isArray(data)) {
          // Shape 3: data is a bare array of trades; symbol lives at
          // the top level. `data` is `readonly TradeUpdate[]` here.
          trades = data;
          symbol = anyMsg.symbol;
        } else if (data && typeof data === 'object') {
          // Shape 1 or 2: data is an object with nested trades. TS
          // doesn't narrow the union to the object branch after
          // `Array.isArray` returns false (the readonly-tuple side of
          // the union can still be "object-ish" to the narrower), so
          // we re-assert through an explicit cast.
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

        // Fallback: no deterministic (symbol, trades) pair found. Log
        // the raw frame so we can see what Bulk is actually sending
        // and extend the probes above. Only logs once per minute per
        // distinct raw shape to avoid flooding the console.
        this.log('ws: trades frame with unknown shape — add a probe', {
          raw,
          parsed: msg,
          subsKeys: Array.from(this.subs.keys()).filter((k) => k.startsWith('trades.')),
        });
        return;
      }

      case 'candle': {
        const entry = this.subs.get(`candle.${msg.data.symbol}.${msg.data.interval}`);
        if (entry) {
          for (const h of entry.handlers) h(msg.data.candle, msg.data.symbol, msg.data.interval);
        }
        return;
      }

      case 'l2Snapshot': {
        const entry = this.subs.get(`l2snapshot.${msg.data.s}`);
        if (entry) {
          for (const h of entry.handlers) h(msg.data);
        }
        return;
      }

      case 'l2Delta': {
        const entry = this.subs.get(`l2delta.${msg.data.s}`);
        if (entry) {
          for (const h of entry.handlers) h(msg.data);
        }
        return;
      }

      case 'risk': {
        const entry = this.subs.get(`risk.${msg.data.symbol}`);
        if (entry) {
          for (const h of entry.handlers) h(msg.data);
        }
        return;
      }

      case 'frontendContext': {
        // Adapter: Bulk's wire format for frontendContext can deliver
        // the rows array under several keys. Observed patterns:
        //   1. { type, data: { ctx: [...] } }  ← matches IncomingMessage
        //   2. { type, data: [...] }            ← bare array
        //   3. { type, data: { rows: [...] } }  ← "rows" is common too
        //
        // Additionally, each row's funding field may arrive under
        // `funding`, `fundingRate`, `f`, or `funding8h`. We normalize
        // here so `useTickers` / `useFundingRates` always see
        // `row.funding` as a finite number (or NaN if truly absent).
        // Mark price works fine — `lastPrice` matches Bulk's wire —
        // but the funding normalization was the actual /desk bug.
        type AnyCtxRow = Record<string, unknown>;
        type CtxInnerObj = {
          readonly ctx?: readonly AnyCtxRow[];
          readonly rows?: readonly AnyCtxRow[];
        };
        type AnyCtxMsg = {
          readonly type: 'frontendContext';
          readonly data?: CtxInnerObj | readonly AnyCtxRow[];
        };
        // Cast through `unknown` because the static IncomingMessage
        // type asserts `data.ctx` as `readonly FrontendContextRow[]`
        // (a typed row), while at runtime we treat rows as loose
        // `Record<string, unknown>` to be field-name tolerant. The two
        // shapes don't overlap in TS's eyes, so `unknown` is the
        // honest bridge.
        const anyMsg = msg as unknown as AnyCtxMsg;
        const data = anyMsg.data;

        let rawRows: readonly AnyCtxRow[] | undefined;
        if (Array.isArray(data)) {
          rawRows = data;
        } else if (data && typeof data === 'object') {
          // Same narrowing issue as in the trades branch — re-assert
          // to the object variant of the union via an explicit cast.
          const inner = data as CtxInnerObj;
          rawRows = inner.ctx ?? inner.rows;
        }

        if (!rawRows || rawRows.length === 0) {
          this.log('ws: frontendContext frame with no rows — add a probe', {
            raw,
            parsed: msg,
          });
          return;
        }

        // Normalize each row. Missing fields land as NaN so consumers
        // can `Number.isFinite()` them; they never land as 0 (which
        // would display as "0.0000%" — a subtle lie on /desk).
        const rows: FrontendContextRow[] = rawRows.map((r) => ({
          symbol: pickString(r, ['symbol', 's', 'c']) ?? '',
          volume: pickNumber(r, ['volume', 'quoteVolume', 'vol24h', 'v']),
          funding: pickNumber(r, ['funding', 'fundingRate', 'funding8h', 'f']),
          oi: pickNumber(r, ['oi', 'openInterest']),
          lastPrice: pickNumber(r, ['lastPrice', 'price', 'px', 'last']),
          priceChange: pickNumber(r, ['priceChange', 'change24h']),
          priceChangePercent: pickNumber(r, ['priceChangePercent', 'change24hPct', 'priceChangePct']),
        }));

        const entry = this.subs.get('frontendContext');
        if (entry) {
          for (const h of entry.handlers) h(rows);
        }
        return;
      }

      case 'account': {
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
    this.sendRaw({ method: 'subscribe', subscription: subs });
  }

  private sendRaw(frame: unknown): void {
    if (!this.socket || !this.connected) return;

    // Sliding 1-second window rate check.
    const now = Date.now();
    // Drop timestamps older than 1s.
    while (this.sendTimestamps.length > 0 && now - (this.sendTimestamps[0] ?? 0) > 1000) {
      this.sendTimestamps.shift();
    }
    if (this.sendTimestamps.length >= MAX_MESSAGES_PER_SEC) {
      this.log('ws: outbound rate limit hit, dropping frame', {
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