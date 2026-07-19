// packages/api-client/src/__tests__/client.test.ts
import { describe, expect, it, vi } from "vitest";

import { BulkClient } from "../client.js";
import { BulkHttpError, BulkNetworkError } from "../errors.js";
import {
  getExchangeInfo,
  getTicker,
  queryFullAccount,
  queryUserClosedPositions,
  queryUserFundingPayments,
  queryUserFills,
} from "../endpoints.js";
import { BulkWebSocket, type WSTransportConstructor } from "../websocket.js";

// ---------------------------------------------------------------------------
// fetch mocks
// ---------------------------------------------------------------------------

function makeFetch(
  response:
    | { status: number; body: unknown }
    | ((url: string, init?: RequestInit) => Promise<Response>),
): typeof fetch {
  if (typeof response === "function") {
    return response as typeof fetch;
  }
  return (async () =>
    new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

// ---------------------------------------------------------------------------
// Core client
// ---------------------------------------------------------------------------

describe("BulkClient — HTTP transport", () => {
  it("builds query strings from params on GET", async () => {
    const fetchImpl = vi.fn(makeFetch({ status: 200, body: { ok: true } }));
    const client = new BulkClient({ fetch: fetchImpl as typeof fetch });
    await client.get("/ticker", { symbol: "BTC-USD", limit: 5 });
    const calledUrl = fetchImpl.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("/ticker");
    expect(calledUrl).toContain("symbol=BTC-USD");
    expect(calledUrl).toContain("limit=5");
  });

  it("throws BulkHttpError with status and body on non-2xx", async () => {
    const client = new BulkClient({
      fetch: makeFetch({ status: 429, body: { error: "rate_limited" } }),
    });
    await expect(client.get("/ticker", { symbol: "BTC-USD" })).rejects.toThrow(
      BulkHttpError,
    );
    await expect(
      client.get("/ticker", { symbol: "BTC-USD" }),
    ).rejects.toMatchObject({
      status: 429,
      body: { error: "rate_limited" },
    });
  });

  it("throws BulkNetworkError when fetch itself fails", async () => {
    const client = new BulkClient({
      fetch: (async () => {
        throw new TypeError("network down");
      }) as typeof fetch,
    });
    await expect(client.get("/stats")).rejects.toThrow(BulkNetworkError);
  });

  it("throws BulkNetworkError on timeout", async () => {
    const client = new BulkClient({
      timeoutMs: 10,
      fetch: ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        })) as typeof fetch,
    });
    await expect(client.get("/stats")).rejects.toThrow(BulkNetworkError);
  });
});

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

describe("endpoint helpers", () => {
  it("getExchangeInfo → GET /exchangeInfo", async () => {
    const fetchImpl = vi.fn(makeFetch({ status: 200, body: [] }));
    const client = new BulkClient({ fetch: fetchImpl as typeof fetch });
    const info = await getExchangeInfo(client);
    expect(info).toEqual([]);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toMatch(/\/exchangeInfo/);
  });

  it("getTicker forwards symbol", async () => {
    const fetchImpl = vi.fn(
      makeFetch({ status: 200, body: { s: "BTC-USD", mark: "60000" } }),
    );
    const client = new BulkClient({ fetch: fetchImpl as typeof fetch });
    await getTicker(client, "BTC-USD");
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("symbol=BTC-USD");
  });

  it("queryFullAccount POSTs the fullAccount envelope", async () => {
    const fetchImpl = vi.fn(
      makeFetch({ status: 200, body: { user: "pk", positions: [] } }),
    );
    const client = new BulkClient({ fetch: fetchImpl as typeof fetch });
    await queryFullAccount(client, "Fu...pkh7");
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ type: "fullAccount", user: "Fu...pkh7" });
  });

  it("queryUserFills POSTs the fills account query for the Bulk test pubkey", async () => {
    const testPubkey = "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7";
    const fetchImpl = vi.fn(
      makeFetch({
        status: 200,
        body: [
          {
            fills: {
              maker: "maker_pubkey_base58",
              taker: testPubkey,
              orderIdMaker: "maker_order_hash",
              orderIdTaker: "taker_order_hash",
              isBuy: true,
              symbol: "BTC-USD",
              amount: 0.1,
              price: 100000,
              makerFee: -0.15,
              takerFee: 0.35,
              fee: 0.35,
              reason: "normal",
              slot: 12345,
              timestamp: 1699564800000,
            },
          },
        ],
      }),
    );
    const client = new BulkClient({ fetch: fetchImpl as typeof fetch });

    const fills = await queryUserFills(client, testPubkey);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ type: "fills", user: testPubkey });
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({
      symbol: "BTC-USD",
      amount: 0.1,
      price: 100000,
      isBuy: true,
      fee: 0.35,
      makerFee: -0.15,
      takerFee: 0.35,
      timestamp: 1699564800000,
      maker: "maker_pubkey_base58",
      taker: testPubkey,
      reason: "normal",
      slot: 12345,
    });
  });

  it("queryUserFundingPayments POSTs the fundingHistory account query", async () => {
    const testPubkey = "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7";
    const fetchImpl = vi.fn(
      makeFetch({
        status: 200,
        body: [
          {
            fundingPayment: {
              owner: testPubkey,
              symbol: "BTC-USD",
              size: 0.5,
              payment: 12.5,
              fundingRate: 0.0001,
              markPrice: 100000,
              slot: 123456789,
              timestamp: 1763316177219383423,
            },
          },
        ],
      }),
    );
    const client = new BulkClient({ fetch: fetchImpl as typeof fetch });

    const payments = await queryUserFundingPayments(client, testPubkey);

    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ type: "fundingHistory", user: testPubkey });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      owner: testPubkey,
      symbol: "BTC-USD",
      size: 0.5,
      payment: 12.5,
      fundingRate: 0.0001,
      markPrice: 100000,
      slot: 123456789,
      timestamp: 1763316177219383423,
    });
  });

  it("queryUserClosedPositions unwraps authoritative position cycles", async () => {
    const testPubkey = "FuueqefENiGEW6uMqZQgmwjzgpnb85EgUcZa5Em4PQh7";
    const closed = {
      owner: testPubkey,
      symbol: "BTC-USD",
      maxQuantity: 1,
      totalVolume: 2,
      avgOpenPrice: 100,
      avgClosePrice: 110,
      realizedPnl: 10,
      fees: -1,
      funding: 0.5,
      openTime: 1,
      closeTime: 2,
      closeReason: "normal",
    };
    const fetchImpl = vi.fn(
      makeFetch({ status: 200, body: [{ positions: closed }] }),
    );
    const client = new BulkClient({ fetch: fetchImpl as typeof fetch });

    await expect(queryUserClosedPositions(client, testPubkey)).resolves.toEqual(
      [closed],
    );
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      type: "positions",
      user: testPubkey,
    });
  });
});

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

