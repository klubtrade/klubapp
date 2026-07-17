// packages/api-client/src/types.ts
/**
 * TypeScript types for the Bulk Exchange API.
 *
 * Field names follow Bulk's compact notation — see
 * https://docs.bulk.trade/api-reference/introduction#field-notation
 *
 * Compact keys are preserved as-is (e.g. `px`, `sz`, `oid`) so our
 * request/response bodies wire-up directly to the HTTP API. For
 * application-facing code, consumers should wrap these in their own
 * domain models.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Milliseconds since Unix epoch (int64). */
export type TimestampMs = number;

/** Nanoseconds since Unix epoch, used for signed transaction nonces. */
export type NonceNs = bigint;

/** Base58 Solana-style pubkey (user address, agent wallet, etc.). */
export type Pubkey = string;

/** Market symbol in the form `BASE-QUOTE`, e.g. "BTC-USD". */
export type Symbol = string;

/**
 * Prices and sizes are transmitted as strings to preserve precision.
 * Callers should parse to `number` or a big-decimal only at display time.
 */
export type DecimalString = string;

/** Time-in-force for limit orders. */
export type TimeInForce = "GTC" | "IOC" | "ALO";

/** Standard HTTP-like error envelope. */
export interface BulkErrorResponse {
  readonly error: string;
  readonly message?: string;
  readonly code?: number;
}

// ---------------------------------------------------------------------------
// Order types
// ---------------------------------------------------------------------------

/** Tag discriminator for Bulk's order types. */
export type OrderTypeTag =
  | "l" // limit
  | "m" // market
  | "st" // stop
  | "tp" // take-profit
  | "rng" // range / OCO
  | "trig" // trigger basket
  | "trl" // trailing stop
  | "of"; // on-fill

export interface LimitOrderType {
  readonly type: "l";
  readonly tif: TimeInForce;
}

export interface MarketOrderType {
  readonly type: "m";
}

export interface StopOrderType {
  readonly type: "st";
  /** Trigger price. */
  readonly tr: DecimalString;
  /** Direction: true = trigger when mark rises above threshold. */
  readonly d: boolean;
  /** Post-trigger limit price (optional for stop-market). */
  readonly lim?: DecimalString;
}

export interface TakeProfitOrderType {
  readonly type: "tp";
  readonly tr: DecimalString;
  readonly d: boolean;
  readonly lim?: DecimalString;
}

export interface TrailingStopOrderType {
  readonly type: "trl";
  /** Trailing distance from mark, in quote currency. */
  readonly tr: DecimalString;
}

export type OrderType =
  | LimitOrderType
  | MarketOrderType
  | StopOrderType
  | TakeProfitOrderType
  | TrailingStopOrderType;

// ---------------------------------------------------------------------------
// Order placement
// ---------------------------------------------------------------------------

export interface PlaceOrderParams {
  /** Market symbol, e.g. "BTC-USD". */
  readonly c: Symbol;
  /** True = buy/long, false = sell/short. */
  readonly b: boolean;
  /** Order size in base units. */
  readonly sz: DecimalString;
  /** Limit price. Omitted for pure market orders. */
  readonly px?: DecimalString;
  /** Reduce-only flag. */
  readonly r: boolean;
  /** Order type object. */
  readonly t: OrderType;
  /** Optional client-supplied order ID for idempotency. */
  readonly cloid?: string;
}

export interface CancelOrderParams {
  readonly c: Symbol;
  readonly oid: number;
}

export interface OrderAck {
  /** Server-assigned order ID. */
  readonly oid: number;
  /** Status: "resting" | "filled" | "rejected". */
  readonly status: string;
  readonly message?: string;
}

// ---------------------------------------------------------------------------
// Market data
// ---------------------------------------------------------------------------

/** Response from GET /exchangeInfo. */
export interface ExchangeInfo {
  readonly symbols: readonly MarketSpec[];
  readonly serverTime: TimestampMs;
}

export interface MarketSpec {
  readonly s: Symbol;
  readonly baseDecimals: number;
  readonly quoteDecimals: number;
  readonly tickSize: DecimalString;
  readonly lotSize: DecimalString;
  readonly maxLeverage: number;
  readonly initialMarginBps: number;
  readonly maintenanceMarginBps: number;
  readonly isActive: boolean;
}

