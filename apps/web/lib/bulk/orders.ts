/**
 * Client-side Bulk order submission.
 *
 * Implements the "prepare/finalize" flow (Mode A) from
 * `bulk-keychain-wasm` — the mode used whenever the private key lives
 * inside an external wallet (Phantom, Backpack) and can only sign bytes
 * we hand it.
 *
 * Flow:
 *
 *   1. Build a well-formed `Order` object (long-form TypeScript schema
 *      per bulk-keychain README).
 *   2. Call `prepareOrder(order, { account, signer, nonce })`. The WASM
 *      module returns `{ messageBytes, finalize, ... }`. No private key
 *      involved yet.
 *   3. Ask the Solana wallet adapter to `signMessage(messageBytes)`.
 *      Phantom / Backpack opens a signature prompt. The user approves.
 *      We receive a `Uint8Array` containing the ed25519 signature.
 *   4. Call `prepared.finalize(bs58.encode(signature))`. This returns
 *      a `SignedTransaction` with: actions (JSON string), nonce
 *      (number | string), account (base58), signer (base58), signature
 *      (base58).
 *   5. POST the signed transaction to our `/api/bulk/place-order`
 *      proxy. The proxy forwards to Bulk's `BULK_HTTP_URL` and returns
 *      the response body verbatim, plus a normalized status.
 *
 * We proxy through our own API route instead of POSTing from the
 * browser directly to Bulk because:
 *   - Bulk's HTTP URL is configured as a server-only env var
 *     (`BULK_HTTP_URL`), not `NEXT_PUBLIC_`. The architect chose this.
 *   - It lets us avoid any CORS surprises with Bulk.
 *   - It gives us a single place to add server-side logging, retry,
 *     or response normalization later.
 *
 * The ONLY thing the server proxy does is forward and pass-through.
 * It does NOT touch the signature — your user's wallet is still the
 * sole signer. The proxy is a transport layer, not custody.
 */

import { parseSignedTransaction } from '@klub/api-client';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { normalizeBulkErrorMessage } from '@/lib/bulk/error-messages';

// -------------------------------------------------------------------------
// Local signature verification — catches mobile-wallet message drift
// -------------------------------------------------------------------------

/**
 * Verify the wallet's signature against `prepared.messageBytes` before
 * we ship it to Bulk. If the wallet wrapped, hashed, or otherwise
 * mangled the message before signing, the signature won't verify
 * against our raw canonical bytes — Bulk will return "unauthorized
 * signer" with no breadcrumb and the user sees an inscrutable failure.
 *
 * Mobile Solflare is the canonical case (April 2026): when triggered
 * via the wallet adapter from a mobile browser tab, it signs the
 * message under Solana's off-chain message envelope (SIMD-0048 style)
 * rather than the raw bytes we hand it. Desktop Solflare signs raw
 * bytes. Same wallet, same key, different on-the-wire signature.
 */
function verifyLocalSignature(
  message: Uint8Array,
  signature: Uint8Array,
  signerPubkeyBase58: string,
): boolean {
  try {
    const pub = bs58.decode(signerPubkeyBase58);
    return nacl.sign.detached.verify(message, signature, pub);
  } catch {
    return false;
  }
}

const MOBILE_SOLFLARE_HINT =
  'Your wallet signed a different message than KLUB prepared. ' +
  'This is a known issue with mobile Solflare via deep-link — ' +
  "open this page in Solflare's in-app browser, or use desktop.";

/**
 * Log a compact debug summary right after signing. Lets us compare
 * desktop vs mobile when "unauthorized signer" surfaces despite the
 * local verifyLocalSignature passing — same line on both viewports
 * tells us if the signer pubkey, signature length, signature bytes,
 * or message bytes drift between platforms.
 *
 * Always logs (not gated by a flag) — the cost is one line per
 * submit, the value is a fast diagnosis next time something breaks
 * on a wallet we can't test ourselves.
 */
