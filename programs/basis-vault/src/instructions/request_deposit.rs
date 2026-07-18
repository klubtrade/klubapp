use {
    crate::state::*,
    quasar_lang::prelude::*,
    quasar_spl::{Mint, Token, TokenCpi},
};

#[derive(Accounts)]
pub struct RequestDeposit<'info> {
    pub owner: &'info Signer,
    #[account(mut)]
    pub vault: &'info mut Account<VaultConfig>,
    #[account(
        mut,
        has_one = owner,
        has_one = vault,
        seeds = [b"basis_position", owner, vault], bump = position.bump
    )]
    pub position: &'info mut Account<UserPosition>,
    #[account(mut)]
    pub owner_usdc: &'info mut Account<Token>,
    #[account(mut)]
    pub vault_usdc: &'info mut Account<Token>,
    #[account(mint::decimals = 6)]
    pub usdc_mint: &'info Account<Mint>,
    pub token_program: &'info Program<Token>,
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
            *self.owner_usdc.mint(),
            self.vault.usdc_mint,
            ProgramError::InvalidAccountData
        );
        require_keys_eq!(
            *self.owner_usdc.owner(),
            *self.owner.address(),
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

        self.token_program
            .transfer_checked(
                self.owner_usdc,
                self.usdc_mint,
                self.vault_usdc,
                self.owner,
                amount_usdc,
                self.vault.usdc_decimals,
            )
            .invoke()?;

        self.position.deposited_usdc = self
            .position
            .deposited_usdc
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.position.request_count = self
            .position
            .request_count
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_deposited_usdc = self
            .vault
            .total_deposited_usdc
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
