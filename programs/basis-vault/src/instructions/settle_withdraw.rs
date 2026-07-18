use {crate::state::*, quasar_lang::prelude::*};

#[derive(Accounts)]
pub struct SettleWithdraw<'info> {
    pub strategy_authority: &'info Signer,
    #[account(mut, has_one = strategy_authority)]
    pub vault: &'info mut Account<VaultConfig>,
    #[account(mut, has_one = vault)]
    pub position: &'info mut Account<UserPosition>,
}

impl<'info> SettleWithdraw<'info> {
    #[inline(always)]
    pub fn handler(&mut self, amount_usdc: u64) -> Result<(), ProgramError> {
        require!(amount_usdc > 0, ProgramError::InvalidArgument);
        require!(
            amount_usdc <= self.position.requested_withdraw_usdc.into(),
            ProgramError::InsufficientFunds
        );

        let yield_available: u64 = self.position.claimable_yield_usdc.into();
        let yield_paid = if amount_usdc > yield_available {
            yield_available
        } else {
            amount_usdc
        };
        let principal_paid = amount_usdc
            .checked_sub(yield_paid)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        self.position.requested_withdraw_usdc = self
            .position
            .requested_withdraw_usdc
            .checked_sub(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_requested_withdraw_usdc = self
            .vault
            .total_requested_withdraw_usdc
            .checked_sub(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        if yield_paid > 0 {
            self.position.claimable_yield_usdc = self
                .position
                .claimable_yield_usdc
                .checked_sub(yield_paid)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            self.vault.total_claimable_yield_usdc = self
                .vault
                .total_claimable_yield_usdc
                .checked_sub(yield_paid)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }

        if principal_paid > 0 {
            self.position.deposited_usdc = self
                .position
                .deposited_usdc
                .checked_sub(principal_paid)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            self.vault.total_deposited_usdc = self
                .vault
                .total_deposited_usdc
                .checked_sub(principal_paid)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }

        Ok(())
    }
}
