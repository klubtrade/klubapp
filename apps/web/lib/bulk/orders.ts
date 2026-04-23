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

import bs58 from 'bs58';

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
 * testnet, gated by a server-side whitelist + 24h cooldown per user).
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
 * Anything our signing path accepts. Used by submitOrder,
 * submitCancel, submitAgentWalletAuth, and submitFaucetClaim.
 */
export type Order = LimitOrder | MarketOrder;
export type OrderOrCancel = Order | CancelOrderAction;
export type SignableAction =
  | Order
  | CancelOrderAction
  | AgentWalletCreationAction
  | FaucetClaimAction;

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
  readonly orderType: 'limit' | 'market';
  readonly size: number;
  readonly price?: number; // required for limit; ignored for market
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

  const order: Order =
    input.orderType === 'limit' ? buildLimitOrder(input) : buildMarketOrder(input);

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
    signatureBytes = await input.signer.signMessage(prepared.messageBytes);
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
  const signed = prepared.finalize(bs58.encode(signatureBytes)) as unknown as SignedTransaction;

  // Step 4: POST via our proxy.
  //
  // We deliberately do NOT forward `signed.actions` as-is. In
  // bulk-keychain-wasm 0.1.12, that field is a wasm-bindgen opaque
  // object whose own-enumerable keys are empty — JSON.stringify
  // renders it as `{}` and Bulk's parser rejects with
  // "expected value at line 1 column 14" because actions[0] is empty.
  //
  // Instead, we reconstruct the wire-shape `actions` array from the
  // original Order we already have. This is the compact-field
  // notation Bulk's HTTP API expects (see bulk-integration-notes §5
  // and docs.bulk.trade/api-reference/placeOrder).
  return submitSignedTransaction({
    wireActions: toWireActions(order),
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
    signatureBytes = await input.signer.signMessage(prepared.messageBytes);
  } catch (err) {
    return {
      ok: false,
      reason: 'user_rejected',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  const signed = prepared.finalize(bs58.encode(signatureBytes)) as unknown as SignedTransaction;

  return submitSignedTransaction({
    wireActions: toWireActions(cancelAction),
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
    signatureBytes = await input.signer.signMessage(prepared.messageBytes);
  } catch (err) {
    return {
      ok: false,
      reason: 'user_rejected',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  const signed = prepared.finalize(bs58.encode(signatureBytes)) as SignedTransaction;

  const wireAction: AgentWalletCreationAction = {
    type: 'agentWalletCreation',
    agentPublicKey: input.agentPublicKey,
    isDelete: input.isDelete,
  };

  return submitSignedTransaction({
    wireActions: toWireActions(wireAction),
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
 * per call (roughly 1,000 mockUSDC on testnet; the exact amount is
 * controlled server-side and may change without notice).
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
 *   - "unknown action" if our best-guess wire shape is wrong; bump
 *     the key in toWireActions and retry
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
    signatureBytes = await input.signer.signMessage(prepared.messageBytes);
  } catch (err) {
    return {
      ok: false,
      reason: 'user_rejected',
      message: err instanceof Error ? err.message : 'Signature was rejected',
    };
  }

  const signed = prepared.finalize(bs58.encode(signatureBytes)) as SignedTransaction;

  const wireAction: FaucetClaimAction = { type: 'faucet', user: account };

  return submitSignedTransaction({
    wireActions: toWireActions(wireAction),
    nonce: signed.nonce,
    account: signed.account,
    signer: signed.signer,
    signature: signed.signature,
  });
}

// -------------------------------------------------------------------------
// Wire-format builder + signed envelope POSTer
// -------------------------------------------------------------------------

/**
 * Convert a long-form SignableAction into Bulk's compact wire shape.
 *
 * Long-form (what we pass to prepareOrder / prepareAgentWallet /
 * prepareFaucet):
 *   { type: 'order', symbol: 'BTC-USD', isBuy: true, price: 100,
 *     size: 0.1, orderType: { type: 'limit', tif: 'GTC' } }
 *   { type: 'cancel', symbol: 'BTC-USD', orderId: '...' }
 *   { type: 'agentWalletCreation', agentPublicKey: '...', isDelete: false }
 *   { type: 'faucet' }
 *
 * Compact wire (what Bulk's HTTP API expects):
 *   { l:  { c, b, px, sz, tif, r } }                    disc. 1 (limit)
 *   { m:  { c, b, sz, r } }                             disc. 0 (market)
 *   { cx: { c, oid } }                                  disc. 3 (cancel)
 *   { agentWalletCreation: { a, d } }                   disc. 17 (agent)
 *   { faucet: { u } }                                   testnet drip,
 *                                                        u = recipient
 *                                                        pubkey base58
 *
 * Compact field names per docs.bulk.trade/api-reference/signing:
 *   l = limit, m = market, cx = cancel, c = coin/symbol, b = is_buy,
 *   px = price, sz = size, tif = time_in_force, r = reduce_only,
 *   oid = order_id (base58-encoded 32-byte hash), a = agent_pubkey,
 *   d = is_delete
 *
 * Note: market orders DO NOT include a price on the wire. The binary
 * MarketOrder layout (discriminant 0) is only:
 *   [symbol, is_buy, size, reduce_only]
 * Similarly, cancel's binary layout is just [symbol, order_id_hash].
 */
function toWireActions(action: SignableAction): unknown[] {
  if (action.type === 'cancel') {
    return [
      {
        cx: {
          c: action.symbol,
          oid: action.orderId,
        },
      },
    ];
  }

  if (action.type === 'agentWalletCreation') {
    return [
      {
        agentWalletCreation: {
          a: action.agentPublicKey,
          d: action.isDelete,
        },
      },
    ];
  }

  if (action.type === 'faucet') {
    // Verified by live rejection: server expects `u` = user pubkey.
    // See FaucetClaimAction JSDoc for the full story.
    return [{ faucet: { u: action.user } }];
  }

  const reduceOnly = action.reduceOnly ?? false;

  if (action.orderType.type === 'limit') {
    return [
      {
        l: {
          c: action.symbol,
          b: action.isBuy,
          // Bulk's Rust/serde parser rejects bare JSON integers for
          // f64-typed fields (px, sz). Error message observed:
          //   "invalid type: integer `70000`, expected a f64 as a
          //    string, float, or integer"
          // (The "or integer" is misleading — integer path fails the
          // tagged-variant deserializer.) Stringifying is explicitly
          // supported and forward-compatible. We always stringify so
          // 0.1 vs 70000 both serialize the same way.
          px: toFixedPointString(action.price),
          sz: toFixedPointString(action.size),
          tif: action.orderType.tif,
          r: reduceOnly,
        },
      },
    ];
  }
  // market
  return [
    {
      m: {
        c: action.symbol,
        b: action.isBuy,
        sz: toFixedPointString(action.size),
        r: reduceOnly,
      },
    },
  ];
}

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
  readonly wireActions: unknown[];
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

  const body = {
    actions: env.wireActions,
    nonce: nonceForJson,
    account: env.account,
    signer: env.signer,
    signature: env.signature,
  };

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

  if (!response.ok) {
    // Log both the request body we sent and the response body we got.
    // The rejection modal only shows a short message; we need full
    // shapes to diagnose what Bulk or our proxy is complaining about.
    // Only fires on failure so there's no prod noise.
    try {
      // eslint-disable-next-line no-console
      console.group(`[submitOrder] ${status} rejection`);
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
  if (typeof raw === 'string') return raw;
  if (typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // Common key names for error strings used by Bulk, our own proxy,
  // and upstream HTTP wrappers.
  for (const key of ['error', 'message', 'detail', 'reason', 'raw', 'description']) {
    const v = r[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  // Nested result envelope — some Bulk endpoints wrap rejects in a
  // `result` object.
  const result = r['result'];
  if (result && typeof result === 'object') {
    const rr = result as Record<string, unknown>;
    for (const key of ['rejected', 'error', 'message', 'reason']) {
      const v = rr[key];
      if (typeof v === 'string' && v.length > 0) return v;
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

/**
 * Format a JS number as a string suitable for Bulk's f64 fields (`px`,
 * `sz`). Bulk's Rust parser rejects bare JSON integers for f64 types
 * — the error is literally:
 *
 *   "invalid type: integer `70000`, expected a f64 as a string,
 *    float, or integer"
 *
 * (The "or integer" clause is misleading — it doesn't mean JSON
 * integers work; it means string representations of integers like
 * "70000" work.)
 *
 * We always stringify so 70000 and 0.0071428... both serialize as
 * strings like "70000" and "0.007142857142857143". Trailing zeros
 * and scientific notation are avoided by `Number.toString()` which
 * emits the shortest round-trip form in all JS engines.
 */
function toFixedPointString(n: number): string {
  // JS will emit `1e-7` for very small numbers by default, which
  // Bulk accepts, but we normalize to plain decimal notation for
  // readability and to dodge any parser edge cases in older Rust
  // versions of serde.
  if (!Number.isFinite(n)) {
    throw new Error(`Cannot serialize non-finite number: ${n}`);
  }
  const s = n.toString();
  // If the default toString produced exponent notation (e.g. 1e-7),
  // expand to plain decimal using toFixed() with sufficient precision.
  if (s.includes('e') || s.includes('E')) {
    // 12 decimal places handles typical micro-size orders without
    // losing precision; Bulk's internal fixed-point is 1e-8 so
    // anything beyond 8 decimals is noise, but we include headroom.
    return n.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  }
  return s;
}