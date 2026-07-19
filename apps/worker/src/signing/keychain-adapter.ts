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
  readonly orderId?: string;
  readonly orderIds?: readonly string[];
}

interface NativeKeychain {
  NativeKeypair: {
    fromBytes(bytes: Buffer): {
      readonly pubkey: string;
    };
  };
  NativeSigner: new (keypair: { readonly pubkey: string }) => {
    readonly pubkey: string;
    signBytes(message: Buffer): string;
  };
  prepareOrder(
    order: Parameters<BulkKeychainAdapter["prepareOrder"]>[0],
    options: Parameters<BulkKeychainAdapter["prepareOrder"]>[1],
  ): NativePreparedMessage;
  prepareOrderGroup(
    orders: Parameters<BulkKeychainAdapter["prepareOrder"]>[0][],
    options: Parameters<BulkKeychainAdapter["prepareOrder"]>[1],
  ): NativePreparedMessage;
  prepareFaucetRequest(options: {
    readonly account: string;
    readonly signer?: string;
    readonly nonce?: number;
  }): NativePreparedMessage;
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

export function getNativeAgentPublicKey(secretKey: Uint8Array): string {
  return nativeKeychain.NativeKeypair.fromBytes(Buffer.from(secretKey)).pubkey;
}

export function signPreparedWithAgentSecret(params: {
  readonly secretKey: Uint8Array;
  readonly expectedPublicKey: string;
  readonly messageBytes: Uint8Array;
}): string {
  const keypair = nativeKeychain.NativeKeypair.fromBytes(
    Buffer.from(params.secretKey),
  );
  if (keypair.pubkey !== params.expectedPublicKey) {
    throw new Error("Agent secret does not match the authorized public key");
  }
  const signer = new nativeKeychain.NativeSigner(keypair);
  return signer.signBytes(Buffer.from(params.messageBytes));
}

export function prepareSignedFaucetRequest(params: {
  readonly secretKey: Uint8Array;
  readonly expectedPublicKey: string;
  readonly nonce?: number;
}) {
  const keypair = nativeKeychain.NativeKeypair.fromBytes(
    Buffer.from(params.secretKey),
  );
  if (keypair.pubkey !== params.expectedPublicKey) {
    throw new Error(
      "Strategy secret does not match the configured Bulk account",
    );
  }
  const signer = new nativeKeychain.NativeSigner(keypair);
  const prepared = nativeKeychain.prepareFaucetRequest({
    account: keypair.pubkey,
    signer: keypair.pubkey,
    nonce: params.nonce ?? Date.now(),
  });
  return nativeKeychain.finalizePreparedTransaction(
    prepared,
    signer.signBytes(prepared.messageBytes),
  );
}

export function prepareSignedOrderGroup(params: {
  readonly secretKey: Uint8Array;
  readonly expectedPublicKey: string;
  readonly orders: Parameters<BulkKeychainAdapter["prepareOrder"]>[0][];
  readonly nonce?: number;
}) {
  const keypair = nativeKeychain.NativeKeypair.fromBytes(
    Buffer.from(params.secretKey),
  );
  if (keypair.pubkey !== params.expectedPublicKey) {
    throw new Error("Strategy secret does not match the Bulk strategy account");
  }
  const signer = new nativeKeychain.NativeSigner(keypair);
  const prepared = nativeKeychain.prepareOrderGroup(params.orders, {
    account: keypair.pubkey,
    signer: keypair.pubkey,
    nonce: params.nonce ?? Date.now(),
  });
  return {
    signed: nativeKeychain.finalizePreparedTransaction(
      prepared,
      signer.signBytes(prepared.messageBytes),
    ),
    orderIds: prepared.orderIds ?? (prepared.orderId ? [prepared.orderId] : []),
  };
}

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