function logSignatureDebug(
  label: string,
  prepared: { readonly messageBytes: Uint8Array },
  signatureBytes: Uint8Array,
  signerPubkeyBase58: string,
): void {
  try {
    const localVerifyPasses = verifyLocalSignature(
      prepared.messageBytes,
      signatureBytes,
      signerPubkeyBase58,
    );
    // eslint-disable-next-line no-console
    console.debug(`[bulk-submit] ${label}`, {
      signer: signerPubkeyBase58,
      msgLen: prepared.messageBytes.length,
      msgHexPrefix: bytesToHex(prepared.messageBytes.slice(0, 16)),
      sigLen: signatureBytes.length,
      sigHexPrefix: bytesToHex(signatureBytes.slice(0, 16)),
      sigB58: bs58.encode(signatureBytes),
      localVerifyPasses,
    });
  } catch {
    // diagnostic — never throw
  }
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 1) {
    s += b[i]!.toString(16).padStart(2, '0');
  }
  return s;
}

/**
 * Canonical action integrity
 *
 * v0.1.19 exposes the finalized action list. We transport that exact list;
 * rebuilding compact JSON by hand could change fields after the wallet signed.
 */

// -------------------------------------------------------------------------
// WASM module loader
// -------------------------------------------------------------------------

/**
 * `bulk-keychain-wasm` is a wasm-pack generated package. If it was
 * built with `--target web` (the common browser target), the named
 * exports (`prepareOrder`, etc.) are stubs that return undefined until
 * the default-exported `init()` function resolves. If it was built
 * with `--target bundler`, the default export is a no-op and the named
 * exports work immediately. Calling `init()` once is safe in both
 * cases, so we always do it.
 *
 * We cache the loaded module so the WASM binary only downloads once
 * per tab. Without the cache, every call to `submitOrder` would kick
 * off another download.
 */
type KeychainModule = typeof import('bulk-keychain-wasm');
let keychainPromise: Promise<KeychainModule> | null = null;

async function loadKeychain(): Promise<KeychainModule> {
  if (keychainPromise) return keychainPromise;
  keychainPromise = (async () => {
    const mod = (await import('bulk-keychain-wasm')) as KeychainModule & {
      default?: (input?: unknown) => Promise<unknown>;
    };
    // Call the default-exported init if present. In `--target bundler`
    // builds there may be no default export, or it may be a no-op;
    // either way we guard and swallow.
    if (typeof mod.default === 'function') {
      try {
        await mod.default();
      } catch (err) {
        // If init fails (e.g. bundler already initialized), some
        // wasm-bindgen versions throw. Swallow — the named exports
        // may still work.
        // eslint-disable-next-line no-console
        console.debug('bulk-keychain-wasm init returned an error:', err);
      }
    }
    return mod;
  })();
  return keychainPromise;
}

// -------------------------------------------------------------------------
// signMessage with a hard timeout
// -------------------------------------------------------------------------

/**
 * Mobile wallets that round-trip via deep-link (Solflare on iOS is the
 * canonical case) sometimes never resolve the signMessage promise — the
 * user signs in the wallet app but the response never makes it back to
 * the browser tab. The promise hangs indefinitely, the UI sits in
 * "Signing…" forever, and the user thinks the app is broken.
 *
 * Wrap every signMessage call in a Promise.race with a 60s timeout so
 * those hangs surface as a real error the toast can display.
 */
const SIGN_TIMEOUT_MS = 60_000;

async function signWithTimeout(
  signer: BulkWalletSigner,
  message: Uint8Array,
): Promise<Uint8Array> {
  return Promise.race([
    signer.signMessage(message),
    new Promise<Uint8Array>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Wallet did not respond in ${SIGN_TIMEOUT_MS / 1000}s. If you're on mobile, return to this tab after signing in your wallet app — or try again from a desktop browser.`,
          ),
        );
      }, SIGN_TIMEOUT_MS);
    }),
  ]);
}

