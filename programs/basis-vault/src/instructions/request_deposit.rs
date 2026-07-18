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
        execute_deposit(
            self.owner,
            self.vault,
            self.position,
            self.owner_usdc,
            self.vault_usdc,
            self.usdc_mint,
            self.token_program,
            amount_usdc,
        )
    }
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn execute_deposit<'info>(
    owner: &'info Signer,
    vault: &'info mut Account<VaultConfig>,
    position: &'info mut Account<UserPosition>,
    owner_usdc: &'info mut Account<Token>,
    vault_usdc: &'info mut Account<Token>,
    usdc_mint: &'info Account<Mint>,
    token_program: &'info Program<Token>,
    amount_usdc: u64,
) -> Result<(), ProgramError> {
    require!(
        amount_usdc >= vault.min_deposit_usdc.into(),
        ProgramError::InvalidArgument
    );
    require!(
        vault.status == VAULT_STATUS_ACTIVE,
        ProgramError::InvalidAccountData
    );
    require_keys_eq!(
        *usdc_mint.address(),
        vault.usdc_mint,
        ProgramError::InvalidAccountData
    );
    require_keys_eq!(
        *vault_usdc.address(),
        vault.vault_usdc,
        ProgramError::InvalidAccountData
    );
    require_keys_eq!(
        *owner_usdc.mint(),
        vault.usdc_mint,
        ProgramError::InvalidAccountData
    );
    require_keys_eq!(
        *owner_usdc.owner(),
        *owner.address(),
        ProgramError::InvalidAccountData
    );
    require_keys_eq!(
        *vault_usdc.mint(),
        vault.usdc_mint,
        ProgramError::InvalidAccountData
    );
    require_keys_eq!(
        *vault_usdc.owner(),
        *vault.address(),
        ProgramError::InvalidAccountData
    );

    token_program
        .transfer_checked(
            owner_usdc,
            usdc_mint,
            vault_usdc,
            owner,
            amount_usdc,
            vault.usdc_decimals,
        )
        .invoke()?;

    position.deposited_usdc = position
        .deposited_usdc
        .checked_add(amount_usdc)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    position.request_count = position
        .request_count
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    vault.total_deposited_usdc = vault
        .total_deposited_usdc
        .checked_add(amount_usdc)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    vault.request_count = vault
        .request_count
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    Ok(())
}