/**
 * Ticker — real Bulk shape, verified against
 * https://docs.bulk.trade/api-reference/ws-market-data
 *
 * Delivered over WebSocket topic `ticker.{symbol}` every 200ms, and as the
 * response to GET /ticker. Numbers come across as plain JSON numbers in
 * the WebSocket feed (not DecimalStrings) — Bulk quantizes at the protocol
 * level, so JS precision is safe for display.
 */
export interface Ticker {
  /** 24h absolute price change. */
  readonly priceChange: number;
  /** 24h percent change (0.03 = 3%). */
  readonly priceChangePercent: number;
  /** Last traded price. */
  readonly lastPrice: number;
  /** 24h high. */
  readonly highPrice: number;
  /** 24h low. */
  readonly lowPrice: number;
  /** 24h base volume. */
  readonly volume: number;
  /** 24h quote volume. */
  readonly quoteVolume: number;
  /** Fair/mark price — use this for PnL + liquidation math. */
  readonly markPrice: number;
  /** Oracle-reported price. */
  readonly oraclePrice: number;
  /** Total open interest. */
  readonly openInterest: number;
  /** Current per-interval funding rate (fraction, not bps). */
  readonly fundingRate: number;
  /** Market regime index. Negative bearish · 0–2 neutral · 10–12 bullish. */
  readonly regime: number;
  /** Regime duration in 10s intervals. */
  readonly regimeDt: number;
  /** Regime-adjusted volatility. */
  readonly regimeVol: number;
  /** Regime mean value. */
  readonly regimeMv: number;
  /** Fair price derived from order book. */
  readonly fairBookPx: number;
  /** Fair volatility estimate. */
  readonly fairVol: number;
  /** Fair price bias. */
  readonly fairBias: number;
  /** Timestamp in NANOSECONDS (unlike other timestamps which are ms). */
  readonly timestamp: number;
}

/** Response from GET /klines. One candle tuple. */
export interface Candle {
  readonly t: TimestampMs; // open time
  readonly o: DecimalString;
  readonly h: DecimalString;
  readonly l: DecimalString;
  readonly c: DecimalString;
  readonly v: DecimalString;
  readonly n: number; // trade count
}

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

/** Response from GET /l2book. */
export interface L2Book {
  readonly s: Symbol;
  readonly ts: TimestampMs;
  /** [price, size] tuples, sorted best-first. */
  readonly bids: readonly [DecimalString, DecimalString][];
  readonly asks: readonly [DecimalString, DecimalString][];
}

/** Response from GET /stats. */
export interface ExchangeStats {
  readonly volume24h: DecimalString;
  readonly trades24h: number;
  readonly openInterestUsd: DecimalString;
}

/** Response from GET /riskSurfaces. */
export interface RiskSurfaces {
  readonly surfaces: readonly RiskSurface[];
  readonly ts: TimestampMs;
}

export interface RiskSurface {
  readonly s: Symbol;
  readonly imFraction: DecimalString;
  readonly mmFraction: DecimalString;
  readonly adlRank: number;
}

