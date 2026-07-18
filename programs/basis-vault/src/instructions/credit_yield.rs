use {crate::state::*, quasar_lang::prelude::*};

#[derive(Accounts)]
pub struct CreditYield<'info> {
    pub strategy_authority: &'info Signer,
    #[account(mut, has_one = strategy_authority)]
    pub vault: &'info mut Account<VaultConfig>,
    #[account(mut, has_one = vault)]
    pub position: &'info mut Account<UserPosition>,
}

impl<'info> CreditYield<'info> {
    #[inline(always)]
    pub fn handler(&mut self, amount_usdc: u64) -> Result<(), ProgramError> {
        require!(amount_usdc > 0, ProgramError::InvalidArgument);

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
