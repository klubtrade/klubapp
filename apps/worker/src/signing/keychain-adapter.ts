import type {
  BulkKeychainAdapter,
  PreparedBulkTransaction,
} from "@klub/api-client";
import { createRequire } from "node:module";

interface NativePreparedMessage extends PreparedBulkTransaction {
  readonly messageBytes: Buffer;
  readonly actions: string;
  readonly messageBase58?: string;
  readonly messageBase64?: string;
  readonly messageHex?: string;
}

interface NativeKeychain {
  prepareOrder(
    order: Parameters<BulkKeychainAdapter["prepareOrder"]>[0],
    options: Parameters<BulkKeychainAdapter["prepareOrder"]>[1],
  ): NativePreparedMessage;
  prepareApproveBuilderCode(
    recipient: string,
    feeBps: number,
    options: Parameters<BulkKeychainAdapter["prepareApproveBuilderCode"]>[2],
  ): NativePreparedMessage;
  prepareRevokeBuilderCode(
    recipient: string,
    options: Parameters<BulkKeychainAdapter["prepareRevokeBuilderCode"]>[1],
  ): NativePreparedMessage;
  finalizePreparedTransaction(
    prepared: NativePreparedMessage,
    signature: string,
  ): ReturnType<BulkKeychainAdapter["finalize"]>;
}

const require = createRequire(import.meta.url);
// bulk-keychain 0.1.19 ships an invalid reserved-word declaration. Keep the
// runtime official and isolate its local type surface until upstream repairs it.
const nativeKeychain = require("bulk-keychain") as NativeKeychain;

/** Native Node adapter backed by Bulk's canonical wincode implementation. */
export function createNodeKeychainAdapter(): BulkKeychainAdapter {
  return {
    prepareOrder: (order, options) =>
      nativeKeychain.prepareOrder(order, options),
    prepareApproveBuilderCode: (recipient, feeBps, options) =>
      nativeKeychain.prepareApproveBuilderCode(recipient, feeBps, options),
    prepareRevokeBuilderCode: (recipient, options) =>
      nativeKeychain.prepareRevokeBuilderCode(recipient, options),
    finalize: (prepared, signature) =>
      nativeKeychain.finalizePreparedTransaction(
        asNativePrepared(prepared),
        signature,
      ),
  };
}

function asNativePrepared(
  prepared: PreparedBulkTransaction,
): NativePreparedMessage {
  return {
    ...prepared,
    messageBytes: Buffer.from(prepared.messageBytes),
    actions:
      typeof prepared.actions === "string"
        ? prepared.actions
        : JSON.stringify(prepared.actions),
  };
}
