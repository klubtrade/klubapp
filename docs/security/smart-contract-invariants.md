# Basis Vault invariants

Status: required contract properties  
Owner: Klubtrade  
Last reviewed: 2026-07-18

## Custody and accounting

- Vault token balance is at least immediately withdrawable liabilities.
- Sum of user principal equals total deposited principal.
- Sum of user claimable yield equals total claimable yield.
- Fees collected never exceed realized funded yield.
- Principal is never charged a performance fee.
- A withdrawal never exceeds the user's principal plus claimable yield.
- Claimable yield increases only when matching USDC is transferred into the
  canonical vault token account in the same instruction.
- The configured mint and canonical vault token account cannot change after
  initialization.

## Authorization

- Only the position owner can deposit or withdraw that position.
- Admin cannot transfer user funds.
- Strategy authority cannot withdraw principal or user yield.
- Fee recipient has the configured mint and canonical configured owner/address.
- Program upgrade, admin replacement, strategy replacement, and fee changes
  follow explicit governance and hard bounds.

## Emergency behaviour

- Pausing deposits cannot mutate principal.
- Pausing strategy actions does not automatically pause safe withdrawals.
- Every privileged or pause action emits authority, reason, time, prior state,
  and new state.

## Required generated tests

Property/fuzz tests cover zero and boundary values, `u64` overflow, decimal
rounding, repeated cycles, multiple users, partial/full withdrawal, wrong mint,
wrong token program/PDA/bump/authority, duplicate initialization, malicious fee
account, same-slot credit and withdrawal, and interleaved pause operations.

Example-based unit tests alone do not satisfy this invariant plan.
