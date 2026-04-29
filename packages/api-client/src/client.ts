// packages/api-client/src/client.ts
import {
  BulkHttpError,
  BulkNetworkError,
  BulkSigningRequiredError,
} from './errors.js';
import type { NonceNs, Pubkey, SignedRequest } from './types.js';

/**
 * Minimal signer interface. Implemented by `bulk-keychain` in practice;
 * consumers can also supply an in-memory test signer.
 */
export interface Signer {
  readonly pubkey: Pubkey;
  /** Returns a base58 Ed25519 signature over the given payload. */
  sign(payload: Uint8Array): Promise<string>;
}

export interface BulkClientConfig {
  /** Base URL — defaults to the documented mainnet endpoint. */
  readonly baseUrl?: string;
  /** Optional signer for signed endpoints. */
  readonly signer?: Signer;
  /** Request timeout in ms. */
  readonly timeoutMs?: number;
  /** Custom fetch (for tests or non-browser runtimes). */
  readonly fetch?: typeof fetch;
  /** Optional integrator ID, forwarded as a header. */
  readonly integratorId?: string;
}

const DEFAULT_BASE_URL = 'https://exchange-api.bulk.trade/api/v1';
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Low-level HTTP transport. Feature-specific endpoint helpers build on
 * top of this — see `endpoints.ts`.
 */
export class BulkClient {
  private readonly baseUrl: string;
  private readonly signer: Signer | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly integratorId: string | undefined;

  constructor(config: BulkClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.signer = config.signer;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.integratorId = config.integratorId;
  }

  /** Returns a new client with the given signer attached. */
  withSigner(signer: Signer): BulkClient {
    return new BulkClient({
      baseUrl: this.baseUrl,
      signer,
      timeoutMs: this.timeoutMs,
      fetch: this.fetchImpl,
      ...(this.integratorId !== undefined && {
        integratorId: this.integratorId,
      }),
    });
  }

  /** True if a signer is configured. */
  hasSigner(): boolean {
    return this.signer !== undefined;
  }

  /** Generate a nanosecond nonce for signed requests. */
  static generateNonce(): NonceNs {
    return BigInt(Date.now()) * 1_000_000n;
  }

  /** Unsigned GET. */
  async get<TResponse>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): Promise<TResponse> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return this.request<TResponse>(path, {
      method: 'GET',
      url: url.toString(),
    });
  }

  /** Unsigned POST. */
  async postUnsigned<TBody, TResponse>(
    path: string,
    body: TBody,
  ): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: 'POST',
      url: `${this.baseUrl}${path}`,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Signed POST. Constructs the SignedRequest envelope using the
   * configured signer and submits it. Throws `BulkSigningRequiredError`
   * if no signer is available.
   */
  async postSigned<TAction, TResponse>(
    path: string,
    action: TAction,
  ): Promise<TResponse> {
    if (!this.signer) {
      throw new BulkSigningRequiredError(path);
    }

    const nonce = BulkClient.generateNonce();
    const payload = this.canonicalizeForSigning({ action, nonce: nonce.toString() });
    const signature = await this.signer.sign(payload);

    const envelope: SignedRequest<TAction> = {
      action,
      nonce: nonce.toString(),
      signature,
      signer: this.signer.pubkey,
    };

    return this.request<TResponse>(path, {
      method: 'POST',
      url: `${this.baseUrl}${path}`,
      body: JSON.stringify(envelope),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Produce the canonical byte representation for signing. Exact
   * spec per bulk-keychain's implementation — for V1 we JSON-stringify
   * with sorted keys. This will be replaced with the library's
   * canonicaliser once the dep is pinned.
   */
  private canonicalizeForSigning(input: unknown): Uint8Array {
    const json = JSON.stringify(input, Object.keys(input as object).sort());
    return new TextEncoder().encode(json);
  }

  private async request<TResponse>(
    endpoint: string,
    init: { method: string; url: string; body?: string; headers?: Record<string, string> },
  ): Promise<TResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    const headers: Record<string, string> = {
      ...(init.headers ?? {}),
    };
    if (this.integratorId) {
      headers['X-Bulk-Integrator'] = this.integratorId;
    }

    try {
      const fetchInit: RequestInit = {
        method: init.method,
        headers,
        signal: controller.signal,
      };
      if (init.body !== undefined) {
        fetchInit.body = init.body;
      }
      const res = await this.fetchImpl(init.url, fetchInit);

      const bodyText = await res.text();
      const parsed: unknown = bodyText ? safeJsonParse(bodyText) : null;

      if (!res.ok) {
        throw new BulkHttpError(
          `Bulk API ${res.status} on ${init.method} ${endpoint}`,
          endpoint,
          res.status,
          parsed,
        );
      }

      return parsed as TResponse;
    } catch (err) {
      if (err instanceof BulkHttpError) {
        throw err;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new BulkNetworkError(
          `Bulk API request to ${endpoint} timed out after ${this.timeoutMs}ms`,
          endpoint,
          { cause: err },
        );
      }
      throw new BulkNetworkError(
        `Bulk API network error on ${endpoint}: ${(err as Error).message}`,
        endpoint,
        { cause: err as Error },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
