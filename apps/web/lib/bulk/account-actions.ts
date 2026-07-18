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
  if (!input.agentPublicKey || typeof input.agentPublicKey !== "string") {
    throw new Error("agentPublicKey is required");
  }

  const keychain =
    (await loadKeychain()) as typeof import("bulk-keychain-wasm") & {
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

  if (typeof keychain.prepareAgentWallet !== "function") {
    throw new Error(
      "bulk-keychain-wasm does not export prepareAgentWallet. Library may be out of date; bump to the latest and retry.",
    );
  }

  const nonce = Date.now();
  const prepared = keychain.prepareAgentWallet(
    input.agentPublicKey,
    input.isDelete,
    {
      account: input.signer.publicKeyBase58,
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
  ) as SignedTransaction;

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
  const keychain =
    (await loadKeychain()) as typeof import("bulk-keychain-wasm") & {
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

  if (typeof keychain.prepareFaucet !== "function") {
    return {
      ok: false,
      reason: "rejected_invalid",
      message:
        "bulk-keychain-wasm does not export prepareFaucet. Library may be out of date; bump to the latest and retry.",
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
  ) as SignedTransaction;

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
  if (!input.name || typeof input.name !== "string") {
    throw new Error("Sub-account name is required");
  }

  const keychain = await loadKeychain();
  if (typeof keychain.prepareCreateSubAccount !== "function") {
    return {
      ok: false,
      reason: "rejected_invalid",
      message:
        "bulk-keychain-wasm does not export prepareCreateSubAccount. Library may be out of date; bump to ≥ v0.1.15.",
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
  if (input.marginSymbol) opts["marginSymbol"] = input.marginSymbol;
  if (input.marginAmount !== undefined)
    opts["marginAmount"] = input.marginAmount;

  const prepared = keychain.prepareCreateSubAccount(input.name, opts);

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
  readonly kind: "internal" | "external";
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
    throw new Error("Transfer requires from + to pubkeys");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Transfer amount must be a positive number");
  }

  const keychain = await loadKeychain();
  if (typeof keychain.prepareTransfer !== "function") {
    return {
      ok: false,
      reason: "rejected_invalid",
      message:
        "bulk-keychain-wasm does not export prepareTransfer. Library may be out of date; bump to ≥ v0.1.15.",
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

  // Transport the exact action list produced during finalization.
  return submitSignedTransaction({
    actions: signed.actions,
    nonce: signed.nonce,
    account: signed.account,
    signer: signed.signer,
    signature: signed.signature,
  });
}
