// packages/api-client/src/client.ts
import { BulkHttpError, BulkNetworkError } from "./errors.js";

export interface BulkClientConfig {
  /** Base URL — defaults to the documented mainnet endpoint. */
  readonly baseUrl?: string;
  /** Request timeout in ms. */
  readonly timeoutMs?: number;
  /** Custom fetch (for tests or non-browser runtimes). */
  readonly fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://exchange-api.bulk.trade/api/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Low-level HTTP transport. Feature-specific endpoint helpers build on
 * top of this — see `endpoints.ts`.
 */
export class BulkClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: BulkClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
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
      method: "GET",
      url: url.toString(),
    });
  }

  /** Unsigned POST. */
  async postUnsigned<TBody, TResponse>(
    path: string,
    body: TBody,
  ): Promise<TResponse> {
    return this.request<TResponse>(path, {
      method: "POST",
      url: `${this.baseUrl}${path}`,
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  private async request<TResponse>(
    endpoint: string,
    init: {
      method: string;
      url: string;
      body?: string;
      headers?: Record<string, string>;
    },
  ): Promise<TResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const fetchInit: RequestInit = {
        method: init.method,
        ...(init.headers ? { headers: init.headers } : {}),
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
      if (err instanceof DOMException && err.name === "AbortError") {
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
