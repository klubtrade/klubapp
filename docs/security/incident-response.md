# Incident response

Status: active initial runbook  
Owner: Klubtrade  
Last reviewed: 2026-07-18

## Severity

- **SEV-0:** suspected key compromise, unauthorized fund movement, malicious
  deployment, or contract exploit.
- **SEV-1:** duplicate/uncertain execution, widespread authentication bypass,
  venue desynchronization, or vault accounting mismatch.
- **SEV-2:** degraded market data, queue backlog, or unavailable non-custodial
  feature without evidence of unauthorized action.

## Universal response

1. Open an incident record and assign commander, operations, investigation,
   and communications roles.
2. Preserve logs and deployment/venue evidence without copying secrets.
3. Contain narrowly: revoke the affected key/session, pause new automation or
   deposits, and keep safe withdrawals available where solvency permits.
4. Reconcile venue, database, ledger, and on-chain state.
5. Notify affected users with known facts, uncertainty, and next update time.
6. Remediate, independently verify, restore gradually, and publish a review.

## Specific triggers

- **Signer compromise:** global signing shutdown, KMS disable, revoke agent
  sessions, cancel open orders where safe, reconcile every intent since the
  last trusted event, rotate keys.
- **Duplicate execution:** stop affected consumers, preserve queue state,
  reconcile source events to venue orders, reduce excess exposure only with
  explicit incident authority.
- **Bulk outage/desync:** reject new stale-price operations, mark uncertain
  submissions for reconciliation, restore from snapshot plus ordered deltas.
- **Database corruption:** fail writes closed, restore to isolated database,
  compare immutable audit/outbox/venue state, forward-repair before cutover.
- **Vault issue:** pause deposits and strategy actions independently; do not
  disable withdrawals unless continued withdrawal violates solvency.
- **Privy outage:** preserve existing safe read state, block identity-dependent
  mutations, never fall back to client-asserted identity.
- **Frontend/DNS compromise:** disable deployment/domain, warn users not to
  sign, compare build provenance, rotate exposed web credentials.

Contact trees, vendor contacts, status-page credentials, and legal escalation
details must live in a restricted operational system, not this repository.
