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
export { BulkClient } from "./client.js";
export type { BulkClientConfig, Signer } from "./client.js";

// Builder Codes
export {
  BuilderCodeError,
  MAX_BUILDER_FEE_BPS,
  MIN_BUILDER_FEE_BPS,
  assertBuilderCode,
  createApproveBuilderCodeAction,
  createRevokeBuilderCodeAction,
  findBuilderCodeApproval,
  routeOrderWithBuilderCode,
} from "./builder-codes.js";
export type {
  ApproveBuilderCodeAction,
  BuilderCode,
  BuilderCodeApproval,
  BuilderCodePolicy,
  BulkNetwork,
  LimitOrderInput,
  MarketOrderInput,
  RevokeBuilderCodeAction,
  RoutableOrderInput,
  RoutedOrderInput,
} from "./builder-codes.js";

// Signed transaction gateway
export { BulkExchangeGateway, normalizeSignedTransaction } from "./gateway.js";
export type {
  BulkExchangeGatewayConfig,
  BulkKeychainAdapter,
  PreparedBulkTransaction,
  PrepareOptions,
  SignedBulkTransaction,
} from "./gateway.js";

// Environments
export { BULK_ENVIRONMENTS, getBulkEnvironment } from "./environments.js";
export type { BulkEnvironment } from "./environments.js";

// Errors
export {
  BulkClientError,
  BulkHttpError,
  BulkNetworkError,
  BulkSigningRequiredError,
  BulkValidationError,
} from "./errors.js";

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
  queryUserFundingPayments,
  queryUserFills,
  requestFaucet,
  updateUserSettings,
} from "./endpoints.js";

// WebSocket
export { BulkWebSocket } from "./websocket.js";
export type {
  AccountUpdate,
  BulkWebSocketConfig,
  ConnectionState,
  FrontendContextRow,
  L2Delta,
  L2Level,
  L2Snapshot,
  LiveRiskSurface,
  RiskPoint,
  RiskStream,
  StreamHandler,
  Subscription,
  TradeUpdate,
  WSTransport,
  WSTransportConstructor,
} from "./websocket.js";

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
  FundingPayment,
  FundingPaymentResponseItem,
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
} from "./types.js";
