export const SOLANA_DEVNET_CHAIN = "solana:devnet" as const;

const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";

export interface SolanaRpcEndpoints {
  readonly httpUrl: string;
  readonly wsUrl: string;
}

/**
 * One source of truth for the browser's Solana transports. Privy requires
 * both transports for sign-and-send; configuring only the vault RPC client
 * is not sufficient.
 */
export function getSolanaRpcEndpoints(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SolanaRpcEndpoints {
  const httpUrl =
    env["NEXT_PUBLIC_SOLANA_RPC_URL"]?.trim() || DEFAULT_DEVNET_RPC_URL;
  const explicitWs = env["NEXT_PUBLIC_SOLANA_WS_URL"]?.trim();

  return {
    httpUrl,
    wsUrl: explicitWs || toWebSocketUrl(httpUrl),
  };
}

function toWebSocketUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice(8)}`;
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice(7)}`;
  throw new Error("Solana RPC URL must use http:// or https://");
}
