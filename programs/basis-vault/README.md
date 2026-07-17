# Basis Vault

Quasar/Solana program scaffold for Klub Earn and Basis Trade.

This v0 program intentionally stores user deposit/withdrawal intent and vault-level
accounting only. It does not custody SPL tokens, mint strategy shares, or execute
rebalance logic yet. Those pieces should be added after the final asset custody
model, strategy authority model, and audit path are locked.

## Instructions

- `initialize_vault` creates a strategy vault config PDA.
- `init_position` creates a wallet-scoped position PDA for a vault.
- `request_deposit` records pending USDC deposit intent.
- `request_withdraw` records pending share withdrawal intent.
- `set_deposits_enabled` pauses or resumes deposit requests.

## Validation

Run from this directory:

```sh
quasar build
quasar test
```
