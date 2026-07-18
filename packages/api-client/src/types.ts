export type TimestampMs = number;

export type NonceNs = bigint;

export type Pubkey = string;

export type Symbol = string;

export type DecimalString = string;

export type TimeInForce = "GTC" | "IOC" | "ALO";

export interface BulkErrorResponse {
  readonly error: string;
  readonly message?: string;
  readonly code?: number;
}

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
  readonly tr: DecimalString;
  readonly d: boolean;
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
  readonly tr: DecimalString;
}

export type OrderType =
  | LimitOrderType
  | MarketOrderType
  | StopOrderType
  | TakeProfitOrderType
  | TrailingStopOrderType;

export interface PlaceOrderParams {
  readonly c: Symbol;
  readonly b: boolean;
  readonly sz: DecimalString;
  readonly px?: DecimalString;
  readonly r: boolean;
  readonly t: OrderType;
  readonly cloid?: string;
}

export interface CancelOrderParams {
  readonly c: Symbol;
  readonly oid: number;
}

export interface OrderAck {
  readonly oid: number;
  readonly status: string;
  readonly message?: string;
}

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

export interface Ticker {
  readonly priceChange: number;
  readonly priceChangePercent: number;
  readonly lastPrice: number;
  readonly highPrice: number;
  readonly lowPrice: number;
  readonly volume: number;
  readonly quoteVolume: number;
  readonly markPrice: number;
  readonly oraclePrice: number;
  readonly openInterest: number;
  readonly fundingRate: number;
  readonly regime: number;
  readonly regimeDt: number;
  readonly regimeVol: number;
  readonly regimeMv: number;
  readonly fairBookPx: number;
  readonly fairVol: number;
  readonly fairBias: number;
  readonly timestamp: number;
}

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

export interface L2Book {
  readonly s: Symbol;
  readonly ts: TimestampMs;
  readonly bids: readonly [DecimalString, DecimalString][];
  readonly asks: readonly [DecimalString, DecimalString][];
}

export interface ExchangeStats {
  readonly volume24h: DecimalString;
  readonly trades24h: number;
  readonly openInterestUsd: DecimalString;
}

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

export interface FeeState {
  readonly makerBps: number;
  readonly takerBps: number;
  readonly tierName: string;
  readonly volume30dUsd: DecimalString;
}

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
  readonly builderCodeApprovals?: readonly {
    readonly recipient: Pubkey;
    readonly maxFee: number;
  }[];
  readonly ts: TimestampMs;
}

export interface Position {
  readonly s: Symbol;
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

export interface UserFillResponseItem {
  readonly fills: UserFill;
}

export interface FundingPayment {
  readonly owner: Pubkey;
  readonly symbol: Symbol;
  readonly size: number;
  readonly payment: number;
  readonly fundingRate: number;
  readonly markPrice: number;
  readonly slot: number;
  readonly timestamp: TimestampMs;
}

export interface FundingPaymentResponseItem {
  readonly fundingPayment: FundingPayment;
}

export interface ManageAgentWalletParams {
  readonly action: "add" | "revoke";
  readonly agentPubkey: Pubkey;
  readonly scope?: {
    readonly markets?: readonly Symbol[];
    readonly maxPositionUsd?: DecimalString;
    readonly expiresAt?: TimestampMs;
  };
}

export interface FaucetRequestParams {
  readonly user: Pubkey;
}

export interface FaucetResponse {
  readonly txHash: string;
  readonly amountUsdc: DecimalString;
}

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

export interface TickerMessage {
  readonly type: "ticker";
  readonly data: {
    readonly symbol: Symbol;
    readonly ticker: Ticker;
  };
}

export interface TradeMessage {
  readonly type: "trades";
  readonly data: {
    readonly symbol: Symbol;
    readonly trades: readonly TradePrint[];
  };
}

export interface TradePrint {
  readonly s: Symbol;
  readonly px: number;
  readonly sz: number;
  readonly time: TimestampMs;
  readonly side: boolean;
  readonly maker: Pubkey;
  readonly taker: Pubkey;
  readonly reason?: string;
  readonly liq?: boolean;
}

export interface CandleMessage {
  readonly type: "candle";
  readonly data: {
    readonly symbol: Symbol;
    readonly interval: CandleIntervalWs;
    readonly candle: CandleWs;
  };
}

export interface CandleWs {
  readonly t: TimestampMs;
  readonly T: TimestampMs;
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
  readonly v: number;
  readonly n: number;
}

export interface L2DeltaMessage {
  readonly type: "l2Delta";
  readonly data: {
    readonly symbol: Symbol;
    readonly levels: readonly [readonly L2Level[], readonly L2Level[]];
  };
}

export interface L2Level {
  readonly px: number;
  readonly sz: number;
  readonly n: number;
}

export interface L2SnapshotMessage {
  readonly type: "l2Snapshot";
  readonly data: {
    readonly symbol: Symbol;
    readonly levels: readonly [readonly L2Level[], readonly L2Level[]];
  };
}

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
  readonly regime: number;
  readonly leverage: readonly number[];
  readonly notionals: readonly number[];
  readonly buy: readonly (readonly RiskPoint[])[];
  readonly sell: readonly (readonly RiskPoint[])[];
  readonly corrs: readonly (readonly [string, number])[];
}

export interface RiskPoint {
  readonly mmrO: number;
  readonly mmrE: number;
  readonly p: number;
}

export type BulkWsMessage =
  | SubscriptionResponse
  | TickerMessage
  | TradeMessage
  | CandleMessage
  | L2DeltaMessage
  | L2SnapshotMessage
  | FrontendContextMessage
  | RiskMessage;
