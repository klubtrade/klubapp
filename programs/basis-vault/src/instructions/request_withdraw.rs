use {
    crate::state::*,
    quasar_lang::{cpi::Seed, prelude::*},
    quasar_spl::{Mint, Token, TokenCpi},
};

#[derive(Accounts)]
pub struct RequestWithdraw<'info> {
    pub owner: &'info Signer,
    pub authority: &'info UncheckedAccount,
    #[account(mut, has_one = authority, seeds = [b"basis_vault", authority], bump = vault.bump)]
    pub vault: &'info mut Account<VaultConfig>,
    #[account(
        mut,
        has_one = owner,
        has_one = vault,
        seeds = [b"basis_position", owner, vault], bump = position.bump
    )]
    pub position: &'info mut Account<UserPosition>,
    #[account(mut)]
    pub vault_usdc: &'info mut Account<Token>,
    #[account(mut)]
    pub owner_usdc: &'info mut Account<Token>,
    #[account(mut)]
    pub fee_recipient_usdc: &'info mut Account<Token>,
    #[account(mint::decimals = 6)]
    pub usdc_mint: &'info Account<Mint>,
    pub token_program: &'info Program<Token>,
}

impl<'info> RequestWithdraw<'info> {
    #[inline(always)]
    pub fn handler(
        &mut self,
        amount_usdc: u64,
        _bumps: &RequestWithdrawBumps,
    ) -> Result<(), ProgramError> {
        require!(amount_usdc > 0, ProgramError::InvalidArgument);
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
        require_keys_eq!(
            *self.fee_recipient_usdc.mint(),
            self.vault.usdc_mint,
            ProgramError::InvalidAccountData
        );
        require_keys_eq!(
            *self.fee_recipient_usdc.owner(),
            *self.authority.address(),
            ProgramError::InvalidAccountData
        );

        let principal: u64 = self.position.deposited_usdc.into();
        let earned: u64 = self.position.claimable_yield_usdc.into();
        let available = principal
            .checked_add(earned)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        require!(amount_usdc <= available, ProgramError::InsufficientFunds);

        let yield_paid = if amount_usdc > earned {
            earned
        } else {
            amount_usdc
        };
        let fee_bps: u16 = self.vault.performance_fee_bps.into();
        let fee_usdc = yield_paid
            .checked_mul(fee_bps as u64)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let user_amount_usdc = amount_usdc
            .checked_sub(fee_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let principal_paid = amount_usdc
            .checked_sub(yield_paid)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        let vault_bump = [self.vault.bump];
        let vault_seeds = [
            Seed::from(b"basis_vault"),
            Seed::from(self.authority.address().as_ref()),
            Seed::from(&vault_bump),
        ];

        if user_amount_usdc > 0 {
            self.token_program
                .transfer_checked(
                    self.vault_usdc,
                    self.usdc_mint,
                    self.owner_usdc,
                    self.vault,
                    user_amount_usdc,
                    self.vault.usdc_decimals,
                )
                .invoke_signed(&vault_seeds)?;
        }
        if fee_usdc > 0 {
            self.token_program
                .transfer_checked(
                    self.vault_usdc,
                    self.usdc_mint,
                    self.fee_recipient_usdc,
                    self.vault,
                    fee_usdc,
                    self.vault.usdc_decimals,
                )
                .invoke_signed(&vault_seeds)?;
        }

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

        self.position.request_count = self
            .position
            .request_count
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_withdrawn_usdc = self
            .vault
            .total_withdrawn_usdc
            .checked_add(amount_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.total_fee_accrued_usdc = self
            .vault
            .total_fee_accrued_usdc
            .checked_add(fee_usdc)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        self.vault.request_count = self
            .vault
            .request_count
            .checked_add(1)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        Ok(())
    }
}
