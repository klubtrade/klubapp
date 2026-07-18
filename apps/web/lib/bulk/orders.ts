import bs58 from "bs58";

import {
  MOBILE_SOLFLARE_HINT,
  loadKeychain,
  logSignatureDebug,
  signWithTimeout,
  verifyLocalSignature,
} from "./signing";
import { submitSignedTransaction } from "./submit-signed-transaction";
import type {
  BulkWalletSigner,
  SignedTransaction,
  SubmitOrderResult,
} from "./types";

export type {
  BulkWalletSigner,
  SignedTransaction,
  SubmitOrderResult,
} from "./types";
export {
  submitAgentWalletAuth,
  submitCreateSubAccount,
  submitFaucetClaim,
  submitTransfer,
} from "./account-actions";
export type {
  SubmitAgentWalletAuthInput,
  SubmitCreateSubAccountInput,
  SubmitFaucetClaimInput,
  SubmitTransferInput,
} from "./account-actions";

// -------------------------------------------------------------------------
// Types — mirror the bulk-keychain-wasm README "External Wallet" section
// -------------------------------------------------------------------------

export type TimeInForce = "GTC" | "IOC" | "ALO";

export interface LimitOrder {
  readonly type: "order";
  readonly symbol: string;
  readonly isBuy: boolean;
  readonly price: number;
  readonly size: number;
  readonly orderType: { readonly type: "limit"; readonly tif: TimeInForce };
  readonly reduceOnly?: boolean;
}

export interface TriggerOrder {
  readonly type: "stop" | "takeProfit";
  readonly symbol: string;
  /** Trigger direction: true = at/above, false = at/below. */
  readonly isBuy: boolean;
  readonly size: number;
  readonly triggerPrice: number;
  /** Omitted for a market-on-trigger conditional order. */
  readonly limitPrice?: number;
  readonly iso: boolean;
}

export interface MarketOrder {
  readonly type: "order";
  readonly symbol: string;
  readonly isBuy: boolean;
  readonly price: 0; // Bulk requires 0 for market orders
  readonly size: number;
  readonly orderType: {
    readonly type: "market";
    readonly isMarket: true;
    readonly triggerPx: 0;
  };
  readonly reduceOnly?: boolean;
}

export interface CancelOrderAction {
  readonly type: "cancel";
  readonly symbol: string;
  readonly orderId: string;
}

/**
 * Register or revoke an agent wallet on Bulk. Signed by the main
 * account's wallet; authorizes (or removes) an ephemeral keypair
 * that can trade on the main account's behalf without further
 * per-trade wallet popups.
 *
 * Wire format (per docs.bulk.trade/api-reference/manageAgentWallet):
 *   { agentWalletCreation: { a: agentPubkey, d: isDelete } }
 *
 * Discriminant 17 in the canonical bincode layout. Same POST /order
 * endpoint as all other signed actions.
 */
export interface AgentWalletCreationAction {
  readonly type: "agentWalletCreation";
  /** Agent public key (base58) to authorize or remove. */
  readonly agentPublicKey: string;
  /** false = register, true = remove. */
  readonly isDelete: boolean;
}

/**
 * Request the testnet faucet drip (~1,000 mockUSDC per call on Bulk's
 * testnet, gated by a server-side 72h reset window per user).
 *
 * Wire format (verified against live rejection on Apr 21 2026 — the
 * server's serde error "missing field `u` at line 1 column 24"
 * confirmed the outer `faucet` key but told us the object needs `u`):
 *
 *   { faucet: { u: user_pubkey_base58 } }
 *
 * `u` = user/recipient pubkey (base58 string). Matches Bulk's
 * single-letter naming convention for pubkey fields — the
 * agentWalletCreation action uses `a` for the agent pubkey.
 *
 * (If a future release changes `u` to expect a number rather than a
 * string, the serde error would read "invalid type: string, expected
 * u64" or similar, not "missing field".)
 */
export interface FaucetClaimAction {
  readonly type: "faucet";
  /** Recipient's account pubkey (base58). Funds land here. */
  readonly user: string;
}

