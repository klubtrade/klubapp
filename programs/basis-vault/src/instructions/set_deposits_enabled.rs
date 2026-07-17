use {crate::state::*, quasar_lang::prelude::*};

#[derive(Accounts)]
pub struct SetDepositsEnabled<'info> {
    pub authority: &'info Signer,
    #[account(
        mut,
        has_one = authority,
        seeds = [b"basis_vault", authority],
        bump = vault.bump
    )]
    pub vault: &'info mut Account<VaultConfig>,
}

impl<'info> SetDepositsEnabled<'info> {
    #[inline(always)]
    pub fn handler(&mut self, enabled: bool) -> Result<(), ProgramError> {
        self.vault.status = if enabled {
            VAULT_STATUS_ACTIVE
        } else {
            VAULT_STATUS_PAUSED
        };
        Ok(())
    }
}