describe("BulkWebSocket", () => {
  /**
   * Tiny in-memory transport that simulates a server — lets us drive
   * open/close/message events without touching the network.
   */
  function makeMockTransport() {
    const instances: MockTransport[] = [];

    class MockTransport {
      onopen: ((e: unknown) => void) | null = null;
      onclose: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      readyState = 1;
      sent: string[] = [];
      constructor(public url: string) {
        instances.push(this);
      }
      send(data: string): void {
        this.sent.push(data);
      }
      close(): void {
        this.readyState = 3;
        this.onclose?.({});
      }
    }

    return { MockTransport, instances };
  }

  it("opens, subscribes, and routes messages to handlers", () => {
    const { MockTransport, instances } = makeMockTransport();
    const ws = new BulkWebSocket({
      WebSocketImpl: MockTransport as unknown as WSTransportConstructor,
    });
    const handler = vi.fn();
    ws.onTicker("BTC-USD", handler);
    ws.connect();

    const transport = instances[0]!;
    transport.onopen?.({});

    // Should have sent a subscribe frame after open
    expect(transport.sent.some((s) => s.includes("subscribe"))).toBe(true);

    const payload = { s: "BTC-USD", markPx: 60_000 };
    transport.onmessage?.({
      data: JSON.stringify({
        type: "ticker",
        data: { ticker: payload, symbol: "BTC-USD" },
      }),
    });
    expect(handler).toHaveBeenCalledWith(payload, "BTC-USD");
  });

  it("re-sends subscribe frames after reconnect", () => {
    vi.useFakeTimers();
    const { MockTransport, instances } = makeMockTransport();
    const ws = new BulkWebSocket({
      WebSocketImpl: MockTransport as unknown as WSTransportConstructor,
      initialBackoffMs: 1,
    });
    ws.onL2Snapshot("ETH-USD", {}, () => undefined);
    ws.connect();
    instances[0]!.onopen?.({});
    expect(instances[0]!.sent.length).toBeGreaterThan(0);

    // Simulate disconnect
    instances[0]!.onclose?.({});
    vi.advanceTimersByTime(5);
    // A second transport should have been created
    expect(instances.length).toBe(2);
    instances[1]!.onopen?.({});
    // The subscription frame is re-sent
    expect(instances[1]!.sent.some((s) => s.includes("l2Snapshot"))).toBe(true);

    ws.disconnect();
    vi.useRealTimers();
  });

  it("disconnect stops reconnect attempts", () => {
    vi.useFakeTimers();
    const { MockTransport, instances } = makeMockTransport();
    const ws = new BulkWebSocket({
      WebSocketImpl: MockTransport as unknown as WSTransportConstructor,
      initialBackoffMs: 1,
    });
    ws.connect();
    instances[0]!.onopen?.({});
    ws.disconnect();
    instances[0]!.onclose?.({});
    vi.advanceTimersByTime(100);
    // Only the original transport exists
    expect(instances.length).toBe(1);
    vi.useRealTimers();
  });
});
