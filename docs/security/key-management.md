# Key management

Status: testnet policy; mainnet controls required  
Owner: Klubtrade  
Last reviewed: 2026-07-18

## Classes

| Key                | Testnet                          | Mainnet requirement                                |
| ------------------ | -------------------------------- | -------------------------------------------------- |
| User wallet        | User/Privy controlled            | User/Privy controlled; never exported to KLUB      |
| Agent signer       | Disabled or explicitly test-only | Non-exportable KMS/HSM key, bounded and revocable  |
| Vault admin        | Separate local testnet key       | Cold multisig with monitored, delayed changes      |
| Strategy authority | Separate funded testnet key      | Limited hot key with no withdrawal authority       |
| Program upgrade    | Deployment key                   | Multisig, timelock, public monitoring, exit window |
| Faucet mint        | Server-held testnet key          | Not present in mainnet product                     |

## Lifecycle

Inventory every key by ID and public key. Record environment, role, owner,
provider, created time, last rotation, next rotation, and revocation status.
Grant services access to a key operation, not key material. Test rotation and
revocation quarterly and before mainnet.

## Storage prohibitions

Never place production private keys in source control, chat, localStorage,
ordinary environment variables, plaintext Postgres, analytics, traces, or
support tools. A disclosed credential is compromised even if later deleted.

## Mainnet ceremony

Create keys on trusted hardware; independently verify public keys; configure
multisig threshold and recovery; document signers and backups; verify program
and canonical token accounts; perform a small-value rehearsal; publish the
deployment manifest; and destroy superseded deploy credentials.
