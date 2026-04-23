// packages/api-client/src/errors.ts
/**
 * Error hierarchy for the Bulk API client.
 *
 * All errors thrown by the client extend `BulkClientError`, which lets
 * callers do `if (err instanceof BulkClientError)` to distinguish
 * library errors from unrelated failures.
 */

export class BulkClientError extends Error {
  public override readonly name: string = 'BulkClientError';
  public readonly endpoint: string;

  constructor(message: string, endpoint: string, options?: ErrorOptions) {
    super(message, options);
    this.endpoint = endpoint;
  }
}

export class BulkHttpError extends BulkClientError {
  public override readonly name = 'BulkHttpError';
  public readonly status: number;
  public readonly body: unknown;

  constructor(
    message: string,
    endpoint: string,
    status: number,
    body: unknown,
  ) {
    super(message, endpoint);
    this.status = status;
    this.body = body;
  }
}

export class BulkNetworkError extends BulkClientError {
  public override readonly name = 'BulkNetworkError';
}

export class BulkValidationError extends BulkClientError {
  public override readonly name = 'BulkValidationError';
}

export class BulkSigningRequiredError extends BulkClientError {
  public override readonly name = 'BulkSigningRequiredError';

  constructor(endpoint: string) {
    super(
      `Signed operation '${endpoint}' requires a Signer. Pass one in BulkClient config or call .withSigner().`,
      endpoint,
    );
  }
}
