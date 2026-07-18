# Independent review remediation ledger

Status: active  
Owner: Klubtrade  
Last reviewed: 2026-07-18

This is the acceptance ledger for the 53 findings delivered on 2026-07-18.
Statuses are deliberately strict:

- **Implemented:** source change exists and named verification passed.
- **Partial:** useful controls exist, but the full acceptance condition is not met.
- **External:** requires provider configuration, audit, legal review, or deployment.
- **Outstanding:** not yet implemented.

No row marked partial is represented as production-ready.

|   # | Finding                         | Status                     | Current evidence / next acceptance condition                                                                                                                                                     |
| --: | ------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | Trust/security architecture     | Partial                    | Six security documents and privilege/data-flow diagrams added; enforcement work continues.                                                                                                       |
|   2 | Harden signing boundary         | Partial                    | Typed, domain-separated intent signer enforces ownership/scope/risk/freshness and nonce port with 12 tests; KMS/HSM, durable nonce adapter, revocation and deployed E2E remain.                  |
|   3 | Copy execution state machine    | Partial                    | Explicit transition graph plus transactionally persisted intents/transitions now exist; copy-engine adoption and venue recovery E2E remain.                                                      |
|   4 | Basis economic model            | Partial                    | Testnet model explicitly fixed as prefunded yield distributor; mainnet user-capital model remains external design/audit work.                                                                    |
|   5 | Remove legacy settlement        | Implemented                | Reachable instructions and modules removed; `cargo test` passed after change. Devnet redeploy still required.                                                                                    |
|   6 | Vault invariants/property tests | Partial                    | Invariant specification added; existing 4 Rust tests pass, generated/property tests remain outstanding.                                                                                          |
|   7 | Enforce package boundaries      | Partial                    | Dependency rules documented; import-lint enforcement and target packages remain outstanding.                                                                                                     |
|   8 | DTO/domain separation           | Outstanding                | Bulk DTOs still leak into callers; add validated adapter/domain mapping.                                                                                                                         |
|   9 | Branded financial types         | Partial                    | New domain intents use branded decimal strings and signing risk math is exact; older calculation, DB, and UI paths still contain JavaScript numbers.                                             |
|  10 | Calculation source of truth     | Partial                    | `packages/calc` exists; duplication audit, formula metadata, and venue-authority labels remain.                                                                                                  |
|  11 | Idempotent worker jobs          | Partial                    | Durable idempotency keys, status, attempts, locks, exponential backoff and dead-letter state added and integration-tested; worker handlers still need adoption.                                  |
|  12 | Transactional outbox            | Partial                    | Intent, first transition and outbox commit atomically; restart-safe claim/publish/fail primitives tested. Publisher transport and live-worker E2E remain.                                        |
|  13 | Continuous reconciliation       | Partial                    | Durable reconciliation schema exists; scheduled Bulk comparison/resolution workflow and live mismatch tests remain.                                                                              |
|  14 | WebSocket sequencing/staleness  | Partial                    | Reconnect paths exist; formal sequence-gap/snapshot-delta/staleness enforcement remains.                                                                                                         |
|  15 | Risk-class rate limits          | Outstanding                | In-memory faucet cooldown is insufficient; implement Redis/Postgres policies per route class.                                                                                                    |
|  16 | Privy server verification       | Partial                    | Official `@privy-io/node` verification and linked-Solana ownership added to account, order, profile, follows, portfolio, handle, leader, and vault routes; authenticated production E2E remains. |
|  17 | Step-up authentication          | Outstanding                | Define and implement sensitive-action authorization and session inventory/revocation.                                                                                                            |
|  18 | Invite/faucet abuse             | Outstanding                | Schema checks exist; durable eligibility, IP/device controls, bot defence, idempotency and audit remain.                                                                                         |
|  19 | Relational constraints          | Partial                    | Added status, decimal, amount, side/type, slippage, nonce, idempotency and event-sequence constraints; broader legacy-table audit remains.                                                       |
|  20 | Double-entry ledger             | Outstanding                | No internal balanced ledger exists.                                                                                                                                                              |
|  21 | Immutable audit records         | Partial                    | Append-only audit schema and mutation-rejection trigger added; hash-chain writer and external immutable sink remain.                                                                             |
|  22 | Versioning/upgrade governance   | Partial                    | Key policy documented; program version/timelock/multisig enforcement and deployment manifest remain.                                                                                             |
|  23 | Separate emergency actions      | Outstanding                | Only deposit pause exists; add separately authorized pause controls and events.                                                                                                                  |
|  24 | Fee recipient substitution      | Implemented                | Vault now stores canonical fee token account and withdrawal verifies exact address, mint and owner; source tests pass, devnet redeploy required.                                                 |
|  25 | Liquidity/insolvency behaviour  | Partial                    | Prefunded model and liquidity qualifier documented; UI and on-chain stressed-liquidity policy remain.                                                                                            |
|  26 | Product scope sequencing        | Accepted with modification | Reliability gates apply to every surface; product development is not frozen per owner direction.                                                                                                 |
|  27 | Trading confirmation detail     | Outstanding                | Audit and add required before/after order and risk fields with timestamps.                                                                                                                       |
|  28 | Testnet/mainnet separation      | Partial                    | Testnet UI exists; persistent, unmistakable environment treatment and isolated data controls remain.                                                                                             |
|  29 | Mock/live labelling             | Outstanding                | Inventory all seeded data and label or remove it from live surfaces.                                                                                                                             |
|  30 | Explain portfolio health        | Partial                    | Calculation exists; drill-down inputs, assumptions and freshness remain.                                                                                                                         |
|  31 | Accessibility                   | Outstanding                | Full WCAG/keyboard/screen-reader/reduced-motion trading-flow audit required.                                                                                                                     |
|  32 | Execution uncertainty UX        | Outstanding                | Introduce explicit uncertain/reconciling states before resubmission.                                                                                                                             |
|  33 | External runtime validation     | Partial                    | Some Zod/parsers exist; every REST/WS response and schema-drift failure path remains.                                                                                                            |
|  34 | Retry/circuit-breaker policy    | Outstanding                | Central typed error classification and operation-specific retry policy required.                                                                                                                 |
|  35 | Pin Bulk compatibility          | Partial                    | Bulk client version is pinned by lockfile; capability/version negotiation and contract canary remain.                                                                                            |
|  36 | Testing pyramid                 | Partial                    | Package/web/Rust tests exist; contract, integration, E2E, resilience and security layers remain.                                                                                                 |
|  37 | Golden calculation vectors      | Outstanding                | Add venue-confirmed fixtures shared by web/worker/backend.                                                                                                                                       |
|  38 | Mutation testing                | Outstanding                | Add mutation runner and thresholds for `packages/calc`.                                                                                                                                          |
|  39 | Mandatory CI/protection         | Partial                    | CI and CODEOWNERS added; branch rules, action SHA pinning, SAST/secret/cargo audit remain.                                                                                                       |
|  40 | Reproducible releases           | Partial                    | Changelog added; tags, provenance, deployed SHA, rollback and manifest remain.                                                                                                                   |
|  41 | Supply-chain controls           | Partial                    | Lockfile/dependency review added; Renovate, SBOM, licenses, secret scan and attestations remain.                                                                                                 |
|  42 | Migration validation            | Partial                    | PGlite validates all migrations from empty and 0008 over prior schema, constraints, replay, and audit trigger; Railway execution and concurrent-version/forward-repair tests remain.             |
|  43 | Financial metrics               | Outstanding                | Define and emit order/worker/signing/data/vault metrics.                                                                                                                                         |
|  44 | Distributed tracing             | Outstanding                | Add redacted correlation IDs browser-to-reconciliation.                                                                                                                                          |
|  45 | Operational SLOs                | Outstanding                | Set measurable SLOs and user-impact alerts.                                                                                                                                                      |
|  46 | Incident runbooks               | Partial                    | Initial multi-incident runbook added; private contacts, rehearsals and vendor-specific commands remain.                                                                                          |
|  47 | Documentation sprawl            | Outstanding                | Move root phase briefs/prototypes into status-labelled docs hierarchy.                                                                                                                           |
|  48 | Obsolete previews               | Outstanding                | Inventory tracked previews, archive or delete after confirming no deployment dependency.                                                                                                         |
|  49 | Governance files                | Implemented                | SECURITY, proprietary LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, CODEOWNERS, CHANGELOG and ARCHITECTURE added.                                                                                      |
|  50 | README accuracy                 | Implemented                | README now distinguishes integrated, experimental, scaffolded, testnet, and mainnet readiness.                                                                                                   |
|  51 | Qualify non-custodial           | Partial                    | Trust model qualifies delegation; all product copy still needs inventory/correction.                                                                                                             |
|  52 | Performance verification        | Outstanding                | Define return methodology and visibly classify simulated/testnet results.                                                                                                                        |
|  53 | Legal/compliance review         | External                   | Jurisdiction-specific counsel required before real-money earn/copy/automation launch.                                                                                                            |

## Verification log

### 2026-07-18

- Static audit used tracked files, not generated `target`, `.next`, or `.turbo`
  output.
- JavaScript test suite: 103 passed across web, worker, signing, API client, and
  calculation packages.
- Full lint and typecheck: 10/10 Turbo tasks passed for each command.
- Full production build: 6/6 packages passed, including all 39 Next.js routes.
- Critical-surface Prettier check passed. The pre-existing repository-wide
  formatting backlog remains tracked separately.
- `quasar test`: build passed and 3 Basis Vault tests passed (one framework ID
  test filtered by Quasar).
- Rust formatting and strict Clippy passed; only Quasar macro-generated
  `too_many_arguments` is narrowly exempted.
- Updated Basis program has not yet been deployed or exercised on devnet.
- New domain package: 14 order parser/state-machine tests passed.
- Signing package: 22 tests passed, including 12 policy-limited intent tests.
- Database migrations passed empty/prior-schema validation; order, outbox,
  rate-limit, nonce, and audit workflows passed 9 PostgreSQL-compatible PGlite
  integration tests.
- Production Railway migration has not run: Vercel exposes encrypted variables
  as placeholders to CLI pulls, and no Railway worker service is deployed yet.
