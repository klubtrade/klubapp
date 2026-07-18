# Contributing

KLUB is a financial application. Changes that affect authentication, orders,
signing, balances, fees, migrations, or the Basis Vault require a written risk
note and test evidence.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cargo fmt --manifest-path programs/basis-vault/Cargo.toml -- --check
cargo test --manifest-path programs/basis-vault/Cargo.toml
```

Do not describe a financial flow as functional unless its complete path was
exercised in the named environment. Pull requests must state one of:

- statically verified;
- locally runtime verified;
- public testnet verified; or
- blocked by an external dependency.

Include transaction signatures or redacted request correlation IDs for public
testnet verification. Never include secrets or signed payloads.

## Change rules

- Use decimal strings or integer base units for authoritative money values.
- Validate all external input at runtime.
- Make financial jobs idempotent and recoverable after restart.
- Keep private signing primitives outside web and browser packages.
- Add a migration for every schema change and verify both empty and prior
  schemas.
- Update security and operational documentation when authority changes.