/**
 * Create a sub-account on the user's master account. Bulk v1.0.14
 * action — `prepareCreateSubAccount` in `bulk-keychain-wasm` v0.1.15+.
 *
 * Wire format (compact JSON the server reconstructs canonical bytes
 * from): `{createSubAccount: {n: name}}` for the no-margin case. With
 * optional initial margin seed: `{createSubAccount: {n, ms, ma}}`
 * where `ms` is the margin symbol and `ma` is the amount (raw f64).
 */
export interface CreateSubAccountAction {
  readonly type: "createSubAccount";
  readonly name: string;
  readonly marginSymbol?: string;
  readonly marginAmount?: number;
}

/**
 * Transfer margin between accounts. Bulk v1.0.14 action — internal
 * (master ↔ sub-account) or external (any network address).
 *
 * Wire format: `{transfer: {k: kind, f: from, t: to, ms: marginSymbol, ma: amount}}`.
 * `kind` is 0 = internal, 1 = external.
 */
export interface TransferAction {
  readonly type: "transfer";
  readonly kind: "internal" | "external";
  readonly from: string;
  readonly to: string;
  readonly marginSymbol: string;
  readonly amount: number;
}

/**
 * Anything our signing path accepts.
 */
export type Order = LimitOrder | MarketOrder | TriggerOrder;
export type OrderOrCancel = Order | CancelOrderAction;
export type SignableAction =
  | Order
  | CancelOrderAction
  | AgentWalletCreationAction
  | FaucetClaimAction
  | CreateSubAccountAction
  | TransferAction;

/**
 * Shape of a `SignedTransaction` returned by `prepared.finalize(...)`.
 * Mirrors the shape used in the bulk-keychain README example POST body:
 *   { actions, nonce, account, signer, signature }
 *
 * `actions` is either a JSON-encoded string (Node `bulk-keychain`) or
 * already a parsed array (browser `bulk-keychain-wasm`). We accept
 * both and dispatch on the runtime type.
 *
 * `nonce` can be a string, number, OR BigInt depending on the library
 * build; we normalize it to a string for JSON transport since BigInts
 * aren't natively JSON-serializable.
 */
// -------------------------------------------------------------------------
// Input to submitOrder — normalized from the UI
// -------------------------------------------------------------------------

export interface SubmitOrderInput {
  readonly symbol: string;
  readonly side: "long" | "short";
  readonly orderType: "limit" | "market" | "trigger";
  readonly size: number;
  readonly price?: number; // required for limit; ignored for market/trigger
  /** Required when orderType === 'trigger'. Bulk fires market when crossed. */
  readonly triggerPrice?: number;
  /** 'tp' = take-profit fires when price reaches triggerPrice from below
   *  (long) or above (short); 'sl' = stop-loss inverse. Required for trigger. */
  readonly tpSl?: "tp" | "sl";
  readonly timeInForce?: TimeInForce; // default GTC
  readonly reduceOnly?: boolean;
  readonly signer: BulkWalletSigner;
  /**
   * Optional override for the transaction's `account` field. By
   * default we use `signer.publicKeyBase58` (self-trading). When
   * signing with an agent wallet, the agent is the SIGNER but the
   * main user pubkey remains the ACCOUNT — pass it here.
   */
  readonly account?: string;
}

/**
 * Input for `submitCancel`. Both fields are mandatory — Bulk needs
 * the symbol AND the orderId to locate the resting order in its book.
 * We don't let the caller omit either.
 */
export interface SubmitCancelInput {
  readonly symbol: string;
  readonly orderId: string;
  readonly signer: BulkWalletSigner;
  /** Same as SubmitOrderInput.account — override for agent signing. */
  readonly account?: string;
}

// -------------------------------------------------------------------------
// Order builders
// -------------------------------------------------------------------------

function buildLimitOrder(i: SubmitOrderInput): LimitOrder {
  if (
    typeof i.price !== "number" ||
    !Number.isFinite(i.price) ||
    i.price <= 0
  ) {
    throw new Error("Limit orders require a positive price");
  }
  return {
    type: "order",
    symbol: i.symbol,
    isBuy: i.side === "long",
    price: i.price,
    size: i.size,
    orderType: { type: "limit", tif: i.timeInForce ?? "GTC" },
    ...(i.reduceOnly !== undefined ? { reduceOnly: i.reduceOnly } : {}),
  };
}

