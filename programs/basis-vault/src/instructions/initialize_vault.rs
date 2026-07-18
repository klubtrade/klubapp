use {
    crate::state::*,
    quasar_lang::prelude::*,
    quasar_spl::{Mint, Token},
};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: &'info mut Signer,
    #[account(mut, init, payer = authority, seeds = [b"basis_vault", authority], bump)]
    pub vault: &'info mut Account<VaultConfig>,
    #[account(mut,
        init,
        seeds = [b"basis_vault_usdc", vault],
        bump,
        token::mint = usdc_mint, token::authority = vault,
    )]
    pub vault_usdc: &'info mut Account<Token>,
    #[account(mut)]
    pub fee_recipient_usdc: &'info mut Account<Token>,
    #[account(mint::decimals = 6)]
    pub usdc_mint: &'info Account<Mint>,
    pub token_program: &'info Program<Token>,
    pub system_program: &'info Program<System>,
}

impl<'info> InitializeVault<'info> {
    #[inline(always)]
    pub fn handler(
        &mut self,
        strategy_authority: Address,
        performance_fee_bps: u16,
        min_deposit_usdc: u64,
        bumps: &InitializeVaultBumps,
    ) -> Result<(), ProgramError> {
        require!(min_deposit_usdc > 0, ProgramError::InvalidArgument);
        require!(
            performance_fee_bps <= MAX_PERFORMANCE_FEE_BPS,
            ProgramError::InvalidArgument
        );
        require_keys_eq!(
            *self.fee_recipient_usdc.mint(),
            *self.usdc_mint.address(),
            ProgramError::InvalidAccountData
        );
        require_keys_eq!(
            *self.fee_recipient_usdc.owner(),
            *self.authority.address(),
            ProgramError::InvalidAccountData
        );

        self.vault.set_inner(
            *self.authority.address(),
            *self.usdc_mint.address(),
            *self.vault_usdc.address(),
            *self.fee_recipient_usdc.address(),
            strategy_authority,
            performance_fee_bps,
            min_deposit_usdc,
            self.usdc_mint.decimals(),
            0,
            0,
            0,
            0,
            0,
            VAULT_STATUS_ACTIVE,
            bumps.vault,
        );

        Ok(())
    }
}
