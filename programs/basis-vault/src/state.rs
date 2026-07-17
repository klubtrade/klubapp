use quasar_lang::prelude::*;

pub const VAULT_STATUS_ACTIVE: u8 = 1;
pub const VAULT_STATUS_PAUSED: u8 = 2;
pub const MAX_FEE_BPS: u16 = 5_000;

/// Global configuration for one Basis strategy vault.
///
/// This first pass stores intent/accounting metadata only. SPL token custody,
/// share minting, and automated rebalance execution belong in the next audited
/// pass once the token accounts and strategy authority are finalized.
#[account(discriminator = [1])]
pub struct VaultConfig {
    pub authority: Address,
    pub usdc_mint: Address,
    pub strategy_authority: Address,
    pub management_fee_bps: u16,
    pub performance_fee_bps: u16,
    pub min_deposit_usdc: u64,
    pub total_requested_deposits_usdc: u64,
    pub total_requested_withdraw_shares: u64,
    pub request_count: u64,
    pub status: u8,
    pub bump: u8,
}

/// Wallet-scoped position/intent account for one vault.
#[account(discriminator = [2])]
pub struct UserPosition {
    pub owner: Address,
    pub vault: Address,
    pub requested_deposit_usdc: u64,
    pub requested_withdraw_shares: u64,
    pub shares: u64,
    pub request_count: u64,
    pub bump: u8,
}