function buildMarketOrder(i: SubmitOrderInput): MarketOrder {
  return {
    type: "order",
    symbol: i.symbol,
    isBuy: i.side === "long",
    price: 0,
    size: i.size,
    orderType: { type: "market", isMarket: true, triggerPx: 0 },
    ...(i.reduceOnly !== undefined ? { reduceOnly: i.reduceOnly } : {}),
  };
}

function buildTriggerOrder(i: SubmitOrderInput): TriggerOrder {
  if (
    typeof i.triggerPrice !== "number" ||
    !Number.isFinite(i.triggerPrice) ||
    i.triggerPrice <= 0
  ) {
    throw new Error("Trigger orders require a positive triggerPrice");
  }
  if (i.tpSl !== "tp" && i.tpSl !== "sl") {
    throw new Error('Trigger orders require tpSl: "tp" | "sl"');
  }
  // `side` remains the execution/close side exposed by submitOrder.
  // Bulk conditionals do not encode an execution side; instead, their
  // `isBuy` field is the direction in which the trigger is crossed.
  const triggerAbove = i.tpSl === "tp" ? i.side === "short" : i.side === "long";
  return {
    type: i.tpSl === "sl" ? "stop" : "takeProfit",
    symbol: i.symbol,
    isBuy: triggerAbove,
    size: i.size,
    triggerPrice: i.triggerPrice,
    iso: false,
  };
}

// -------------------------------------------------------------------------
// Submit flow
// -------------------------------------------------------------------------

/**
 * Submit a single order via Mode A prepare/finalize.
 *
 * Throws on programmer error (bad inputs). Returns a tagged result
 * union for every *runtime* outcome so the UI can render each case.
 */
export async function submitOrder(
  input: SubmitOrderInput,
): Promise<SubmitOrderResult> {
  // Basic input validation — fail fast before asking for a signature.
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new Error("Order size must be a positive number");
  }
  if (!input.symbol || typeof input.symbol !== "string") {
    throw new Error("Order symbol is required");
  }

  // Load the WASM module. `bulk-keychain-wasm` is wasm-pack generated;
  // in `--target web` mode the default export is an init() that must
  // resolve before named exports are usable. In `--target bundler` mode
  // the default export is a no-op — calling it is harmless. Either way,
  // we `await init()` once and cache the module.
  const keychain = await loadKeychain();

  let order: Order;
  if (input.orderType === "limit") order = buildLimitOrder(input);
  else if (input.orderType === "trigger") order = buildTriggerOrder(input);
  else order = buildMarketOrder(input);

  // Nonce: millisecond timestamp.
  //
  //   Value: ~1.76e12 in 2026, safely within f64's integer range
  //   (2^53 = ~9e15). The WASM function accepts f64 directly.
  //
  // Why not something more granular?
  //   - `Date.now() * 1_000_000` (nanoseconds) overflows safe integer
  //     range and silently corrupts the signed bytes.
  //   - BigInt throws: the WASM binding requires f64 specifically.
  //   - OMITTING the nonce causes the library to call Rust's
  //     `SystemTime::now()`, which panics with "time not implemented
  //     on this platform" because this wasm-pack build wasn't
  //     compiled with JS-time bindings.
  //
  // 1ms resolution is adequate for a single user's submission rate.
  // If we ever need finer resolution for HFT-style batching we can
  // add a monotonic counter; not needed for retail.
  const nonce = Date.now();

  // `account` identifies whose positions are affected; `signer`
  // identifies who signed the bytes. They differ when signing via
  // an authorized agent wallet. Default: same pubkey for both
  // (self-trading).
  const account = input.account ?? input.signer.publicKeyBase58;

  const prepared = keychain.prepareOrder(
    order as unknown as Parameters<typeof keychain.prepareOrder>[0],
    {
      account,
      signer: input.signer.publicKeyBase58,
      nonce,
    },
  );

  // Step 2: ask the wallet to sign the canonical message bytes.
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signWithTimeout(input.signer, prepared.messageBytes);
    if (
      !verifyLocalSignature(
        prepared.messageBytes,
        signatureBytes,
        input.signer.publicKeyBase58,
      )
    ) {
      throw new Error(MOBILE_SOLFLARE_HINT);
    }
  } catch (err) {
    // Phantom / Backpack throw a generic Error with code 4001 when
    // the user rejects. We don't over-parse — any sign failure is
    // treated as a rejection from the user's POV.
    return {
      ok: false,
      reason: "user_rejected",
      message: err instanceof Error ? err.message : "Signature was rejected",
    };
  }

  // Step 3: finalize into a SignedTransaction. The library stores the
  // signed bytes internally; we extract the envelope fields we need.
  logSignatureDebug(
    "submit",
    prepared,
    signatureBytes,
    input.signer.publicKeyBase58,
  );
  const signed = prepared.finalize(
    bs58.encode(signatureBytes),
  ) as unknown as SignedTransaction;

  // Step 4: POST the exact finalized action list through our proxy.
  // Rebuilding this JSON would risk submitting different bytes than
  // the wallet approved.
  return submitSignedTransaction({
    actions: signed.actions,
    nonce: signed.nonce,
    account: signed.account,
    signer: signed.signer,
    signature: signed.signature,
  });
}

