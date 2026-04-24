// packages/api-client/src/index.ts
/**
 * @cockpit/api-client — Typed Bulk Exchange SDK
 *
 * Typical usage:
 *
 * ```ts
 * import { BulkClient, getTicker } from '@cockpit/api-client';
 *
 * const client = new BulkClient();
 * const ticker = await getTicker(client, 'BTC-USD');
 * ```
 */

// Core
export { BulkClient } from './client.js';
export type { BulkClientConfig, Signer } from './client.js';

// Errors
export {
  BulkClientError,
  BulkHttpError,
  BulkNetworkError,
  BulkSigningRequiredError,
  BulkValidationError,
} from './errors.js';

// Endpoints
export {
  cancelOrders,
  getAllTickers,
  getCandles,
  getExchangeInfo,
  getExchangeStats,
  getFeeState,
  getL2Book,
  getRiskSurfaces,
  getTicker,
  manageAgentWallet,
  placeOrders,
  queryAccount,
  queryFullAccount,
  queryUserFills,
  requestFaucet,
  updateUserSettings,
} from './endpoints.js';

// WebSocket
export { BulkWebSocket } from './websocket.js';
export type {
  BulkWebSocketConfig,
  ConnectionState,
  FrontendContextRow,
  LiveRiskSurface,
  RiskPoint,
  RiskStream,
  StreamHandler,
  Subscription,
  TradeUpdate,
  WSTransport,
  WSTransportConstructor,
} from './websocket.js';

// Types
export type {
  AccountQueryParams,
  AccountQueryType,
  BulkErrorResponse,
  CancelOrderParams,
  Candle,
  CandleInterval,
  DecimalString,
  ExchangeInfo,
  ExchangeStats,
  FaucetRequestParams,
  FaucetResponse,
  FeeState,
  FullAccount,
  L2Book,
  LimitOrderType,
  ManageAgentWalletParams,
  MarketOrderType,
  MarketSpec,
  NonceNs,
  OpenOrder,
  OrderAck,
  OrderType,
  OrderTypeTag,
  PlaceOrderParams,
  Position,
  Pubkey,
  RiskSurface,
  RiskSurfaces,
  SignedRequest,
  StopOrderType,
  Symbol,
  TakeProfitOrderType,
  Ticker,
  TimeInForce,
  TimestampMs,
  TrailingStopOrderType,
  UserFill,
  UserFillResponseItem,
} from './types.js';
