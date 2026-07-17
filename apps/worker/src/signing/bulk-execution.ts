export interface CopyTradeOrder {
  readonly agentWalletPublicKey: string;
  readonly symbol: string;
  readonly side: "long" | "short";
  readonly sizeBase: number;
  readonly orderType: "market" | "limit";
  readonly price: number;
  readonly leaderEventId: string;
}

/**
 * Copy execution is intentionally unavailable until the official Bulk
 * transaction gateway can unwrap the agent key and produce canonical signed
 * bytes. Failing the job is safer than silently submitting an unsigned or
 * hand-serialized order.
 */
export async function signAndSubmit(order: CopyTradeOrder): Promise<never> {
  void order;
  throw new Error("Copy-trade execution gateway is not configured");
}
