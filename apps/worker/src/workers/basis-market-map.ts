import type { MarketSpec } from "@klub/api-client";

export function marketMap(markets: readonly MarketSpec[]) {
  return new Map(markets.map((market) => [market.symbol, market]));
}

export function requireMarket(
  markets: ReadonlyMap<string, MarketSpec>,
  symbol: string,
) {
  const market = markets.get(symbol);
  if (!market || market.status !== "TRADING") {
    throw new Error(`${symbol} is not active.`);
  }
  return market;
}
