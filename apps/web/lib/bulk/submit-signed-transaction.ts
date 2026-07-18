import { parseSignedTransaction } from "@klub/api-client";

import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { normalizeBulkErrorMessage } from "@/lib/bulk/error-messages";

import type { SignedTransaction, SubmitOrderResult } from "./types";

// -------------------------------------------------------------------------
// Signed envelope POSTer
// -------------------------------------------------------------------------

/**
 * POST a finalized SignedTransaction to our server-side proxy.
 *
 * Separated from `submitOrder` so that retry logic (Day 4+) can reuse
 * it after re-signing with a fresh nonce.
 */
/**
 * Input shape for the signed-transaction POST.
 *
 * `wireActions` is the caller-supplied compact-format actions array.
 * We don't try to parse anything out of the keychain's returned
 * SignedTransaction — we rebuild the wire payload from the original
 * order since the keychain's `signed.actions` is an opaque WASM value
 * that serializes as `{}` (empty object) when JSON-stringified.
 */
interface SignedEnvelope {
  readonly actions: SignedTransaction["actions"];
  readonly nonce: string | number | bigint;
  readonly account: string;
  readonly signer: string;
  readonly signature: string;
}

export async function submitSignedTransaction(
  env: SignedEnvelope,
): Promise<SubmitOrderResult> {
  // Normalize nonce for JSON transport. If the library returns a
  // BigInt (possible in some wasm builds), we must convert to string
  // because JSON.stringify throws on BigInt. For regular numbers we
  // pass through unchanged — Bulk's docs show the envelope nonce as
  // a JSON number.
  const nonceForJson: string | number =
    typeof env.nonce === "bigint" ? env.nonce.toString() : env.nonce;

  const body = parseSignedTransaction({
    actions: env.actions,
    nonce: nonceForJson,
    account: env.account,
    signer: env.signer,
    signature: env.signature,
  });

  // Diagnostic: log the wire shape on every submit when debug flag is on.
  // Set `localStorage.klubDebugSubmit = '1'` in the browser console to
  // enable. Off by default so prod doesn't get noisy console output.
  if (
    typeof window !== "undefined" &&
    window.localStorage?.getItem("klubDebugSubmit") === "1"
  ) {
    // eslint-disable-next-line no-console
    console.group("[submit] outgoing");
    // eslint-disable-next-line no-console
    console.log("body:", JSON.stringify(body, null, 2));
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  let response: Response;
  try {
    response = await authenticatedFetch("/api/bulk/place-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      message: err instanceof Error ? err.message : "Network request failed",
    };
  }

  const status = response.status;
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    raw = null;
  }

  // Failure can arrive as non-2xx OR as a 2xx with a rejection
  // payload (Bulk routinely returns 200 with { status: 'err',
  // response: 'Bad signature' } when the envelope-level signature
  // doesn't verify — Solflare on mobile produces this against an
  // identical wire shape that desktop Solflare signs cleanly).
  // Treat both shapes as failure so the user sees the real reason
  // instead of a misleading "Submitted ✓" toast.
  const payloadRejection = response.ok ? detectPayloadRejection(raw) : null;

  if (!response.ok || payloadRejection) {
    try {
      // eslint-disable-next-line no-console
      console.group(
        `[submitOrder] ${response.ok ? `${status} payload-rejection` : `${status} rejection`}`,
      );
      // eslint-disable-next-line no-console
      console.log("Request body:", JSON.stringify(body, null, 2));
      // eslint-disable-next-line no-console
      console.log("Response body (live):", raw);
      // eslint-disable-next-line no-console
      console.log(
        "Response body (JSON):",
        (() => {
          try {
            return JSON.stringify(raw, null, 2);
          } catch {
            return "(not JSON-serializable)";
          }
        })(),
      );
      // eslint-disable-next-line no-console
      console.groupEnd();
    } catch {
      // swallow logging failures
    }
    return classifyError(status, raw);
  }

  // Happy path — try to read an order id from a few plausible shapes
  // without over-asserting on Bulk's exact response schema (which has
  // changed between releases and isn't 100% documented). If none of
  // the probes hit, we still report success with a null orderId — the
  // trade is accepted either way.
  const orderId = extractOrderId(raw);

  return {
    ok: true,
    orderId,
    raw,
    status,
  };
}

