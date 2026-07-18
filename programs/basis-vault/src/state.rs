use quasar_lang::prelude::*;

pub const VAULT_STATUS_ACTIVE: u8 = 1;
pub const VAULT_STATUS_PAUSED: u8 = 2;
pub const MAX_FEE_BPS: u16 = 5_000;

/// Global configuration for one Basis strategy vault.
///
/// This pass models the real user-facing lifecycle: request USDC deposit,
/// operator settles accepted deposits, strategy credits earned USDC, user
/// requests withdrawal against principal + earned balance, then operator
/// settles the withdrawal. SPL token custody is the next audited layer.
#[account(discriminator = [1])]
pub struct VaultConfig {
    pub authority: Address,
    pub usdc_mint: Address,
    pub strategy_authority: Address,
    pub management_fee_bps: u16,
    pub performance_fee_bps: u16,
    pub min_deposit_usdc: u64,
    pub total_requested_deposits_usdc: u64,
    pub total_deposited_usdc: u64,
    pub total_requested_withdraw_usdc: u64,
    pub total_claimable_yield_usdc: u64,
    pub request_count: u64,
    pub status: u8,
    pub bump: u8,
}

/// Wallet-scoped principal + earned balance for one vault.
#[account(discriminator = [2])]
pub struct UserPosition {
    pub owner: Address,
    pub vault: Address,
    pub requested_deposit_usdc: u64,
    pub requested_withdraw_usdc: u64,
    pub deposited_usdc: u64,
    pub claimable_yield_usdc: u64,
    pub request_count: u64,
    pub bump: u8,
}
