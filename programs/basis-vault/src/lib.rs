#![cfg_attr(not(test), no_std)]

use quasar_lang::prelude::*;

declare_id!("AZWFCfPmynzsrHevyUWgHpMDN5uJLAyGKRbAeUHe8scx");

mod instructions;
use instructions::*;
pub mod state;

#[program]
mod basis_vault {
    use super::*;

    #[instruction(discriminator = [1])]
    pub fn initialize_vault(
        ctx: Ctx<InitializeVault>,
        strategy_authority: Address,
        performance_fee_bps: u16,
        min_deposit_usdc: u64,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(
            strategy_authority,
            performance_fee_bps,
            min_deposit_usdc,
            &ctx.bumps,
        )
    }

    #[instruction(discriminator = [3])]
    pub fn request_deposit(ctx: Ctx<RequestDeposit>, amount_usdc: u64) -> Result<(), ProgramError> {
        ctx.accounts.handler(amount_usdc)
    }

    #[instruction(discriminator = [2])]
    pub fn init_position(ctx: Ctx<InitPosition>) -> Result<(), ProgramError> {
        ctx.accounts.handler(&ctx.bumps)
    }

    #[instruction(discriminator = [4])]
    pub fn request_withdraw(
        ctx: Ctx<RequestWithdraw>,
        amount_usdc: u64,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(amount_usdc, &ctx.bumps)
    }

    #[instruction(discriminator = [5])]
    pub fn set_deposits_enabled(
        ctx: Ctx<SetDepositsEnabled>,
        enabled: bool,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(enabled)
    }

    #[instruction(discriminator = [7])]
    pub fn credit_yield(ctx: Ctx<CreditYield>, amount_usdc: u64) -> Result<(), ProgramError> {
        ctx.accounts.handler(amount_usdc)
    }
}

#[cfg(test)]
mod tests;
