// packages/signing/src/types.ts

/**
 * A raw Ed25519 keypair. 32-byte private, 32-byte public.
 *
 * `privateKey` should NEVER cross process boundaries in serialized
 * form. Agent-wallet keys live only in the worker that submits the
 * signed order; user keys live only in the user's own wallet.
 */
export interface Ed25519Keypair {
  readonly privateKey: Uint8Array; // 32 bytes
  readonly publicKey: Uint8Array; // 32 bytes
}

/**
 * A signer abstraction. The real implementation is `Ed25519Signer`
 * in `signer.ts`; tests can implement a `MockSigner` against the
 * same interface without needing real keys.
 */
export interface Signer {
  /** Base58 encoding of the 32-byte public key. */
  readonly publicKeyBase58: string;

  /** Raw bytes of the 32-byte public key. */
  readonly publicKey: Uint8Array;

  /**
   * Sign an arbitrary byte payload. Returns the 64-byte Ed25519
   * signature. Callers are responsible for canonical serialization
   * of the payload before signing — see `payloads.ts` for helpers.
   */
  sign(payload: Uint8Array): Promise<Uint8Array>;
}

/**
 * Agent-wallet scope. Mirrors what we ask Bulk to enforce on the
 * server side when the user authorizes the key. Every field is a
 * hard limit — KLUB's worker cannot exceed any of them without the
 * Bulk API rejecting the signed request.
 */
export interface AgentWalletScope {
  /** User's Bulk account pubkey (the authorizing party). */
  readonly userPubkey: string;

  /** Agent wallet pubkey (the delegate). */
  readonly agentPubkey: string;

  /**
   * Allowed markets, as an explicit list of symbol strings. Empty
   * array means "no markets allowed" (a pause state). Use `['*']`
   * for "all markets."
   */
  readonly allowedMarkets: readonly string[];

  /**
   * Maximum notional (USD) this agent key is authorized to hold
   * across all positions combined. Our copy-trade worker checks
   * this before placing an order.
   */
  readonly maxNotionalUsd: number;

  /**
   * Expiry timestamp (unix ms). After this, Bulk will reject any
   * signed request from this agent key.
   */
  readonly expiresAt: number;

  /**
   * Whether the agent key can withdraw funds. Always `false` for
   * KLUB-issued agent wallets — we will never hold withdrawal
   * authority. Included explicitly for defense-in-depth so a code
   * change to `true` would show up in code review.
   */
  readonly canWithdraw: false;
}
