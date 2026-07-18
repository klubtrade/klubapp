# Threat model

Status: active, initial STRIDE review  
Owner: Klubtrade  
Last reviewed: 2026-07-18

## Protected assets

User identity, wallet ownership, delegated authority, order intent, current
venue state, vault principal/yield, signing keys, database credentials,
authentication tokens, audit evidence, and deployment integrity.

## Principal threats and controls

| Threat                 | Example                                 | Required controls                                                         |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| Spoofing               | Browser supplies another wallet address | Verify Privy token server-side and bind linked wallet ownership           |
| Tampering              | Modify quantity after approval          | Canonical intent hash, wallet signature, immutable command record         |
| Repudiation            | Deny enabling automation                | Append-only audit record with principal, policy, time, and correlation ID |
| Information disclosure | Secret appears in client bundle/log     | Server-only config, redaction tests, secret scanning, rotation            |
| Denial of service      | Faucet/order abuse                      | Risk-class rate limits, circuit breakers, queue backpressure              |
| Elevation              | Worker requests withdrawal              | Typed signer allowlist and non-withdrawal agent scope                     |
| Replay                 | Duplicate signed order                  | Durable nonce/idempotency uniqueness and expiry                           |
| Stale data             | Old mark displayed as live              | Sequence checks, heartbeat, freshness timestamps, degraded UI             |
| Execution uncertainty  | Timeout causes duplicate resubmit       | `RECONCILIATION_REQUIRED`, venue query, no blind write retry              |
| Supply chain           | Compromised wallet dependency           | Lockfile, dependency review, SBOM, pinned CI actions, manual review       |
| Contract misuse        | Wrong mint or fee recipient             | Stored canonical accounts, PDA/mint/owner checks, hard fee cap            |

## Abuse cases

- Horizontal access to another user's profile, account, follows, or orders.
- Cross-environment signature reuse.
- Duplicate/out-of-order leader events creating follower exposure.
- Compromised strategy authority crediting unfunded yield.
- Compromised admin changing fee recipient or blocking exits.
- Malicious frontend requesting a broader signature than the displayed order.
- Database/queue failover between submission and acknowledgement.

Security tests must cover each abuse case before its feature is called
production-ready.