/**
 * Cancel a single resting order on Bulk.
 *
 * Shares the same prepare → wallet.signMessage → finalize → POST flow
 * as `submitOrder`. The only differences are:
 *   - input is a `CancelOrderAction` instead of an order shape
 *   - the wire action is `{cx: {c, oid}}` (discriminant 3)
 *
 * The library's `prepareOrder()` accepts both orders and cancels
 * natively — see the "Order Types / Cancel Order" section of the
 * bulk-keychain README. We do NOT need a separate `prepareCancel()`.
 *
 * Result shape matches `submitOrder` so the UI can route either
 * submission flow through the same result modal.
 */
export async function submitCancel(
  input: SubmitCancelInput,
): Promise<SubmitOrderResult> {
  // Basic input validation.
  if (!input.symbol || typeof input.symbol !== "string") {
    throw new Error("Cancel symbol is required");
  }
  if (!input.orderId || typeof input.orderId !== "string") {
    throw new Error("Cancel orderId is required");
  }

  const keychain = await loadKeychain();

  const cancelAction: CancelOrderAction = {
    type: "cancel",
    symbol: input.symbol,
    orderId: input.orderId,
  };

  // Same nonce + prepareOrder path as submitOrder — the library
  // internally branches on `type: 'cancel'` vs `type: 'order'`.
  const nonce = Date.now();
  const account = input.account ?? input.signer.publicKeyBase58;
  const prepared = keychain.prepareOrder(
    cancelAction as unknown as Parameters<typeof keychain.prepareOrder>[0],
    {
      account,
      signer: input.signer.publicKeyBase58,
      nonce,
    },
  );

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signWithTimeout(input.signer, prepared.messageBytes);
    if (
      !verifyLocalSignature(
        prepared.messageBytes,
        signatureBytes,
        input.signer.publicKeyBase58,
      )
    ) {
      throw new Error(MOBILE_SOLFLARE_HINT);
    }
  } catch (err) {
    return {
      ok: false,
      reason: "user_rejected",
      message: err instanceof Error ? err.message : "Signature was rejected",
    };
  }

  logSignatureDebug(
    "submit",
    prepared,
    signatureBytes,
    input.signer.publicKeyBase58,
  );
  const signed = prepared.finalize(
    bs58.encode(signatureBytes),
  ) as unknown as SignedTransaction;

  return submitSignedTransaction({
    actions: signed.actions,
    nonce: signed.nonce,
    account: signed.account,
    signer: signed.signer,
    signature: signed.signature,
  });
}

/**
 * Register or revoke an agent wallet on Bulk.
 *
 * Uses the library's `prepareAgentWallet(agentPubkey, delete, options)`
 * helper documented in the bulk-keychain README. Signed by the
 * MAIN account's wallet — which means a Solflare popup appears once
 * per authorization/revocation, not per-trade.
 *
 * Returns the same tagged result union as submitOrder so the UI
 * can reuse its result-modal logic.
 */