// -------------------------------------------------------------------------
// Types — mirror the bulk-keychain-wasm README "External Wallet" section
// -------------------------------------------------------------------------

export type TimeInForce = 'GTC' | 'IOC' | 'ALO';

export interface LimitOrder {
  readonly type: 'order';
  readonly symbol: string;
  readonly isBuy: boolean;
  readonly price: number;
  readonly size: number;
  readonly orderType: { readonly type: 'limit'; readonly tif: TimeInForce };
  readonly reduceOnly?: boolean;
}

/**
 * Bulk's native conditional-order input. `isBuy` is unfortunately the
 * keychain name for trigger direction here (`true` = above, `false` =
 * below); conditional orders are reduce-only on the exchange.
 *
 * The legacy Hyperliquid-style `{ type: "order", orderType: { type:
 * "trigger" } }` input serializes as the unsupported `t` action. The
 * v0.1.19 inputs below serialize as `st` and `tp`, respectively.
 */
export interface TriggerOrder {
  readonly type: 'stop' | 'takeProfit';
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
  readonly type: 'order';
  readonly symbol: string;
  readonly isBuy: boolean;
  readonly price: 0; // Bulk requires 0 for market orders
  readonly size: number;
  readonly orderType: {
    readonly type: 'market';
    readonly isMarket: true;
    readonly triggerPx: 0;
  };
  readonly reduceOnly?: boolean;
}

/**
 * Cancel a single resting order. Shape matches the bulk-keychain
 * README "Order Types" section:
 *
 *   { type: 'cancel', symbol: 'BTC-USD', orderId: '...' }
 *
 * The library's `prepareOrder()` accepts this input shape — we do NOT
 * need a separate `prepareCancel()` function. At finalization the
 * library emits a signed transaction whose compact wire shape is
 * `{cx: {c, oid}}` (discriminant 3 per docs.bulk.trade/api-reference/signing).
 */
