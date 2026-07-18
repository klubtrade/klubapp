use {crate::state::*, quasar_lang::prelude::*};

#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
    pub owner: &'info Signer,
    #[account(mut)]
    pub vault: &'info mut Account<VaultConfig>,
    #[account(
        mut,
        has_one = owner,
        has_one = vault,
        seeds = [b"basis_position", owner, vault],
        bump = position.bump
    )]
    pub position: &'info mut Account<UserPosition>,
}

impl<'info> RequestWithdraw<'info> {
    #[inline(always)]
    pub fn handler(&mut self, amount_usdc: u64) -> Result<(), ProgramError> {
        require!(amount_usdc > 0, ProgramError::InvalidArgument);
        let principal: u64 = self.position.deposited_usdc.into();
        let earned: u64 = self.position.claimable_yield_usdc.into();
        let available = principal
            .checked_add(earned)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let already_requested: u64 = self.position.requested_withdraw_usdc.into();
        require!(
            amount_usdc
                .checked_add(already_requested)
                .ok_or(ProgramError::ArithmeticOverflow)?
                <= available,
            ProgramError::InsufficientFunds
        );

        self.position.requested_withdraw_usdc = self
            .position
            .requested_withdraw_usdc
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.position.request_count = self
            .position
            .request_count
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_requested_withdraw_usdc = self
            .vault
            .total_requested_withdraw_usdc
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.request_count = self
            .vault
            .request_count
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }
}
