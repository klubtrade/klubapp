export type ExecutionErrorCode =
  | "AUTHENTICATION_ERROR"
  | "AUTHORIZATION_ERROR"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT_ERROR"
  | "VENUE_UNAVAILABLE_ERROR"
  | "TRANSPORT_TIMEOUT_ERROR"
  | "EXECUTION_UNCERTAIN_ERROR"
  | "SCHEMA_MISMATCH_ERROR";

export class ExecutionError extends Error {
  constructor(
    readonly code: ExecutionErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly reconciliationRequired: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ExecutionError";
  }
}
