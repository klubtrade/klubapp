# KLUB

The retail gateway to Bulk Haven.

KLUB is a public **testnet beta** for simpler Bulk market discovery, trading,
portfolio risk, and experimental basis products. Test balances have no monetary
value. Automation and the Basis Vault are not audited or mainnet-ready.

## Quick start

```bash
pnpm install
pnpm dev
# → http://localhost:3000
```

The landing page is `/`. Authenticated product surfaces include `/home`,
`/trade`, `/pro`, `/portfolio`, `/earn`, and `/basis`.

## Structure

```
apps/web/                 — Next.js presentation and HTTP adapters
apps/worker/              — background indexing, alerts, and experimental copy workflows
packages/api-client/      — external Bulk transport boundary
packages/calc/            — deterministic financial calculations
packages/db/              — Drizzle/Postgres schema and migrations
packages/signing/         — cryptography scaffolding; production typed signer pending
programs/basis-vault/     — Quasar/Solana testnet custody program
docs/security/            — trust, threat, signing, key, incident, and remediation docs
```

## Design tokens

- **Palette:** near-black matte with KLUB gold accent.
- **Type:** Inter (UI), JetBrains Mono (numerics + labels).
- **Radii:** `rounded-klub` (10px), `rounded-klub-lg` (16px).
- **Motion:** Framer Motion `whileInView` on the landing; CSS `.reveal` utility elsewhere. Respects `prefers-reduced-motion`.

## Readiness

| Area                           | State                                                          |
| ------------------------------ | -------------------------------------------------------------- |
| Public UI and Privy connection | Integrated testnet beta                                        |
| Bulk market/account data       | Integrated; upstream availability applies                      |
| User-signed order flow         | Testnet integration; reliability hardening active              |
| Postgres persistence           | Partially integrated                                           |
| Worker/copy execution          | Experimental; production executor disabled by default          |
| Delegated signing              | Scaffold only; not production-approved                         |
| Basis Vault                    | Experimental public-testnet program; source interface changing |
| Mainnet capital                | Not ready                                                      |

Architecture is documented in [`ARCHITECTURE.md`](ARCHITECTURE.md). Security
status and reviewer remediation are tracked in
[`docs/security/independent-review-remediation.md`](docs/security/independent-review-remediation.md).
