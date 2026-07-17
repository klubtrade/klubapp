import type { FullAccount, Pubkey } from "./types.js";

export const MIN_BUILDER_FEE_BPS = 1;
export const MAX_BUILDER_FEE_BPS = 15;

export type BulkNetwork = "mainnet" | "staging";

export interface BuilderCode {
  readonly to: Pubkey;
  readonly fee: number;
}

export interface BuilderCodeApproval {
  readonly recipient: Pubkey;
  readonly maxFee: number;
}

export interface BuilderCodePolicy extends BuilderCode {
  /** Builder Codes are staging-only until Bulk promotes them to mainnet. */
  readonly network: "staging";
}

export interface ApproveBuilderCodeAction {
  readonly abc: BuilderCode;
}

export interface RevokeBuilderCodeAction {
  readonly rbc: {
    readonly to: Pubkey;
  };
}

interface BaseOrderInput {
  readonly type: "order";
  readonly symbol: string;
  readonly isBuy: boolean;
  readonly size: number;
  readonly reduceOnly?: boolean;
  readonly iso?: boolean;
}

export interface MarketOrderInput extends BaseOrderInput {
  /** The official keychain requires the long-form placeholder for markets. */
  readonly price: 0;
  readonly orderType: {
    readonly type: "market";
    readonly isMarket?: true;
    readonly triggerPx?: 0;
  };
}

export interface LimitOrderInput extends BaseOrderInput {
  readonly price: number;
  readonly orderType: {
    readonly type: "limit";
    readonly tif: "GTC" | "IOC" | "ALO";
  };
}

export type RoutableOrderInput = MarketOrderInput | LimitOrderInput;
export type RoutedOrderInput = RoutableOrderInput & {
  readonly builderCode?: BuilderCode;
};

export class BuilderCodeError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_fee"
      | "invalid_recipient"
      | "network_not_supported"
      | "approval_missing"
      | "fee_exceeds_approval",
  ) {
    super(message);
    this.name = "BuilderCodeError";
  }
}

export function assertBuilderCode(code: BuilderCode): BuilderCode {
  if (!isLikelyBase58Pubkey(code.to)) {
    throw new BuilderCodeError(
      "Builder Code recipient must be a base58-encoded 32-byte public key",
      "invalid_recipient",
    );
  }
  if (
    !Number.isInteger(code.fee) ||
    code.fee < MIN_BUILDER_FEE_BPS ||
    code.fee > MAX_BUILDER_FEE_BPS
  ) {
    throw new BuilderCodeError(
      `Builder Code fee must be an integer from ${MIN_BUILDER_FEE_BPS} to ${MAX_BUILDER_FEE_BPS} bps`,
      "invalid_fee",
    );
  }
  return code;
}

export function createApproveBuilderCodeAction(
  code: BuilderCode,
): ApproveBuilderCodeAction {
  assertBuilderCode(code);
  return { abc: { to: code.to, fee: code.fee } };
}

export function createRevokeBuilderCodeAction(
  recipient: Pubkey,
): RevokeBuilderCodeAction {
  if (!isLikelyBase58Pubkey(recipient)) {
    throw new BuilderCodeError(
      "Builder Code recipient must be a base58-encoded 32-byte public key",
      "invalid_recipient",
    );
  }
  return { rbc: { to: recipient } };
}

export function findBuilderCodeApproval(
  account: Pick<FullAccount, "builderCodeApprovals">,
  recipient: Pubkey,
): BuilderCodeApproval | undefined {
  return account.builderCodeApprovals?.find(
    (approval) => approval.recipient === recipient,
  );
}

/**
 * Attach a Builder Code only after the master account has approved it.
 * Orders without a configured policy omit the field entirely; `null` is
 * deliberately never produced because Bulk rejects it.
 */
export function routeOrderWithBuilderCode(params: {
  readonly network: BulkNetwork;
  readonly order: RoutableOrderInput;
  readonly policy?: BuilderCodePolicy;
  readonly approvals?: readonly BuilderCodeApproval[];
}): RoutedOrderInput {
  const { policy } = params;
  if (!policy) return { ...params.order };

  if (params.network !== "staging") {
    throw new BuilderCodeError(
      "Builder Codes are currently available on Bulk staging only",
      "network_not_supported",
    );
  }

  assertBuilderCode(policy);
  const approval = params.approvals?.find(
    (candidate) => candidate.recipient === policy.to,
  );
  if (!approval) {
    throw new BuilderCodeError(
      "The account has not approved this Builder Code recipient",
      "approval_missing",
    );
  }
  if (policy.fee > approval.maxFee) {
    throw new BuilderCodeError(
      `Builder Code fee ${policy.fee} bps exceeds the approved maximum of ${approval.maxFee} bps`,
      "fee_exceeds_approval",
    );
  }

  return {
    ...params.order,
    builderCode: { to: policy.to, fee: policy.fee },
  };
}

function isLikelyBase58Pubkey(value: string): boolean {
  return (
    value.length >= 32 &&
    value.length <= 44 &&
    /^[1-9A-HJ-NP-Za-km-z]+$/.test(value)
  );
}
