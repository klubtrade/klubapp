/** Shared Bulk submission types. */

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
 * (Agent Wallet flows are a Day 5 concern - they'll override `account`
 * while keeping `signMessage` on the main wallet).
 */
export interface BulkWalletSigner {
  readonly publicKeyBase58: string;
  readonly signMessage: (bytes: Uint8Array) => Promise<Uint8Array>;
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
      readonly reason:
        | "rejected_risk_limit"
        | "rejected_crossing"
        | "rejected_invalid"
        | "network_error"
        | "user_rejected";
      readonly message: string;
      readonly raw?: unknown;
      readonly status?: number;
    };
