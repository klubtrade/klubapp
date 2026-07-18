use {
    crate::{
        instructions::{
            CreditYield, InitPosition, InitializeVault, RequestDeposit, RequestWithdraw,
            SettleDeposit, SettleWithdraw,
        },
        state::{UserPosition, VaultConfig, MAX_FEE_BPS, VAULT_STATUS_ACTIVE, VAULT_STATUS_PAUSED},
    },
    quasar_lang::prelude::*,
};

#[test]
fn account_layouts_are_stable() {
    assert_eq!(VaultConfig::DISCRIMINATOR, &[1]);
    assert_eq!(UserPosition::DISCRIMINATOR, &[2]);
    assert_eq!(VaultConfig::SPACE, 151);
    assert_eq!(UserPosition::SPACE, 106);
}

#[test]
fn instruction_account_counts_are_stable() {
    assert_eq!(InitializeVault::COUNT, 3);
    assert_eq!(InitPosition::COUNT, 4);
    assert_eq!(RequestDeposit::COUNT, 3);
    assert_eq!(RequestWithdraw::COUNT, 3);
    assert_eq!(SettleDeposit::COUNT, 3);
    assert_eq!(CreditYield::COUNT, 3);
    assert_eq!(SettleWithdraw::COUNT, 3);
}

#[test]
fn risk_bounds_are_stable() {
    assert_eq!(MAX_FEE_BPS, 5_000);
    assert_ne!(VAULT_STATUS_ACTIVE, VAULT_STATUS_PAUSED);
}
