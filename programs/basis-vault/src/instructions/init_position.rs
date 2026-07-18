use {crate::state::*, quasar_lang::prelude::*};

#[derive(Accounts)]
pub struct InitPosition<'info> {
    #[account(mut)]
    pub owner: &'info mut Signer,
    pub vault: &'info Account<VaultConfig>,
    #[account(mut, init, payer = owner, seeds = [b"basis_position", owner, vault], bump)]
    pub position: &'info mut Account<UserPosition>,
    pub system_program: &'info Program<System>,
}

impl<'info> InitPosition<'info> {
    #[inline(always)]
    pub fn handler(&mut self, bumps: &InitPositionBumps) -> Result<(), ProgramError> {
        self.position.set_inner(
            *self.owner.address(),
            *self.vault.address(),
            0,
            0,
            0,
            bumps.position,
        );

        Ok(())
    }
}
