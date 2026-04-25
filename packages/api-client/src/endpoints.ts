// packages/api-client/src/endpoints.ts
/**
 * Endpoint helpers — a thin, typed layer over `BulkClient`.
 *
 * Each function documents the exact URL path it calls per
 * https://docs.bulk.trade/api-reference/introduction. If an endpoint
 * shape changes in the Bulk docs, update the corresponding function
 * here; downstream code should never construct raw paths.
 */

import type { BulkClient } from './client.js';
import type {
  AccountQueryParams,
  CancelOrderParams,
  Candle,
  CandleInterval,
  ExchangeInfo,
  ExchangeStats,
  FaucetRequestParams,
  FaucetResponse,
  FeeState,
  FundingPayment,
  FundingPaymentResponseItem,
  FullAccount,
  L2Book,
  ManageAgentWalletParams,
  OpenOrder,
  OrderAck,
  PlaceOrderParams,
  Position,
  Pubkey,
  RiskSurfaces,
  Symbol,
  Ticker,
  UserFill,
  UserFillResponseItem,
} from './types.js';

// ---------------------------------------------------------------------------
// Market Data (HTTP, unsigned)
// ---------------------------------------------------------------------------

/** GET /exchangeInfo — market specs, server time. */
export function getExchangeInfo(client: BulkClient): Promise<ExchangeInfo> {
  return client.get<ExchangeInfo>('/exchangeInfo');
}

/** GET /ticker — snapshot for one symbol. */
export function getTicker(client: BulkClient, symbol: Symbol): Promise<Ticker> {
  return client.get<Ticker>('/ticker', { symbol });
}

/** GET /ticker — snapshot for every active symbol. */
export function getAllTickers(client: BulkClient): Promise<readonly Ticker[]> {
  return client.get<readonly Ticker[]>('/ticker');
}

/** GET /klines — OHLCV candles. */
export function getCandles(
  client: BulkClient,
  params: {
    readonly symbol: Symbol;
    readonly interval: CandleInterval;
    readonly startMs?: number;
    readonly endMs?: number;
    readonly limit?: number;
  },
): Promise<readonly Candle[]> {
  const query: Record<string, string | number | undefined> = {
    symbol: params.symbol,
    interval: params.interval,
  };
  if (params.startMs !== undefined) query['startTime'] = params.startMs;
  if (params.endMs !== undefined) query['endTime'] = params.endMs;
  if (params.limit !== undefined) query['limit'] = params.limit;
  return client.get<readonly Candle[]>('/klines', query);
}

/** GET /l2Book — Level-2 order book snapshot. */
export function getL2Book(
  client: BulkClient,
  params: { readonly symbol: Symbol; readonly depth?: number },
): Promise<L2Book> {
  const query: Record<string, string | number | undefined> = {
    symbol: params.symbol,
  };
  if (params.depth !== undefined) query['depth'] = params.depth;
  return client.get<L2Book>('/l2Book', query);
}

/** GET /stats — 24h exchange-wide stats. */
export function getExchangeStats(client: BulkClient): Promise<ExchangeStats> {
  return client.get<ExchangeStats>('/stats');
}

/** GET /riskSurfaces — current risk parameters per market. */
export function getRiskSurfaces(client: BulkClient): Promise<RiskSurfaces> {
  return client.get<RiskSurfaces>('/riskSurfaces');
}

/** GET /feeState — current maker/taker fees and volume tier for the caller. */
export function getFeeState(
  client: BulkClient,
  user: Pubkey,
): Promise<FeeState> {
  return client.get<FeeState>('/feeState', { user });
}

// ---------------------------------------------------------------------------
// Account Queries (HTTP, unsigned POST)
// ---------------------------------------------------------------------------

/**
 * POST /account — query account state without signing.
 *
 * `type: 'fullAccount'` returns `FullAccount`.
 * Other types narrow the payload; this function uses a discriminated
 * return based on the input `type`.
 */
export async function queryAccount(
  client: BulkClient,
  params: AccountQueryParams,
): Promise<
  | FullAccount
  | readonly Position[]
  | readonly OpenOrder[]
  | readonly UserFillResponseItem[]
  | readonly FundingPaymentResponseItem[]
