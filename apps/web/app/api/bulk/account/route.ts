import { NextResponse } from "next/server";

import {
  requireLinkedSolanaWallet,
  requirePrivyAuth,
} from "@/lib/server/privy-auth";

/**
 * POST /api/bulk/account
 *
 * Server-side proxy for Bulk's `POST /account` endpoint. The browser
 * asks for a user's account snapshot by pubkey; we forward to
 * `BULK_HTTP_URL + '/account'`.
 *
 * Why proxy?
 *   - `BULK_HTTP_URL` is a server-only env var (no `NEXT_PUBLIC_`).
 *   - Consistency with `/api/bulk/place-order` — one transport path.
 *   - Lets us add server-side caching later without client changes.
 *
 * The /account endpoint is read-only and requires no signature — it
 * just needs a valid pubkey. We use the `fullAccount` query type per
 * `docs/bulk-integration-notes.md §4`.
 */

export const runtime = "nodejs";

const BULK_HTTP_URL =
  process.env["BULK_HTTP_URL"] ?? "https://exchange-api.bulk.trade/api/v1";
const ACCOUNT_PATH = "/account";

interface AccountRequest {
  readonly user: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requirePrivyAuth(req);
  if (!auth.ok) return auth.response;
  let payload: AccountRequest;
  try {
    payload = (await req.json()) as AccountRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof payload.user !== "string" || payload.user.length === 0) {
    return NextResponse.json(
      { error: "Missing required field: user" },
      { status: 400 },
    );
  }
  const ownershipError = requireLinkedSolanaWallet(
    auth.principal,
    payload.user,
  );
  if (ownershipError) return ownershipError;

  const url = `${BULK_HTTP_URL.replace(/\/+$/, "")}${ACCOUNT_PATH}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "fullAccount", user: payload.user }),
      cache: "no-store",
    });
  } catch (err) {
    return NextResponse.json(
      unavailableAccount(
        payload.user,
        err instanceof Error ? err.message : String(err),
      ),
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: unknown = null;
  const contentType = upstream.headers.get("content-type") ?? "";
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

  if (!upstream.ok) {
    return NextResponse.json(
      unavailableAccount(
        payload.user,
        extractUpstreamDetail(body) ?? `Bulk HTTP ${upstream.status}`,
      ),
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(body ?? {}, { status: upstream.status });
}

function unavailableAccount(
  user: string,
  detail: string,
): Record<string, unknown> {
  return {
    unavailable: true,
    error: "bulk_unavailable",
    message:
      "Bulk exchange is temporarily unavailable. Please try again in a few minutes.",
    detail,
    user,
    fullAccount: {
      kind: "MasterEOA",
      parent: null,
      subAccounts: [],
      margin: {
        totalBalance: null,
        availableBalance: null,
        unrealizedPnl: null,
      },
      positions: [],
      openOrders: [],
    },
  };
}

function extractUpstreamDetail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const r = body as Record<string, unknown>;
  if (typeof r["message"] === "string") return r["message"];
  if (typeof r["error"] === "string") return r["error"];
  if (typeof r["detail"] === "string") return r["detail"];
  if (typeof r["raw"] === "string") return r["raw"].slice(0, 240);
  return null;
}
