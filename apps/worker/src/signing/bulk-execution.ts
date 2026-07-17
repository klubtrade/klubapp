import type {
  BuilderCodeApproval,
  PreparedBulkTransaction,
  RoutableOrderInput,
} from "@klub/api-client";

export interface CopyTradeOrder {
  readonly agentWalletId: string;
  readonly agentWalletPublicKey: string;
  readonly accountPublicKey: string;
  readonly symbol: string;
  readonly side: "long" | "short";
  readonly sizeBase: number;
  readonly orderType: "market" | "limit";
  readonly price: number;
  readonly leaderEventId: string;
}

export interface CopyTradeExecutor {
  submit(order: CopyTradeOrder): Promise<void>;
}

interface CopyTradeGateway {
  prepareOrder(params: {
    readonly order: RoutableOrderInput;
    readonly options: {
      readonly account: string;
      readonly signer: string;
      readonly nonce: number;
    };
    readonly approvals?: readonly BuilderCodeApproval[];
  }): PreparedBulkTransaction;
  finalizeAndSubmit<TResponse>(params: {
    readonly prepared: PreparedBulkTransaction;
    readonly signature: string;
  }): Promise<TResponse>;
}

export interface CanonicalCopyTradeExecutorConfig {
  readonly gateway: CopyTradeGateway;
  /** Loads the agent key from the secure key service and signs canonical bytes. */
  readonly signPrepared: (params: {
    readonly agentWalletId: string;
    readonly expectedPublicKey: string;
    readonly messageBytes: Uint8Array;
  }) => Promise<string>;
  readonly getBuilderCodeApprovals?: (
    accountPublicKey: string,
  ) => Promise<readonly BuilderCodeApproval[]>;
}

export function createCanonicalCopyTradeExecutor(
  config: CanonicalCopyTradeExecutorConfig,
): CopyTradeExecutor {
  return {
    async submit(order) {
      const prepared = config.gateway.prepareOrder({
        order: toRoutableOrder(order),
        options: {
          account: order.accountPublicKey,
          signer: order.agentWalletPublicKey,
          nonce: Date.now(),
        },
        ...(config.getBuilderCodeApprovals
          ? {
              approvals: await config.getBuilderCodeApprovals(
                order.accountPublicKey,
              ),
            }
          : {}),
      });
      const signature = await config.signPrepared({
        agentWalletId: order.agentWalletId,
        expectedPublicKey: order.agentWalletPublicKey,
        messageBytes: prepared.messageBytes,
      });
      await config.gateway.finalizeAndSubmit({ prepared, signature });
    },
  };
}

export const disabledCopyTradeExecutor: CopyTradeExecutor = {
  async submit() {
    throw new Error(
      "Copy-trade execution gateway is not configured with a secure agent key provider",
    );
  },
};

function toRoutableOrder(order: CopyTradeOrder): RoutableOrderInput {
  const base = {
    type: "order" as const,
    symbol: order.symbol,
    isBuy: order.side === "long",
    size: order.sizeBase,
    reduceOnly: false,
    iso: false,
  };
  if (order.orderType === "limit") {
    return {
      ...base,
      price: order.price,
      orderType: { type: "limit", tif: "GTC" },
    };
  }
  return {
    ...base,
    price: 0,
    orderType: { type: "market", isMarket: true, triggerPx: 0 },
  };
}
