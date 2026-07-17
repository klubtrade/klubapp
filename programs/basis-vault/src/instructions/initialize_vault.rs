use {crate::state::*, quasar_lang::prelude::*};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: &'info mut Signer,
    #[account(mut, init, payer = authority, seeds = [b"basis_vault", authority], bump)]
    pub vault: &'info mut Account<VaultConfig>,
    pub system_program: &'info Program<System>,
}

impl<'info> InitializeVault<'info> {
    #[inline(always)]
    pub fn handler(
        &mut self,
        usdc_mint: Address,
        strategy_authority: Address,
        management_fee_bps: u16,
        performance_fee_bps: u16,
        min_deposit_usdc: u64,
        bumps: &InitializeVaultBumps,
    ) -> Result<(), ProgramError> {
        require!(min_deposit_usdc > 0, ProgramError::InvalidArgument);
        require!(
            management_fee_bps <= MAX_FEE_BPS,
            ProgramError::InvalidArgument
        );
        require!(
            performance_fee_bps <= MAX_FEE_BPS,
            ProgramError::InvalidArgument
        );

        self.vault.set_inner(
            *self.authority.address(),
            usdc_mint,
            strategy_authority,
            management_fee_bps,
            performance_fee_bps,
            min_deposit_usdc,
            0,
            0,
            0,
            VAULT_STATUS_ACTIVE,
            bumps.vault,
        );

        Ok(())
    }
}
