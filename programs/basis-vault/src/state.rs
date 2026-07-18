use quasar_lang::prelude::*;

pub const VAULT_STATUS_ACTIVE: u8 = 1;
pub const VAULT_STATUS_PAUSED: u8 = 2;
/// Hard protocol bound: performance fees can never exceed 1% of funded yield.
pub const MAX_PERFORMANCE_FEE_BPS: u16 = 100;

#[account(discriminator = [1])]
pub struct VaultConfig {
    pub authority: Address,
    pub usdc_mint: Address,
    pub vault_usdc: Address,
    pub fee_recipient_usdc: Address,
    pub strategy_authority: Address,
    pub performance_fee_bps: u16,
    pub min_deposit_usdc: u64,
    pub usdc_decimals: u8,
    pub total_deposited_usdc: u64,
    pub total_withdrawn_usdc: u64,
    pub total_claimable_yield_usdc: u64,
    pub total_fee_accrued_usdc: u64,
    pub request_count: u64,
    pub status: u8,
    pub bump: u8,
}

#[account(discriminator = [2])]
pub struct UserPosition {
    pub owner: Address,
    pub vault: Address,
    pub deposited_usdc: u64,
    pub claimable_yield_usdc: u64,
    pub request_count: u64,
    pub bump: u8,
}
