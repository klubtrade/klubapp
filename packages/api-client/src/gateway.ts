import type { BulkClient } from "./client.js";
import {
  createApproveBuilderCodeAction,
  createRevokeBuilderCodeAction,
  routeOrderWithBuilderCode,
  type BuilderCodeApproval,
  type BuilderCodePolicy,
  type BulkNetwork,
  type RoutableOrderInput,
  type RoutedOrderInput,
} from "./builder-codes.js";
import type { Pubkey } from "./types.js";

export interface PrepareOptions {
  readonly account: Pubkey;
  readonly signer?: Pubkey;
  readonly nonce?: number;
}

export interface PreparedBulkTransaction {
  readonly messageBytes: Uint8Array;
  readonly actions: string | readonly unknown[];
  readonly nonce: number;
  readonly account: Pubkey;
  readonly signer: Pubkey;
}

export interface SignedBulkTransaction {
  readonly actions: readonly unknown[];
  readonly nonce: number;
  readonly account: Pubkey;
  readonly signer: Pubkey;
  readonly signature: string;
}

/** Runtime adapter implemented by bulk-keychain-wasm or bulk-keychain. */
export interface BulkKeychainAdapter {
  prepareOrder(
    order: RoutedOrderInput,
    options: PrepareOptions,
  ): PreparedBulkTransaction;
  prepareApproveBuilderCode(
    recipient: Pubkey,
    feeBps: number,
    options: PrepareOptions,
  ): PreparedBulkTransaction;
  prepareRevokeBuilderCode(
    recipient: Pubkey,
    options: PrepareOptions,
  ): PreparedBulkTransaction;
  finalize(
    prepared: PreparedBulkTransaction,
    signature: string,
  ): Omit<SignedBulkTransaction, "actions"> & {
    readonly actions: string | readonly unknown[];
  };
}

export interface BulkExchangeGatewayConfig {
  readonly client: BulkClient;
  readonly keychain: BulkKeychainAdapter;
  readonly network: BulkNetwork;
  readonly builderCode?: BuilderCodePolicy;
}

/**
 * One boundary for preparing, validating, and transporting signed Bulk
 * transactions. Private keys stay in the injected keychain/wallet runtime.
 */
export class BulkExchangeGateway {
  constructor(private readonly config: BulkExchangeGatewayConfig) {}

  prepareOrder(params: {
    readonly order: RoutableOrderInput;
    readonly options: PrepareOptions;
    readonly approvals?: readonly BuilderCodeApproval[];
  }): PreparedBulkTransaction {
    const order = routeOrderWithBuilderCode({
      network: this.config.network,
      order: params.order,
      ...(this.config.builderCode ? { policy: this.config.builderCode } : {}),
      ...(params.approvals ? { approvals: params.approvals } : {}),
    });
    return this.config.keychain.prepareOrder(order, params.options);
  }

  prepareBuilderCodeApproval(options: PrepareOptions): PreparedBulkTransaction {
    const policy = this.requireBuilderCodePolicy();
    const action = createApproveBuilderCodeAction(policy);
    return this.config.keychain.prepareApproveBuilderCode(
      action.abc.to,
      action.abc.fee,
      options,
    );
  }

  prepareBuilderCodeRevocation(
    options: PrepareOptions,
  ): PreparedBulkTransaction {
    const policy = this.requireBuilderCodePolicy();
    const action = createRevokeBuilderCodeAction(policy.to);
    return this.config.keychain.prepareRevokeBuilderCode(
      action.rbc.to,
      options,
    );
  }

  async finalizeAndSubmit<TResponse>(params: {
    readonly prepared: PreparedBulkTransaction;
    readonly signature: string;
  }): Promise<TResponse> {
    const signed = this.config.keychain.finalize(
      params.prepared,
      params.signature,
    );
    const transaction = normalizeSignedTransaction(signed);
    return this.config.client.postUnsigned<SignedBulkTransaction, TResponse>(
      "/order",
      transaction,
    );
  }

  private requireBuilderCodePolicy(): BuilderCodePolicy {
    if (!this.config.builderCode) {
      throw new Error("Builder Code policy is not configured");
    }
    if (this.config.network !== "staging") {
      throw new Error("Builder Codes are currently available on staging only");
    }
    return this.config.builderCode;
  }
}

export function normalizeSignedTransaction(
  signed: Omit<SignedBulkTransaction, "actions"> & {
    readonly actions: string | readonly unknown[];
  },
): SignedBulkTransaction {
  const actions =
    typeof signed.actions === "string"
      ? parseActions(signed.actions)
      : signed.actions;
  if (actions.length === 0) {
    throw new Error("Bulk transaction must contain at least one action");
  }
  if (!signed.signature) {
    throw new Error("Bulk transaction signature is required");
  }
  return { ...signed, actions };
}

function parseActions(value: string): readonly unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new Error("Bulk keychain returned invalid actions JSON", { cause });
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Bulk keychain actions must be a JSON array");
  }
  return parsed;
}