/** Response from GET /feeState. */
export interface FeeState {
  readonly makerBps: number;
  readonly takerBps: number;
  readonly tierName: string;
  readonly volume30dUsd: DecimalString;
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export type AccountQueryType =
  | "fullAccount"
  | "positions"
  | "openOrders"
  | "fills"
  | "fundingHistory";

export interface AccountQueryParams {
  readonly type: AccountQueryType;
  readonly user: Pubkey;
}

export interface FullAccount {
  readonly user: Pubkey;
  readonly collateralUsd: DecimalString;
  readonly equityUsd: DecimalString;
  readonly maintenanceMarginUsd: DecimalString;
  readonly initialMarginUsd: DecimalString;
  readonly positions: readonly Position[];
  readonly openOrders: readonly OpenOrder[];
  /** Master-account-scoped Builder Code fee approvals. */
  readonly builderCodeApprovals?: readonly {
    readonly recipient: Pubkey;
    readonly maxFee: number;
  }[];
  readonly ts: TimestampMs;
}

export interface Position {
  readonly s: Symbol;
  /** Signed size — positive = long, negative = short. */
  readonly sz: DecimalString;
  readonly entryPx: DecimalString;
  readonly markPx: DecimalString;
  readonly liqPx: DecimalString;
  readonly unrealizedPnl: DecimalString;
  readonly fundingAccrued: DecimalString;
  readonly leverage: DecimalString;
}

export interface OpenOrder {
  readonly oid: number;
  readonly cloid?: string;
  readonly s: Symbol;
  readonly b: boolean;
  readonly sz: DecimalString;
  readonly remaining: DecimalString;
  readonly px: DecimalString;
  readonly t: OrderType;
  readonly ts: TimestampMs;
}

export interface UserFill {
  readonly symbol: Symbol;
  readonly amount: number;
  readonly price: number;
  readonly isBuy: boolean;
  readonly fee?: number;
  readonly makerFee?: number;
  readonly takerFee?: number;
  readonly timestamp: TimestampMs;
  readonly maker: Pubkey;
  readonly taker: Pubkey;
  readonly reason: "normal" | "liquidation" | "adl" | string;
  readonly slot: number;
}

/** Raw item shape returned by POST /account with `type: "fills"`. */
export interface UserFillResponseItem {
  readonly fills: UserFill;
}

export interface FundingPayment {
  readonly owner: Pubkey;
  readonly symbol: Symbol;
  readonly size: number;
  /** Signed USD payment. Positive = received funding, negative = paid. */
  readonly payment: number;
  readonly fundingRate: number;
  readonly markPrice: number;
  readonly slot: number;
  readonly timestamp: TimestampMs;
}

/** Raw item shape returned by POST /account with `type: "fundingHistory"`. */
export interface FundingPaymentResponseItem {
  readonly fundingPayment: FundingPayment;
}

// ---------------------------------------------------------------------------
// Agent Wallet (session keys)
// ---------------------------------------------------------------------------

export interface ManageAgentWalletParams {
  readonly action: "add" | "revoke";
  readonly agentPubkey: Pubkey;
  /** Optional scope hints — exact schema TBD from Bulk; we pass through. */
  readonly scope?: {
    readonly markets?: readonly Symbol[];
    readonly maxPositionUsd?: DecimalString;
    readonly expiresAt?: TimestampMs;
  };
}

// ---------------------------------------------------------------------------
// Testnet faucet
// ---------------------------------------------------------------------------

export interface FaucetRequestParams {
  readonly user: Pubkey;
}

export interface FaucetResponse {
  readonly txHash: string;
  readonly amountUsdc: DecimalString;
}

// ---------------------------------------------------------------------------
// WebSocket — subscribe/unsubscribe envelopes
// ---------------------------------------------------------------------------

/**
 * Real subscription shape per docs.bulk.trade/api-reference/ws-market-data.
 * The server responds with `{type:'subscriptionResponse', topics:[...]}`
 * once the subscription is active. Our client uses that ack to flip a
 * pending → active state.
 */
export type SubscriptionRequest =
  | { readonly type: "ticker"; readonly symbol: Symbol }
  | { readonly type: "trades"; readonly symbol: Symbol }
  | {
      readonly type: "candle";
      readonly symbol: Symbol;
      readonly interval: CandleIntervalWs;
    }
  | {
      readonly type: "l2Snapshot";
      readonly symbol: Symbol;
      readonly nlevels?: number;
      readonly aggregation?: number;
    }
  | { readonly type: "l2Delta"; readonly symbol: Symbol }
  | { readonly type: "risk"; readonly symbol: Symbol }
  | { readonly type: "frontendContext" };

export type CandleIntervalWs =
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

export interface SubscribeEnvelope {
  readonly method: "subscribe";
  readonly subscription: readonly SubscriptionRequest[];
}

export interface UnsubscribeEnvelope {
  readonly method: "unsubscribe";
  readonly topic: string;
}

export interface SubscriptionResponse {
  readonly type: "subscriptionResponse";
  readonly topics: readonly string[];
}

// ---------------------------------------------------------------------------
// WebSocket — message envelopes (one per stream type)
// ---------------------------------------------------------------------------

/**
 * Ticker stream message. Server wraps the raw ticker in `{type, data:{ticker}}`.
 * Topic: `ticker.{symbol}` — use the topic string to route on receive.
 */
export interface TickerMessage {
  readonly type: "ticker";
  readonly data: {
    readonly symbol: Symbol;
    readonly ticker: Ticker;
  };
}

/**
 * Trade stream message. One TradePrint per fill, multiple may arrive
 * batched in `trades[]`.
 */
export interface TradeMessage {
  readonly type: "trades";
  readonly data: {
    readonly symbol: Symbol;
    readonly trades: readonly TradePrint[];
  };
}

export interface TradePrint {
  readonly s: Symbol;
  /** Execution price. */
  readonly px: number;
  /** Size filled. */
  readonly sz: number;
  /** Milliseconds since epoch. */
  readonly time: TimestampMs;
  /** True = taker bought, false = taker sold. */
  readonly side: boolean;
  /** Maker pubkey (base58). */
  readonly maker: Pubkey;
  /** Taker pubkey (base58). */
  readonly taker: Pubkey;
  /** Optional: `"liquidation"`, `"adl"`. Absent for normal trades. */
  readonly reason?: string;
  /** Optional: present only when liquidation. */
  readonly liq?: boolean;
}

/** Candle stream message — `{t,T,o,h,l,c,v,n}`. */
export interface CandleMessage {
  readonly type: "candle";
  readonly data: {
    readonly symbol: Symbol;
    readonly interval: CandleIntervalWs;
    readonly candle: CandleWs;
  };
}

export interface CandleWs {
  /** Open timestamp (ms). */
  readonly t: TimestampMs;
  /** Close timestamp (ms). */
  readonly T: TimestampMs;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
  /** Trade count. */
  readonly n: number;
}

/**
 * L2 delta update. Only one side (bids OR asks) has levels per message.
 * `sz: 0` on a level means "remove".
 */
export interface L2DeltaMessage {
  readonly type: "l2Delta";
  readonly data: {
    readonly symbol: Symbol;
    /** `levels[0]` = bids (desc), `levels[1]` = asks (asc). */
    readonly levels: readonly [readonly L2Level[], readonly L2Level[]];
  };
}

export interface L2Level {
  readonly px: number;
  readonly sz: number;
  /** Always 0 for deltas, may be non-zero on snapshots. */
  readonly n: number;
}

/**
 * L2 snapshot update. Same shape as delta but always both sides populated.
 */
export interface L2SnapshotMessage {
  readonly type: "l2Snapshot";
  readonly data: {
    readonly symbol: Symbol;
    readonly levels: readonly [readonly L2Level[], readonly L2Level[]];
  };
}

/**
 * Frontend context stream — aggregated per-symbol summary for dashboards,
 * updated every 2s. Use this for /desk funding list instead of subscribing
 * to N individual tickers.
 */
export interface FrontendContextMessage {
  readonly type: "frontendContext";
  readonly data: {
    readonly ctx: readonly FrontendContextEntry[];
  };
}

export interface FrontendContextEntry {
  readonly symbol: Symbol;
  readonly volume: number;
  readonly funding: number;
  readonly oi: number;
  readonly lastPrice: number;
  readonly priceChange: number;
  readonly priceChangePercent: number;
}

/**
 * Risk metrics stream — Bulk's lambda surface for portfolio margin.
 * Event-driven; fires when the surface changes materially, not on every tick.
 * Consumers cache the latest surface per symbol and interpolate at eval time.
 */
export interface RiskMessage {
  readonly type: "risk";
  readonly data: {
    readonly symbol: Symbol;
    readonly risk: RiskSurfaceData;
  };
}

export interface RiskSurfaceData {
  readonly symbol: Symbol;
  readonly timestamp: TimestampMs;
  /** Current regime index (-12 to +12). */
  readonly regime: number;
  /** Leverage knot points, e.g. [1, 2, 5, 10, 20, 50]. */
  readonly leverage: readonly number[];
  /** Notional knot points in USD. */
  readonly notionals: readonly number[];
  /** `buy[notional_idx][leverage_idx]` → RiskPoint. */
  readonly buy: readonly (readonly RiskPoint[])[];
  readonly sell: readonly (readonly RiskPoint[])[];
  /** Pairwise correlations, e.g. [["BTC:ETH", 0.71], ["BTC:SOL", 0.54]]. */
  readonly corrs: readonly (readonly [string, number])[];
}

export interface RiskPoint {
  /** Start-of-regime maintenance margin ratio. */
  readonly mmrO: number;
  /** End-of-regime maintenance margin ratio. */
  readonly mmrE: number;
  /** Probability of remaining in the regime. */
  readonly p: number;
}

/**
 * Union of all message types a consumer might receive. Use the `type` field
 * to discriminate; routing by topic string is also valid since Bulk returns
 * topics in the subscription response.
 */
export type BulkWsMessage =
  | SubscriptionResponse
  | TickerMessage
  | TradeMessage
  | CandleMessage
  | L2DeltaMessage
  | L2SnapshotMessage
  | FrontendContextMessage
  | RiskMessage;