export interface CancelOrderAction {
  readonly type: 'cancel';
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
  readonly type: 'agentWalletCreation';
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
  readonly type: 'faucet';
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
  readonly type: 'createSubAccount';
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
  readonly type: 'transfer';
  readonly kind: 'internal' | 'external';
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
export interface SignedTransaction {
  readonly actions: string | unknown[] | object;
  readonly nonce: string | number | bigint;
  readonly account: string;
  readonly signer: string;
  readonly signature: string;
  readonly orderId?: string | null;
}

// -------------------------------------------------------------------------
// The signer interface the caller must provide
// -------------------------------------------------------------------------

/**
 * Minimal signer surface we need. Intentionally narrower than the full
 * `useWallet()` return so we can use this helper from any context that
 * can produce a pubkey + a message-signing function.
 *
 * `publicKeyBase58` is the account pubkey. Both the trading account and
 * the signer are the same for Phantom / Backpack users trading directly
 * (Agent Wallet flows are a Day 5 concern — they'll override `account`
 * while keeping `signMessage` on the main wallet).
 */
export interface BulkWalletSigner {
  readonly publicKeyBase58: string;
  readonly signMessage: (bytes: Uint8Array) => Promise<Uint8Array>;
}

// -------------------------------------------------------------------------
// Input to submitOrder — normalized from the UI
// -------------------------------------------------------------------------

export interface SubmitOrderInput {
  readonly symbol: string;
  readonly side: 'long' | 'short';
  readonly orderType: 'limit' | 'market' | 'trigger';
  readonly size: number;
  readonly price?: number; // required for limit; ignored for market/trigger
  /** Required when orderType === 'trigger'. Bulk fires market when crossed. */
  readonly triggerPrice?: number;
  /** 'tp' = take-profit fires when price reaches triggerPrice from below
   *  (long) or above (short); 'sl' = stop-loss inverse. Required for trigger. */
  readonly tpSl?: 'tp' | 'sl';
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

export type SubmitOrderResult =
  | {
      readonly ok: true;
      readonly orderId: string | null;
      readonly raw: unknown;
      readonly status: number;
    }
  | {
      readonly ok: false;
      readonly reason: 'rejected_risk_limit' | 'rejected_crossing' | 'rejected_invalid' | 'network_error' | 'user_rejected';
      readonly message: string;
      readonly raw?: unknown;
      readonly status?: number;
    };

// -------------------------------------------------------------------------
// Order builders
// -------------------------------------------------------------------------

function buildLimitOrder(i: SubmitOrderInput): LimitOrder {
  if (typeof i.price !== 'number' || !Number.isFinite(i.price) || i.price <= 0) {
    throw new Error('Limit orders require a positive price');
  }
  return {
    type: 'order',
    symbol: i.symbol,
    isBuy: i.side === 'long',
    price: i.price,
    size: i.size,
    orderType: { type: 'limit', tif: i.timeInForce ?? 'GTC' },
    ...(i.reduceOnly !== undefined ? { reduceOnly: i.reduceOnly } : {}),
  };
}

function buildMarketOrder(i: SubmitOrderInput): MarketOrder {
  return {
    type: 'order',
    symbol: i.symbol,
    isBuy: i.side === 'long',
    price: 0,
    size: i.size,
    orderType: { type: 'market', isMarket: true, triggerPx: 0 },
    ...(i.reduceOnly !== undefined ? { reduceOnly: i.reduceOnly } : {}),
  };
}

function buildTriggerOrder(i: SubmitOrderInput): TriggerOrder {
  if (
    typeof i.triggerPrice !== 'number' ||
    !Number.isFinite(i.triggerPrice) ||
    i.triggerPrice <= 0
  ) {
    throw new Error('Trigger orders require a positive triggerPrice');
  }
  if (i.tpSl !== 'tp' && i.tpSl !== 'sl') {
    throw new Error('Trigger orders require tpSl: "tp" | "sl"');
  }
  // `side` remains the execution/close side exposed by submitOrder.
  // Bulk conditionals do not encode an execution side; instead, their
  // `isBuy` field is the direction in which the trigger is crossed.
  const triggerAbove = i.tpSl === 'tp' ? i.side === 'short' : i.side === 'long';
  return {
    type: i.tpSl === 'sl' ? 'stop' : 'takeProfit',
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
export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  // Basic input validation — fail fast before asking for a signature.
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new Error('Order size must be a positive number');
  }
  if (!input.symbol || typeof input.symbol !== 'string') {
    throw new Error('Order symbol is required');
  }

  // Load the WASM module. `bulk-keychain-wasm` is wasm-pack generated;
  // in `--target web` mode the default export is an init() that must
  // resolve before named exports are usable. In `--target bundler` mode
  // the default export is a no-op — calling it is harmless. Either way,
  // we `await init()` once and cache the module.
  const keychain = await loadKeychain();

  let order: Order;
  if (input.orderType === 'limit') order = buildLimitOrder(input);
  else if (input.orderType === 'trigger') order = buildTriggerOrder(input);
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
    if (!verifyLocalSignature(prepared.messageBytes, signatureBytes, input.signer.publicKeyBase58)) {
      throw new Error(MOBILE_SOLFLARE_HINT);
    }
  } catch (err) {
    // Phantom / Backpack throw a generic Error with code 4001 when
    // the user rejects. We don't over-parse — any sign failure is
    // treated as a rejection from the user's POV.
    return {
      ok: false,
      reason: 'user_rejected',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  // Step 3: finalize into a SignedTransaction. The library stores the
  // signed bytes internally; we extract the envelope fields we need.
  logSignatureDebug('submit', prepared, signatureBytes, input.signer.publicKeyBase58);
  const signed = prepared.finalize(bs58.encode(signatureBytes)) as unknown as SignedTransaction;

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
export async function submitCancel(input: SubmitCancelInput): Promise<SubmitOrderResult> {
  // Basic input validation.
  if (!input.symbol || typeof input.symbol !== 'string') {
    throw new Error('Cancel symbol is required');
  }
  if (!input.orderId || typeof input.orderId !== 'string') {
    throw new Error('Cancel orderId is required');
  }

  const keychain = await loadKeychain();

  const cancelAction: CancelOrderAction = {
    type: 'cancel',
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
    if (!verifyLocalSignature(prepared.messageBytes, signatureBytes, input.signer.publicKeyBase58)) {
      throw new Error(MOBILE_SOLFLARE_HINT);
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'user_rejected',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  logSignatureDebug('submit', prepared, signatureBytes, input.signer.publicKeyBase58);
  const signed = prepared.finalize(bs58.encode(signatureBytes)) as unknown as SignedTransaction;

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
export interface SubmitAgentWalletAuthInput {
  /** Agent public key to authorize or revoke (base58). */
  readonly agentPublicKey: string;
  /** false = register, true = remove. */
  readonly isDelete: boolean;
  /** Main account signer (wallet-adapter / Solflare). */
  readonly signer: BulkWalletSigner;
}

export async function submitAgentWalletAuth(
  input: SubmitAgentWalletAuthInput,
): Promise<SubmitOrderResult> {
  if (!input.agentPublicKey || typeof input.agentPublicKey !== 'string') {
    throw new Error('agentPublicKey is required');
  }

  const keychain = (await loadKeychain()) as typeof import('bulk-keychain-wasm') & {
    // Extra type note: prepareAgentWallet isn't in the library's
    // published .d.ts yet for v0.1.12 WASM; declare locally rather
    // than chase a type PR upstream.
    prepareAgentWallet?: (
      agent: string,
      isDelete: boolean,
      opts: { account: string; signer: string; nonce: number },
    ) => {
      readonly messageBytes: Uint8Array;
      readonly finalize: (signatureBase58: string) => unknown;
    };
  };

  if (typeof keychain.prepareAgentWallet !== 'function') {
    throw new Error(
      'bulk-keychain-wasm does not export prepareAgentWallet. Library may be out of date; bump to the latest and retry.',
    );
  }

  const nonce = Date.now();
  const prepared = keychain.prepareAgentWallet(input.agentPublicKey, input.isDelete, {
    account: input.signer.publicKeyBase58,
    signer: input.signer.publicKeyBase58,
    nonce,
  });

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signWithTimeout(input.signer, prepared.messageBytes);
    if (!verifyLocalSignature(prepared.messageBytes, signatureBytes, input.signer.publicKeyBase58)) {
      throw new Error(MOBILE_SOLFLARE_HINT);
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'user_rejected',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  logSignatureDebug('submit', prepared, signatureBytes, input.signer.publicKeyBase58);
  const signed = prepared.finalize(bs58.encode(signatureBytes)) as SignedTransaction;

  return submitSignedTransaction({
    actions: signed.actions,
    nonce: signed.nonce,
    account: signed.account,
    signer: signed.signer,
    signature: signed.signature,
  });
}

// -------------------------------------------------------------------------
// Faucet claim (testnet)
// -------------------------------------------------------------------------

/**
 * Input for `submitFaucetClaim`. Optional `account` lets an authorized
 * agent wallet claim on behalf of the main account (silent flow — no
 * wallet popup).
 *
 * There's deliberately NO amount field. Bulk's faucet is a fixed drip
 * per call (1,000 test USDC on testnet, capped to one drip per 72h
 * per account; both numbers controlled server-side).
 */
export interface SubmitFaucetClaimInput {
  readonly signer: BulkWalletSigner;
  /**
   * Override for the transaction's `account` field. When signing with
   * an agent wallet, the agent is the SIGNER but funds go to the main
   * account — pass it here.
   */
  readonly account?: string;
}

/**
 * Claim the testnet faucet drip.
 *
 * Identical shape to `submitAgentWalletAuth` — prepare/finalize via
 * bulk-keychain-wasm, then POST to /order through our proxy. The
 * action has no payload; the signer's wallet identity is the only
 * parameter that matters server-side.
 *
 * Failure modes to expect:
 *   - "not whitelisted" or similar if the user's pubkey isn't on
 *     Bulk's testnet faucet allowlist
 *   - rate-limited (429) if called too often
 *   - "unknown action" if the installed keychain and exchange API are
 *     on incompatible protocol versions
 */
export async function submitFaucetClaim(
  input: SubmitFaucetClaimInput,
): Promise<SubmitOrderResult> {
  const keychain = (await loadKeychain()) as typeof import('bulk-keychain-wasm') & {
    // `prepareFaucet` is in the published README's "Prepare Functions"
    // table but may not be in the .d.ts for older WASM builds.
    // Declare locally to avoid a version-chase.
    prepareFaucet?: (opts: {
      account: string;
      signer: string;
      nonce: number;
    }) => {
      readonly messageBytes: Uint8Array;
      readonly finalize: (signatureBase58: string) => unknown;
    };
  };

  if (typeof keychain.prepareFaucet !== 'function') {
    return {
      ok: false,
      reason: 'rejected_invalid',
      message:
        'bulk-keychain-wasm does not export prepareFaucet. Library may be out of date; bump to the latest and retry.',
    };
  }

  const account = input.account ?? input.signer.publicKeyBase58;
  const nonce = Date.now();

  const prepared = keychain.prepareFaucet({
    account,
    signer: input.signer.publicKeyBase58,
    nonce,
  });

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signWithTimeout(input.signer, prepared.messageBytes);
    if (!verifyLocalSignature(prepared.messageBytes, signatureBytes, input.signer.publicKeyBase58)) {
      throw new Error(MOBILE_SOLFLARE_HINT);
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'user_rejected',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  logSignatureDebug('submit', prepared, signatureBytes, input.signer.publicKeyBase58);
  const signed = prepared.finalize(bs58.encode(signatureBytes)) as SignedTransaction;

  // Transport the exact action list produced during finalization.
  return submitSignedTransaction({
    actions: signed.actions,
    nonce: signed.nonce,
    account: signed.account,
    signer: signed.signer,
    signature: signed.signature,
  });
}

// -------------------------------------------------------------------------
// Sub-accounts (Bulk v1.0.14)
// -------------------------------------------------------------------------

export interface SubmitCreateSubAccountInput {
  readonly name: string;
  readonly marginSymbol?: string;
  readonly marginAmount?: number;
  readonly signer: BulkWalletSigner;
  readonly account?: string;
}

/**
 * Create a named sub-account ("Pot") on the user's master account.
 *
 * Same prepare → wallet.signMessage → finalize → POST flow as the
 * other actions. The wasm bindings `prepareCreateSubAccount(name, opts)`
 * accept just `name` in the basic form; `marginSymbol`/`marginAmount`
 * are passed through as part of `opts` if the wasm version supports
 * them (v0.1.15 does, per the release notes).
 */
export async function submitCreateSubAccount(
  input: SubmitCreateSubAccountInput,
): Promise<SubmitOrderResult> {
  if (!input.name || typeof input.name !== 'string') {
    throw new Error('Sub-account name is required');
  }

  const keychain = await loadKeychain();
  if (typeof keychain.prepareCreateSubAccount !== 'function') {
    return {
      ok: false,
      reason: 'rejected_invalid',
      message:
        'bulk-keychain-wasm does not export prepareCreateSubAccount. Library may be out of date; bump to ≥ v0.1.15.',
    };
  }

  const account = input.account ?? input.signer.publicKeyBase58;
  const nonce = Date.now();

  // The wasm signature is `prepareCreateSubAccount(name, options)`. We
  // pass the optional margin-seed fields inside the options bag — older
  // wasm builds will ignore them silently; v0.1.15 reads them.
  const opts: Record<string, unknown> = {
    account,
    signer: input.signer.publicKeyBase58,
    nonce,
  };
  if (input.marginSymbol) opts['marginSymbol'] = input.marginSymbol;
  if (input.marginAmount !== undefined) opts['marginAmount'] = input.marginAmount;

  const prepared = keychain.prepareCreateSubAccount(input.name, opts);

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signWithTimeout(input.signer, prepared.messageBytes);
    if (!verifyLocalSignature(prepared.messageBytes, signatureBytes, input.signer.publicKeyBase58)) {
      throw new Error(MOBILE_SOLFLARE_HINT);
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'user_rejected',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  logSignatureDebug('submit', prepared, signatureBytes, input.signer.publicKeyBase58);
  const signed = prepared.finalize(bs58.encode(signatureBytes)) as unknown as SignedTransaction;

  // Transport the exact action list produced during finalization.
  return submitSignedTransaction({
    actions: signed.actions,
    nonce: signed.nonce,
    account: signed.account,
    signer: signed.signer,
    signature: signed.signature,
  });
}

// -------------------------------------------------------------------------
// Transfers (Bulk v1.0.14)
// -------------------------------------------------------------------------

export interface SubmitTransferInput {
  readonly kind: 'internal' | 'external';
  /** Source pubkey — usually the connected wallet or one of its sub-accounts. */
  readonly from: string;
  /** Destination pubkey. For external transfers, must be a Solana address. */
  readonly to: string;
  /** Margin symbol (e.g. 'USDC'). */
  readonly marginSymbol: string;
  /** Amount in margin-symbol units (raw f64, NOT scaled). */
  readonly amount: number;
  readonly signer: BulkWalletSigner;
  readonly account?: string;
}

/**
 * Transfer margin between accounts. Internal transfers move between
 * a master and one of its sub-accounts; external transfers route to
 * any network address (rejected for off-curve non-protocol accounts
 * by Bulk per the v1.0.14 changelog).
 */
export async function submitTransfer(
  input: SubmitTransferInput,
): Promise<SubmitOrderResult> {
  if (!input.from || !input.to) {
    throw new Error('Transfer requires from + to pubkeys');
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Transfer amount must be a positive number');
  }

  const keychain = await loadKeychain();
  if (typeof keychain.prepareTransfer !== 'function') {
    return {
      ok: false,
      reason: 'rejected_invalid',
      message:
        'bulk-keychain-wasm does not export prepareTransfer. Library may be out of date; bump to ≥ v0.1.15.',
    };
  }

  const account = input.account ?? input.signer.publicKeyBase58;
  const nonce = Date.now();

  const prepared = keychain.prepareTransfer(
    input.from,
    input.to,
    input.amount,
    {
      account,
      signer: input.signer.publicKeyBase58,
      nonce,
      kind: input.kind,
    },
  );

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = await signWithTimeout(input.signer, prepared.messageBytes);
    if (!verifyLocalSignature(prepared.messageBytes, signatureBytes, input.signer.publicKeyBase58)) {
      throw new Error(MOBILE_SOLFLARE_HINT);
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'user_rejected',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  logSignatureDebug('submit', prepared, signatureBytes, input.signer.publicKeyBase58);
  const signed = prepared.finalize(bs58.encode(signatureBytes)) as unknown as SignedTransaction;

  // Transport the exact action list produced during finalization.
  return submitSignedTransaction({
    actions: signed.actions,
    nonce: signed.nonce,
    account: signed.account,
    signer: signed.signer,
    signature: signed.signature,
  });
}

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
  readonly actions: SignedTransaction['actions'];
  readonly nonce: string | number | bigint;
  readonly account: string;
  readonly signer: string;
  readonly signature: string;
}

async function submitSignedTransaction(env: SignedEnvelope): Promise<SubmitOrderResult> {
  // Normalize nonce for JSON transport. If the library returns a
  // BigInt (possible in some wasm builds), we must convert to string
  // because JSON.stringify throws on BigInt. For regular numbers we
  // pass through unchanged — Bulk's docs show the envelope nonce as
  // a JSON number.
  const nonceForJson: string | number =
    typeof env.nonce === 'bigint' ? env.nonce.toString() : env.nonce;

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
  if (typeof window !== 'undefined' && window.localStorage?.getItem('klubDebugSubmit') === '1') {
    // eslint-disable-next-line no-console
    console.group('[submit] outgoing');
    // eslint-disable-next-line no-console
    console.log('body:', JSON.stringify(body, null, 2));
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  let response: Response;
  try {
    response = await fetch('/api/bulk/place-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'network_error',
      message: err instanceof Error ? err.message : 'Network request failed',
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
      console.log('Request body:', JSON.stringify(body, null, 2));
      // eslint-disable-next-line no-console
      console.log('Response body (live):', raw);
      // eslint-disable-next-line no-console
      console.log(
        'Response body (JSON):',
        (() => {
          try {
            return JSON.stringify(raw, null, 2);
          } catch {
            return '(not JSON-serializable)';
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
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // Bulk uses both 'err' (Hyperliquid-style) and 'error' (full word)
  // depending on the action / version. Catch both.
  if (r['status'] === 'err' || r['status'] === 'error') {
    return extractErrorMessage(raw) ?? 'Bulk rejected the transaction';
  }
  if (r['success'] === false || r['ok'] === false) {
    return extractErrorMessage(raw) ?? 'Bulk rejected the transaction';
  }

  // Per-action error inside a batch envelope (the 'status: error'
  // response Bulk returns for unauthorized signer puts the real
  // reason here under data.statuses[i].error). The error field
  // arrives in two shapes — bare string or nested {message: string} —
  // depending on the failure type. Probe both.
  const response = r['response'];
  if (response && typeof response === 'object') {
    const resp = response as Record<string, unknown>;
    const data = resp['data'];
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      const statuses = d['statuses'];
      if (Array.isArray(statuses)) {
        for (const s of statuses) {
          if (s && typeof s === 'object') {
            const sErr = (s as Record<string, unknown>)['error'];
            if (typeof sErr === 'string' && sErr.length > 0) return sErr;
            if (sErr && typeof sErr === 'object') {
              const nested = (sErr as Record<string, unknown>)['message'];
              if (typeof nested === 'string' && nested.length > 0) return nested;
            }
          }
        }
      }
    }
  }

  return null;
}

function extractOrderId(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const candidate = r['orderId'] ?? r['order_id'] ?? r['oid'] ?? r['id'];
  if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  if (typeof candidate === 'number') return String(candidate);
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

  if (lower.includes('risk') || lower.includes('margin')) {
    return {
      ok: false,
      reason: 'rejected_risk_limit',
      message: msg,
      raw,
      status,
    };
  }
  if (lower.includes('cross') || lower.includes('spread') || lower.includes('self-trade')) {
    return {
      ok: false,
      reason: 'rejected_crossing',
      message: msg,
      raw,
      status,
    };
  }
  return {
    ok: false,
    reason: 'rejected_invalid',
    message: msg,
    raw,
    status,
  };
}

function extractErrorMessage(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return normalizeHumanError(raw);
  if (typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // Common key names for error strings used by Bulk, our own proxy,
  // and upstream HTTP wrappers.
  for (const key of ['error', 'message', 'detail', 'reason', 'raw', 'description']) {
    const v = r[key];
    if (typeof v === 'string' && v.length > 0) return normalizeHumanError(v);
  }
  // Nested result envelope — some Bulk endpoints wrap rejects in a
  // `result` object.
  const result = r['result'];
  if (result && typeof result === 'object') {
    const rr = result as Record<string, unknown>;
    for (const key of ['rejected', 'error', 'message', 'reason']) {
      const v = rr[key];
      if (typeof v === 'string' && v.length > 0) return normalizeHumanError(v);
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
