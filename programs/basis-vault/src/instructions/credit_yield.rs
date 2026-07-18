use {
    crate::state::*,
    quasar_lang::prelude::*,
    quasar_spl::{Mint, Token, TokenCpi},
};

#[derive(Accounts)]
pub struct CreditYield<'info> {
    pub strategy_authority: &'info Signer,
    #[account(mut, has_one = strategy_authority)]
    pub vault: &'info mut Account<VaultConfig>,
    #[account(mut, has_one = vault)]
    pub position: &'info mut Account<UserPosition>,
    #[account(mut)]
    pub strategy_usdc: &'info mut Account<Token>,
    #[account(mut)]
    pub vault_usdc: &'info mut Account<Token>,
    #[account(mint::decimals = 6)]
    pub usdc_mint: &'info Account<Mint>,
    pub token_program: &'info Program<Token>,
}

impl<'info> CreditYield<'info> {
    #[inline(always)]
    pub fn handler(&mut self, amount_usdc: u64) -> Result<(), ProgramError> {
        require!(amount_usdc > 0, ProgramError::InvalidArgument);
        require_keys_eq!(
            *self.usdc_mint.address(),
            self.vault.usdc_mint,
            ProgramError::InvalidAccountData
        );
        require_keys_eq!(
            *self.vault_usdc.address(),
            self.vault.vault_usdc,
            ProgramError::InvalidAccountData
        );
        require_keys_eq!(
            *self.vault_usdc.mint(),
            self.vault.usdc_mint,
            ProgramError::InvalidAccountData
        );
        require_keys_eq!(
            *self.vault_usdc.owner(),
            *self.vault.address(),
            ProgramError::InvalidAccountData
        );
        require_keys_eq!(
            *self.strategy_usdc.mint(),
            self.vault.usdc_mint,
            ProgramError::InvalidAccountData
        );
        require_keys_eq!(
            *self.strategy_usdc.owner(),
            *self.strategy_authority.address(),
            ProgramError::InvalidAccountData
        );

        self.token_program
            .transfer_checked(
                self.strategy_usdc,
                self.usdc_mint,
                self.vault_usdc,
                self.strategy_authority,
                amount_usdc,
                self.vault.usdc_decimals,
            )
            .invoke()?;

        let total_deposited: u64 = self.vault.total_deposited_usdc.into();
        let total_yield: u64 = self.vault.total_claimable_yield_usdc.into();
        let liabilities_after_credit = total_deposited
            .checked_add(total_yield)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        require!(
            self.vault_usdc.amount() >= liabilities_after_credit,
            ProgramError::InsufficientFunds
        );

        self.position.claimable_yield_usdc = self
            .position
            .claimable_yield_usdc
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_claimable_yield_usdc = self
            .vault
            .total_claimable_yield_usdc
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }
}