/**
 * Inspect a 2xx response body for explicit rejection markers. Returns
 * the rejection message if found, or null if the body looks clean.
 *
 * Bulk inherits Hyperliquid's envelope: `{ status: 'ok' | 'err',
 * response: ... }`. A signature verification failure surfaces as
 * `{ status: 'err', response: 'Bad signature' }` with HTTP 200. Per-
 * action errors in batch submits surface as
 * `{ status: 'ok', response: { data: { statuses: [{ error: '...' }] }}}`.
 *
 * Conservative: only treats explicit failure markers as rejection. An
 * unfamiliar shape with no failure flag is assumed successful so we
 * don't false-positive transfer/sub-account responses that lack an
 * orderId in their happy payload.
 */
function detectPayloadRejection(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  // Bulk uses both 'err' (Hyperliquid-style) and 'error' (full word)
  // depending on the action / version. Catch both.
  if (r["status"] === "err" || r["status"] === "error") {
    return extractErrorMessage(raw) ?? "Bulk rejected the transaction";
  }
  if (r["success"] === false || r["ok"] === false) {
    return extractErrorMessage(raw) ?? "Bulk rejected the transaction";
  }

  // Per-action error inside a batch envelope (the 'status: error'
  // response Bulk returns for unauthorized signer puts the real
  // reason here under data.statuses[i].error). The error field
  // arrives in two shapes — bare string or nested {message: string} —
  // depending on the failure type. Probe both.
  const response = r["response"];
  if (response && typeof response === "object") {
    const resp = response as Record<string, unknown>;
    const data = resp["data"];
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      const statuses = d["statuses"];
      if (Array.isArray(statuses)) {
        for (const s of statuses) {
          if (s && typeof s === "object") {
            const sErr = (s as Record<string, unknown>)["error"];
            if (typeof sErr === "string" && sErr.length > 0) return sErr;
            if (sErr && typeof sErr === "object") {
              const nested = (sErr as Record<string, unknown>)["message"];
              if (typeof nested === "string" && nested.length > 0)
                return nested;
            }
          }
        }
      }
    }
  }

  return null;
}

function extractOrderId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const candidate = r["orderId"] ?? r["order_id"] ?? r["oid"] ?? r["id"];
  if (typeof candidate === "string" && candidate.length > 0) return candidate;
  if (typeof candidate === "number") return String(candidate);
  return null;
}

/**
 * Map Bulk's rejection reasons to our UI-friendly tagged union.
 *
 * Bulk's response shapes for rejections vary: sometimes a flat
 * `{ error: string }`, sometimes nested `{ result: { rejected: "..." }}`.
 * We probe both.
 */
function classifyError(status: number, raw: unknown): SubmitOrderResult {
  const msg = extractErrorMessage(raw) ?? `HTTP ${status}`;
  const lower = msg.toLowerCase();

  if (lower.includes("risk") || lower.includes("margin")) {
    return {
      ok: false,
      reason: "rejected_risk_limit",
      message: msg,
      raw,
      status,
    };
  }
  if (
    lower.includes("cross") ||
    lower.includes("spread") ||
    lower.includes("self-trade")
  ) {
    return {
      ok: false,
      reason: "rejected_crossing",
      message: msg,
      raw,
      status,
    };
  }
  return {
    ok: false,
    reason: "rejected_invalid",
    message: msg,
    raw,
    status,
  };
}

function extractErrorMessage(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return normalizeHumanError(raw);
  if (typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // Common key names for error strings used by Bulk, our own proxy,
  // and upstream HTTP wrappers.
  for (const key of [
    "error",
    "message",
    "detail",
    "reason",
    "raw",
    "description",
  ]) {
    const v = r[key];
    if (typeof v === "string" && v.length > 0) return normalizeHumanError(v);
  }
  // Nested result envelope — some Bulk endpoints wrap rejects in a
  // `result` object.
  const result = r["result"];
  if (result && typeof result === "object") {
    const rr = result as Record<string, unknown>;
    for (const key of ["rejected", "error", "message", "reason"]) {
      const v = rr[key];
      if (typeof v === "string" && v.length > 0) return normalizeHumanError(v);
    }
  }
  // Last-ditch: if raw is a small object, serialize it so the user
  // sees the actual shape in the modal rather than "HTTP 400".
  try {
    const s = JSON.stringify(r);
    if (s.length <= 400) return s;
  } catch {
    // swallow
  }
  return null;
}

function normalizeHumanError(message: string): string {
  return normalizeBulkErrorMessage(message);
}
