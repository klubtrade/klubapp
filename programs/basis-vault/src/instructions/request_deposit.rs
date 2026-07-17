use {crate::state::*, quasar_lang::prelude::*};

#[derive(Accounts)]
pub struct RequestDeposit<'info> {
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

impl<'info> RequestDeposit<'info> {
    #[inline(always)]
    pub fn handler(&mut self, amount_usdc: u64) -> Result<(), ProgramError> {
        require!(
            amount_usdc >= self.vault.min_deposit_usdc.into(),
            ProgramError::InvalidArgument
        );
        require!(
            self.vault.status == VAULT_STATUS_ACTIVE,
            ProgramError::InvalidAccountData
        );

        self.position.requested_deposit_usdc = self
            .position
            .requested_deposit_usdc
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.position.request_count = self
            .position
            .request_count
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_requested_deposits_usdc = self
            .vault
            .total_requested_deposits_usdc
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
