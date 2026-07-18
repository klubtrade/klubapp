export const ORDER_STATUSES = [
  "CREATED",
  "VALIDATED",
  "POLICY_APPROVED",
  "SUBMISSION_PENDING",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "PARTIALLY_FILLED",
  "FILLED",
  "REJECTED",
  "EXPIRED",
  "CANCEL_PENDING",
  "CANCELLED",
  "RECONCILIATION_REQUIRED",
  "MANUAL_REVIEW",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const ALLOWED: Readonly<Record<OrderStatus, ReadonlySet<OrderStatus>>> = {
  CREATED: set("VALIDATED", "REJECTED", "EXPIRED"),
  VALIDATED: set("POLICY_APPROVED", "REJECTED", "EXPIRED"),
  POLICY_APPROVED: set("SUBMISSION_PENDING", "REJECTED", "EXPIRED"),
  SUBMISSION_PENDING: set("SUBMITTED", "REJECTED", "RECONCILIATION_REQUIRED"),
  SUBMITTED: set(
    "ACKNOWLEDGED",
    "PARTIALLY_FILLED",
    "FILLED",
    "REJECTED",
    "CANCEL_PENDING",
    "RECONCILIATION_REQUIRED",
  ),
  ACKNOWLEDGED: set(
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCEL_PENDING",
    "RECONCILIATION_REQUIRED",
  ),
  PARTIALLY_FILLED: set(
    "FILLED",
    "CANCEL_PENDING",
    "CANCELLED",
    "RECONCILIATION_REQUIRED",
  ),
  FILLED: set(),
  REJECTED: set(),
  EXPIRED: set(),
  CANCEL_PENDING: set(
    "CANCELLED",
    "PARTIALLY_FILLED",
    "FILLED",
    "RECONCILIATION_REQUIRED",
  ),
  CANCELLED: set(),
  RECONCILIATION_REQUIRED: set(
    "SUBMITTED",
    "ACKNOWLEDGED",
    "PARTIALLY_FILLED",
    "FILLED",
    "REJECTED",
    "CANCELLED",
    "MANUAL_REVIEW",
  ),
  MANUAL_REVIEW: set(
    "RECONCILIATION_REQUIRED",
    "CANCELLED",
    "FILLED",
    "REJECTED",
  ),
};

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return ALLOWED[from].has(to);
}

export function assertOrderTransition(
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (!canTransitionOrder(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return ALLOWED[status].size === 0;
}

export class InvalidOrderTransitionError extends Error {
  readonly code = "INVALID_ORDER_TRANSITION";

  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`order cannot transition from ${from} to ${to}`);
    this.name = "InvalidOrderTransitionError";
  }
}

function set(...values: readonly OrderStatus[]): ReadonlySet<OrderStatus> {
  return new Set(values);
}
