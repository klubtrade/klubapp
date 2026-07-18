# Security policy

## Supported environments

KLUB is currently a public testnet beta. Testnet assets have no monetary
value. Real-capital automation and the Basis Vault are not represented as
audited or mainnet-ready.

Security fixes are applied to the current `main` branch. There are no
supported historical releases yet.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Send a private
report to `security@klub.trade` with:

- the affected URL, commit, program ID, or component;
- reproduction steps and impact;
- whether funds, signing authority, or personal data may be exposed; and
- a safe way to contact you.

Do not access other users' data, move funds, degrade the service, or retain
sensitive material while investigating. KLUB will acknowledge a report within
three business days and provide a remediation status within ten business days.

## Secrets already disclosed

Any secret pasted into chat, an issue, a build log, or another third-party
system must be treated as compromised and rotated. Production signing keys
must never be stored as source, ordinary environment variables, browser data,
or plaintext database fields.

## Security boundaries

The current trust and signing boundaries are documented in
[`docs/security/trust-model.md`](docs/security/trust-model.md) and
[`docs/security/signing-architecture.md`](docs/security/signing-architecture.md).
