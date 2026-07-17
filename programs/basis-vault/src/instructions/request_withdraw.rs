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
    pub fn handler(&mut self, shares: u64) -> Result<(), ProgramError> {
        require!(shares > 0, ProgramError::InvalidArgument);

        self.position.requested_withdraw_shares = self
            .position
            .requested_withdraw_shares
            .checked_add(shares)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.position.request_count = self
            .position
            .request_count
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_requested_withdraw_shares = self
            .vault
            .total_requested_withdraw_shares
            .checked_add(shares)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.request_count = self
            .vault
            .request_count
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }
}
