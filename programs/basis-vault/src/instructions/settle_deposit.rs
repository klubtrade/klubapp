use {crate::state::*, quasar_lang::prelude::*};

#[derive(Accounts)]
pub struct SettleDeposit<'info> {
    pub strategy_authority: &'info Signer,
    #[account(mut, has_one = strategy_authority)]
    pub vault: &'info mut Account<VaultConfig>,
    #[account(mut, has_one = vault)]
    pub position: &'info mut Account<UserPosition>,
}

impl<'info> SettleDeposit<'info> {
    #[inline(always)]
    pub fn handler(&mut self, amount_usdc: u64) -> Result<(), ProgramError> {
        require!(amount_usdc > 0, ProgramError::InvalidArgument);
        require!(
            amount_usdc <= self.position.requested_deposit_usdc.into(),
            ProgramError::InsufficientFunds
        );

        self.position.requested_deposit_usdc = self
            .position
            .requested_deposit_usdc
            .checked_sub(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.position.deposited_usdc = self
            .position
            .deposited_usdc
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_requested_deposits_usdc = self
            .vault
            .total_requested_deposits_usdc
            .checked_sub(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_deposited_usdc = self
            .vault
            .total_deposited_usdc
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }
}
