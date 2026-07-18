use {
    crate::{
        instructions::{
            CreditYield, InitPosition, InitializeVault, RequestDeposit, RequestWithdraw,
        },
        state::{
            UserPosition, VaultConfig, MAX_PERFORMANCE_FEE_BPS, VAULT_STATUS_ACTIVE,
            VAULT_STATUS_PAUSED,
        },
    },
    quasar_lang::prelude::*,
};

#[test]
fn account_layouts_are_stable() {
    assert_eq!(VaultConfig::DISCRIMINATOR, &[1]);
    assert_eq!(UserPosition::DISCRIMINATOR, &[2]);
    assert_eq!(VaultConfig::SPACE, 214);
    assert_eq!(UserPosition::SPACE, 90);
}

#[test]
fn instruction_account_counts_are_stable() {
    assert_eq!(InitializeVault::COUNT, 7);
    assert_eq!(InitPosition::COUNT, 4);
    assert_eq!(RequestDeposit::COUNT, 7);
    assert_eq!(RequestWithdraw::COUNT, 9);
    assert_eq!(CreditYield::COUNT, 7);
}

#[test]
fn risk_bounds_are_stable() {
    assert_eq!(MAX_PERFORMANCE_FEE_BPS, 100);
    assert_ne!(VAULT_STATUS_ACTIVE, VAULT_STATUS_PAUSED);
}