> {
  switch (params.type) {
    case 'fullAccount':
      return client.postUnsigned<AccountQueryParams, FullAccount>(
        '/account',
        params,
      );
    case 'positions':
      return client.postUnsigned<AccountQueryParams, readonly Position[]>(
        '/account',
        params,
      );
    case 'openOrders':
      return client.postUnsigned<AccountQueryParams, readonly OpenOrder[]>(
        '/account',
        params,
      );
    case 'fills':
      return client.postUnsigned<
        AccountQueryParams,
        readonly UserFillResponseItem[]
      >('/account', params);
    case 'fundingHistory':
      return client.postUnsigned<
        AccountQueryParams,
        readonly FundingPaymentResponseItem[]
      >('/account', params);
  }
}

/** Convenience: typed wrapper that always returns FullAccount. */
export function queryFullAccount(
  client: BulkClient,
  user: Pubkey,
): Promise<FullAccount> {
  return client.postUnsigned<AccountQueryParams, FullAccount>('/account', {
    type: 'fullAccount',
    user,
  });
}

/**
 * POST /account with `{ type: "fills", user }` — recent user fill history.
 *
 * Bulk currently returns last 5000 fills for account fills query; this is not
 * guaranteed full 30d history for high-volume leaders.
 */
export async function queryUserFills(
  client: BulkClient,
  user: Pubkey,
): Promise<readonly UserFill[]> {
  const rows = await client.postUnsigned<
    AccountQueryParams,
    readonly UserFillResponseItem[]
  >('/account', {
    type: 'fills',
    user,
  });

  return rows.map((row) => row.fills);
}

/**
 * POST /account with `{ type: "fundingHistory", user }` â€” recent funding
 * payments.
 *
 * Bulk currently returns last 5000 funding payments and no pagination is
 * documented.
 */
export async function queryUserFundingPayments(
  client: BulkClient,
  user: Pubkey,
): Promise<readonly FundingPayment[]> {
  const rows = await client.postUnsigned<
    AccountQueryParams,
    readonly FundingPaymentResponseItem[]
  >('/account', {
    type: 'fundingHistory',
    user,
  });

  return rows.map((row) => row.fundingPayment);
}

// ---------------------------------------------------------------------------
// Trading (HTTP, signed)
// ---------------------------------------------------------------------------

type PlaceOrderAction = {
  readonly type: 'order';
  readonly orders: readonly PlaceOrderParams[];
};

type CancelOrderAction = {
  readonly type: 'cancel';
  readonly cancels: readonly CancelOrderParams[];
};

type ManageAgentAction = {
  readonly type: 'agentWallet';
} & ManageAgentWalletParams;

type UpdateUserSettingsAction = {
  readonly type: 'updateSettings';
  readonly settings: Record<string, unknown>;
};

/** POST /order (signed) — place one or more orders atomically. */
export function placeOrders(
  client: BulkClient,
  orders: readonly PlaceOrderParams[],
): Promise<readonly OrderAck[]> {
  return client.postSigned<PlaceOrderAction, readonly OrderAck[]>('/order', {
    type: 'order',
    orders,
  });
}

/** POST /order (signed) — cancel by order ID. */
export function cancelOrders(
  client: BulkClient,
  cancels: readonly CancelOrderParams[],
): Promise<readonly OrderAck[]> {
  return client.postSigned<CancelOrderAction, readonly OrderAck[]>('/order', {
    type: 'cancel',
    cancels,
  });
}

/** POST /agentWallet (signed) — add or revoke an agent wallet. */
export function manageAgentWallet(
  client: BulkClient,
  params: ManageAgentWalletParams,
): Promise<{ readonly status: string }> {
  return client.postSigned<ManageAgentAction, { readonly status: string }>(
    '/agentWallet',
    { type: 'agentWallet', ...params },
  );
}

/** POST /userSettings (signed) — update user settings. */
export function updateUserSettings(
  client: BulkClient,
  settings: Record<string, unknown>,
): Promise<{ readonly status: string }> {
  return client.postSigned<
    UpdateUserSettingsAction,
    { readonly status: string }
  >('/userSettings', { type: 'updateSettings', settings });
}

// ---------------------------------------------------------------------------
// Testnet faucet (signed)
// ---------------------------------------------------------------------------

type FaucetAction = {
  readonly type: 'faucet';
} & FaucetRequestParams;

/** POST /faucet (signed, testnet only). */
export function requestFaucet(
  client: BulkClient,
  params: FaucetRequestParams,
): Promise<FaucetResponse> {
  return client.postSigned<FaucetAction, FaucetResponse>('/faucet', {
    type: 'faucet',
    ...params,
  });
}
