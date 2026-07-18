# Basis Vault

Quasar/Solana program for the KLUB Basis Vault.

The current program is designed for public testnet custody of SPL mock USDC:
users deposit SPL USDC into a program-owned vault token account, the strategy
authority can credit only funded yield, and users can withdraw immediately from
available vault custody.

## Product policy encoded

- Minimum deposit: `100 USDC` (`100_000_000` raw units for a 6-decimal mint).
- Withdrawal latency: instant, while vault liquidity is available.
- Fee model: `10 bps` performance fee on earned yield only.
- Management fee: default `0 bps`.
- Admin authority: controls vault initialization and deposit pause/resume.
- Strategy authority: can credit yield only by transferring SPL USDC into the
  vault in the same instruction. It cannot withdraw user principal.

## Instructions

- `initialize_vault` creates the vault config PDA and the program-owned
  `vault_usdc` SPL token account.
- `init_position` creates a wallet-scoped user position PDA.
- `request_deposit` transfers SPL USDC from the user token account into
  `vault_usdc` and credits user principal.
- `credit_yield` requires the strategy authority to transfer funded SPL USDC
  into `vault_usdc`, then credits the user's claimable yield.
- `request_withdraw` transfers principal/yield from `vault_usdc` to the user
  token account immediately and sends the performance fee to the admin-owned
  fee token account.
- `set_deposits_enabled` pauses or resumes new deposits.

`settle_deposit` and `settle_withdraw` remain in the codebase for compatibility
with earlier accounting-only flows. The product path should prefer the direct
SPL custody instructions above.

## Deployment inputs

Set these values before wiring the frontend to live vault transactions:

```sh
BASIS_VAULT_PROGRAM_ID=<deployed program id>
BASIS_VAULT_ADMIN=<vault admin authority pubkey>
BASIS_VAULT_STRATEGY_AUTHORITY=<strategy authority pubkey>
BASIS_VAULT_USDC_MINT=<6-decimal SPL mock USDC mint>
BASIS_VAULT_MIN_DEPOSIT_USDC=100000000
BASIS_VAULT_MANAGEMENT_FEE_BPS=0
BASIS_VAULT_PERFORMANCE_FEE_BPS=10
SOLANA_RPC_URL=<server-side RPC URL>
NEXT_PUBLIC_SOLANA_RPC_URL=<browser-safe RPC URL>
```

For testnet, `BASIS_VAULT_ADMIN` and `BASIS_VAULT_STRATEGY_AUTHORITY` can be
two Solana keypairs you control. For mainnet, use separate roles: a cold
multisig for admin and a limited hot key for strategy execution.

## Strategy model

Use a delta-neutral basis/funding carry model:

1. Keep user custody on Solana in the vault token account.
2. Keep execution permissions outside the vault program.
3. Let a strategy operator run Bulk basis trades with bounded off-chain risk
   controls.
4. Credit yield on-chain only after the strategy authority transfers real SPL
   USDC into the vault.

This keeps user withdrawals simple and makes the mainnet audit scope clearer:
the vault program handles custody/accounting, while strategy execution is a
separate controlled system.

## Validation

Run from this directory:

```sh
quasar build
quasar test
```
