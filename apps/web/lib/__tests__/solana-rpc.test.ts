import { describe, expect, it } from "vitest";

import { getSolanaRpcEndpoints } from "../solana-rpc";

describe("getSolanaRpcEndpoints", () => {
  it("always provides Privy with working devnet transports", () => {
    expect(getSolanaRpcEndpoints({})).toEqual({
      httpUrl: "https://api.devnet.solana.com",
      wsUrl: "wss://api.devnet.solana.com",
    });
  });

  it("derives websocket transport from a configured provider", () => {
    expect(
      getSolanaRpcEndpoints({
        NEXT_PUBLIC_SOLANA_RPC_URL: "https://solana-devnet.example/rpc",
      }),
    ).toEqual({
      httpUrl: "https://solana-devnet.example/rpc",
      wsUrl: "wss://solana-devnet.example/rpc",
    });
  });

  it("honors an explicit websocket endpoint", () => {
    expect(
      getSolanaRpcEndpoints({
        NEXT_PUBLIC_SOLANA_RPC_URL: "https://rpc.example",
        NEXT_PUBLIC_SOLANA_WS_URL: "wss://subscriptions.example",
      }).wsUrl,
    ).toBe("wss://subscriptions.example");
  });
});
