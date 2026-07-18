import bs58 from "bs58";
import nacl from "tweetnacl";

import type { BulkWalletSigner } from "./types";

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
export function verifyLocalSignature(
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

export const MOBILE_SOLFLARE_HINT =
  "Your wallet signed a different message than KLUB prepared. " +
  "This is a known issue with mobile Solflare via deep-link — " +
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
export function logSignatureDebug(
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
  let s = "";
  for (let i = 0; i < b.length; i += 1) {
    s += b[i]!.toString(16).padStart(2, "0");
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
type KeychainModule = typeof import("bulk-keychain-wasm");
let keychainPromise: Promise<KeychainModule> | null = null;

export async function loadKeychain(): Promise<KeychainModule> {
  if (keychainPromise) return keychainPromise;
  keychainPromise = (async () => {
    const mod = (await import("bulk-keychain-wasm")) as KeychainModule & {
      default?: (input?: unknown) => Promise<unknown>;
    };
    // Call the default-exported init if present. In `--target bundler`
    // builds there may be no default export, or it may be a no-op;
    // either way we guard and swallow.
    if (typeof mod.default === "function") {
      try {
        await mod.default();
      } catch (err) {
        // If init fails (e.g. bundler already initialized), some
        // wasm-bindgen versions throw. Swallow — the named exports
        // may still work.
        // eslint-disable-next-line no-console
        console.debug("bulk-keychain-wasm init returned an error:", err);
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

export async function signWithTimeout(
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
