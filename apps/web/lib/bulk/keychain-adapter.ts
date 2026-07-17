import type { BulkKeychainAdapter } from "@klub/api-client";

type KeychainModule = typeof import("bulk-keychain-wasm");

let adapterPromise: Promise<BulkKeychainAdapter> | undefined;

/** Load Bulk's browser WASM signer once and expose it through the gateway. */
export function loadBrowserKeychainAdapter(): Promise<BulkKeychainAdapter> {
  adapterPromise ??= createAdapter();
  return adapterPromise;
}

async function createAdapter(): Promise<BulkKeychainAdapter> {
  const keychain = (await import("bulk-keychain-wasm")) as KeychainModule & {
    default?: (input?: unknown) => Promise<unknown>;
  };
  if (typeof keychain.default === "function") {
    await keychain.default();
  } else {
    keychain.init();
  }

  return {
    prepareOrder: (order, options) => keychain.prepareOrder(order, options),
    prepareApproveBuilderCode: (recipient, feeBps, options) =>
      keychain.prepareApproveBuilderCode(recipient, feeBps, options),
    prepareRevokeBuilderCode: (recipient, options) =>
      keychain.prepareRevokeBuilderCode(recipient, options),
    finalize: (prepared, signature) =>
      keychain.finalizeTransaction(prepared, signature),
  };
}
