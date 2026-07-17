import { parseSignedTransaction } from "@klub/api-client";
import { NextResponse } from "next/server";

/**
 * POST /api/bulk/place-order
 *
 * Server-side proxy for Bulk's unified `/order` endpoint. The browser
 * signs the order locally (Mode A prepare/finalize in
 * `bulk-keychain-wasm`) and POSTs the resulting SignedTransaction to
 * this route. We forward it verbatim to `BULK_HTTP_URL`.
 *
 * Why proxy?
 *   - `BULK_HTTP_URL` is configured server-only (no `NEXT_PUBLIC_`
 *     prefix) — the architect's intent is to keep the REST URL off
 *     the client bundle.
 *   - It insulates us from any CORS surprises.
 *   - It gives us a single place to add request logging, retry, or
 *     response normalization later.
 *
 * Security:
 *   - The user's private key never touches this server. Signature is
 *     produced client-side by their wallet; this handler just forwards
 *     bytes.
 *   - We do NOT inspect, store, or log the signature payload by
 *     default. (Add structured logging in a later milestone.)
 *
 * Ref: docs/bulk-integration-notes.md §4 — Trading endpoints.
 */

export const runtime = "nodejs";

const BULK_HTTP_URL =
  process.env["BULK_HTTP_URL"] ?? "https://exchange-api.bulk.trade/api/v1";

// The Bulk endpoint path for placing an order. Verified against
// https://docs.bulk.trade/api-reference/signing — "All transactions
// submitted to POST /order require Ed25519 signatures." The path is
// kept in a constant so it's easy to change if Bulk renames the
// endpoint again.
const PLACE_ORDER_PATH = "/order";

export async function POST(req: Request): Promise<NextResponse> {
  let input: unknown;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let payload: ReturnType<typeof parseSignedTransaction>;
  try {
    payload = parseSignedTransaction(input);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid signed Bulk transaction",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }

  const url = `${BULK_HTTP_URL}${PLACE_ORDER_PATH}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // No caching on writes.
      cache: "no-store",
    });
  } catch (err) {
    // Network-level failure (DNS, connection reset, timeout).
    return NextResponse.json(
      {
        error: "Failed to reach Bulk exchange",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // Mirror Bulk's status code and body verbatim. If Bulk returns
  // malformed/empty JSON we surface an empty object with the original
  // status rather than inventing content.
  const contentType = upstream.headers.get("content-type") ?? "";
  let body: unknown = null;
  if (contentType.includes("application/json")) {
    try {
      body = await upstream.json();
    } catch {
      body = null;
    }
  } else {
    try {
      body = { raw: await upstream.text() };
    } catch {
      body = null;
    }
  }

  return NextResponse.json(body ?? {}, { status: upstream.status });
}
