# Signing architecture

Status: target architecture; production signer disabled until complete  
Owner: Klubtrade  
Last reviewed: 2026-07-18

## Required boundary

Production signing accepts typed intents, never an arbitrary serialized
transaction or arbitrary byte payload.

```ts
type PlaceOrderIntentV1 = {
  version: 1;
  principalId: string;
  accountId: string;
  marketId: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  quantity: string;
  limitPrice?: string;
  reduceOnly: boolean;
  maxSlippageBps: number;
  expiresAt: string;
  nonce: string;
  network: "bulk-testnet" | "bulk-mainnet";
};
```

## Mandatory validation

Before signing, independently verify authenticated principal, account
ownership, delegated-session status, allowed network/domain, market allowlist,
order type, quantity, notional, leverage, position cap, aggregate exposure,
reduce-only correctness, slippage, price freshness, daily loss/drawdown,
expiry, and a unique durable nonce.

The signer constructs the canonical venue payload itself from the approved
intent. The caller cannot supply the bytes to sign.

## Key policy

- Production keys are non-exportable KMS/HSM keys with separate testnet and
  mainnet identities.
- No raw key is stored in an environment variable or database field.
- Every key has an owner, purpose, creation time, rotation deadline, and
  revocation procedure.
- Agent keys cannot withdraw and expire by default.
- Key access is least-privilege and isolated from the web process.
- Emergency controls include global, per-user, per-session, and per-strategy
  revocation without relying on the main UI.

## Replay and audit controls

Every intent carries domain separation, network, expiry, and a unique nonce.
The nonce is claimed transactionally before signing. Each decision records a
correlation ID, intent hash, policy version, decision, reason codes, key ID,
and venue result. Logs exclude tokens, raw keys, raw signatures, and complete
signed payloads.

## Implemented testnet boundary

`packages/signing` now exposes `signOrderIntent`, which parses the V1 command,
performs the mandatory identity/account/network/market/expiry/freshness/risk
checks with exact decimal arithmetic, atomically consumes a nonce through a
storage port, constructs a domain-separated canonical payload, and only then
invokes the cryptographic signer. Policy denial and replay tests are included.

The package still exposes `Signer.sign(Uint8Array)` for low-level cryptographic
tests and adapters. Application and worker execution must use the typed gateway.
The following production blockers remain: non-exportable KMS/HSM provider,
durable nonce-store adapter wired to Postgres, daily loss/drawdown policy,
revocation service, anomaly monitoring, and deployed end-to-end validation.
