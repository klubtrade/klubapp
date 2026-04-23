# Ika + Encrypt — Architecture Notes

> The ramp-and-custody stack that makes KLUB genuinely non-custodial, fully private, and able to pull funds from any chain a user already holds crypto on — without KLUB ever touching their funds, keys, or trade history.

---

## 1. What each piece is (in one sentence each)

- **Ika** — a 2PC-MPC network on Solana where smart contracts control signing keys (called *dWallets*) for Bitcoin, Ethereum, ERC-20s, and any chain Ika ever supports. A Solana program approves a message; the Ika network produces the signature. [solana-pre-alpha.ika.xyz](https://solana-pre-alpha.ika.xyz/), [docs.ika.xyz](https://docs.ika.xyz/)

- **Encrypt** — Fully Homomorphic Encryption (FHE) for Solana programs by dWallet Labs. Smart contracts compute on ciphertexts; validators, indexers, and every observer see encrypted data only. [docs.encrypt.xyz](https://docs.encrypt.xyz/), [encrypt.xyz](https://encrypt.xyz/), [github.com/dwallet-labs/encrypt-pre-alpha](https://github.com/dwallet-labs/encrypt-pre-alpha)

- **clear-msig-ika** — reference implementation of a Solana multisig that binds Ika dWallets for clear-signing and cross-chain send-on-sign flows. [github.com/Iamknownasfesal/clear-msig-ika](https://github.com/Iamknownasfesal/clear-msig-ika). This is the proven pattern we fork/adapt for KLUB's "universal ramp" account primitive.

Taken together, these deliver three product capabilities that KLUB's existing stack cannot:

1. **Non-custodial cross-chain deposit.** User sends BTC or ETH from their existing wallet into their KLUB Solana Ika dWallet; KLUB never holds the funds at any point. The dWallet is *owned by* the user's clear-sign multisig and *controlled by* KLUB's on-chain program rules.
2. **On-chain confidential balance + PnL.** Position sizes, fill prices, PnL, and fee flows stored as FHE ciphertexts. Leaderboards, copy-trade configs, and follow relationships are private by default; reveal is opt-in (user-signed decryption request).
3. **Agent wallets that literally cannot withdraw.** The non-custodial invariant moves from "KLUB policy enforced at the worker" to "Ika's program-level authority lock enforced at consensus".

---

## 2. How Ika dWallets work (the mechanics)

Source: [solana-pre-alpha.ika.xyz](https://solana-pre-alpha.ika.xyz/)

```
1. Create a dWallet            → Ika network runs DKG, emits public key
2. Your program controls it    → dWallet authority transferred to your
                                 program's CPI authority PDA
3. Approve messages            → Your program CPIs `approve_message`
                                 when its own rules permit
4. Ika network signs           → 2PC-MPC distributed signature
5. Signature stored on-chain   → Anyone can read MessageApproval account
```

**Key invariant:** the dWallet's authority is the program's PDA (derived from `[CPI_AUTHORITY_SEED, caller_program_id]`). So whatever your on-chain program says "yes, sign this" to — the Ika network produces the signature and writes it back on-chain. The program is the policy engine. The user never has to be online for the signature itself.

**Supported curves/schemes (pre-alpha, all 11 protocol ops):** DKG, Sign, Presign, FutureSign, ReEncryptShare, across 4 curves × 7 signature schemes. In practice for KLUB: secp256k1 (EVM + BTC), Ed25519 (Solana + Sui + any Ed25519 chain).

**Pre-alpha caveat:** "single mock signer, not real distributed MPC." Keys, data, trust model wipe at Alpha 1 transition. **We do not ship real user funds against pre-alpha Ika.** All real-money paths in KLUB go live only after Ika Alpha 1.

---

## 3. How Encrypt FHE works (the mechanics)

Source: [docs.encrypt.xyz](https://docs.encrypt.xyz/)

```
1. You write FHE logic         → #[encrypt_fn] DSL, normal Rust
2. Macro compiles to a DAG     → Computation graph of FHE operations
3. On-chain execute_graph      → Creates output ciphertext accounts
4. Off-chain executor          → Evaluates graph, commits results
5. Request decryption          → Decryptor responds with plaintext
```

Example (from their docs):
```rust
#[encrypt_fn]
fn transfer(from: EUint64, to: EUint64, amount: EUint64) -> (EUint64, EUint64) {
    let has_funds = from >= amount;
    let new_from = if has_funds { from - amount } else { from };
    let new_to   = if has_funds { to + amount } else { to };
    (new_from, new_to)
}
```

Nobody on-chain sees the actual amounts. Validators see ciphertexts, indexers see ciphertexts, Jito sees ciphertexts. The real amount only exists in memory on the off-chain executor during evaluation and on the requesting user's client after decryption.

**Pre-alpha caveat:** "There is no real encryption — all data is completely public and stored as plaintext on-chain." The executor is mock. Do not submit real financial data until Encrypt Alpha 1.

**Pre-alpha endpoint:**
- gRPC: `pre-alpha-dev-1.encrypt.ika-network.net:443` (TLS)
- Solana RPC: `https://api.devnet.solana.com`
- Encrypt program ID: `4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8`

---

## 4. How clear-msig-ika composes them

Source: [github.com/Iamknownasfesal/clear-msig-ika](https://github.com/Iamknownasfesal/clear-msig-ika)

This is the pattern we adapt for KLUB's universal-account primitive. Key ideas:

### 4.1 Wallet + Intents + Proposals

```
Wallet (PDA: ["clear_wallet", sha256(name)])
  └── Vault (PDA: ["vault", wallet])   ← holds Solana funds, signs CPIs
  └── Intent 0: AddIntent              ← meta: add new intent
  └── Intent 1: RemoveIntent           ← meta: disable intent
  └── Intent 2: UpdateIntent           ← meta: replace intent
  └── Intent 3+: Custom intents        ← transfer SOL, sign EVM tx, etc.
```

A wallet doesn't have free-form permissions — it has a pre-approved *library* of transaction blueprints called **intents**. Each intent has:
- Its own proposers (who can initiate)
- Its own approvers (who can approve)
- Its own threshold (how many approvers required)
- Its own timelock
- A **human-readable template** — what signers literally see

Example: an intent with template `"transfer {1} lamports to {0}"` produces messages like:

```
expires 2030-01-01 00:00:00: approve transfer 1000000000 lamports to 9abc... | wallet: treasury proposal: 42
```

**Critical property:** signers approve human-readable messages via Ed25519 signatures, not opaque serialized transactions. No blind-signing. This is what "clear-sign" means.

### 4.2 Proposal lifecycle

1. **Propose** — proposer signs the human-readable message + parameters
2. **Approve** — approvers sign the same message; bitmap tracks who approved
3. **Execute** — once threshold met and timelock elapsed, anyone can execute
4. **Cleanup** — reclaim rent from executed/cancelled proposals

Vote-switching supported (approve clears a prior cancel, vice versa).

### 4.3 Per-dWallet ownership lock

Because Ika's CPI authority is program-wide (one PDA per caller program), clear-msig-ika adds a **`DwalletOwnership` PDA** at `["dwallet_owner", dwallet]`. First-binder-wins. Subsequent binds + every `ika_sign` re-check that the calling wallet matches. Without this lock, anyone could squat someone else's dWallet binding.

**KLUB takes this same pattern.** A KLUB user's dWallet is bound to their KLUB account's clear-wallet PDA on first deposit, and no other user (or malicious actor spinning up another KLUB-looking program wallet) can drive a sign against it.

### 4.4 Cross-chain signing (the ramp piece)

Supported chains in pre-alpha:
- `evm_1559` — Native EIP-1559 transactions (ETH mainnet, L2s, Sepolia)
- `evm_1559_erc20` — ERC-20 `transfer(address,uint256)` inside an EIP-1559 envelope
- `bitcoin_p2wpkh` — BIP143 P2WPKH (segwit v0) spends

Each chain has a **preimage builder** that takes intent params + `tx_template` and produces the exact bytes the destination chain hashes for signing. Same builder runs on-chain and off-chain (CLI), so the bytes signed == bytes broadcast. No ambiguity.

The one-shot broadcast flow:
```
clear-msig proposal execute \
  --wallet "user-treasury" \
  --proposal <P> \
  --dwallet-program <ika-dwallet-program-id> \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --broadcast
```

That command: (1) builds the chain-specific preimage, (2) sends `ika_sign`, (3) waits for the dWallet network to commit, (4) recovers `v` for ECDSA, (5) splices the signature into the RLP envelope / segwit witness / ABI calldata, (6) posts to the destination chain RPC.

---

## 5. How KLUB uses this stack

### 5.1 The replacement for custodial ramps

**Problem with current `/ramp`:** it sends users to Coinbase Onramp, which requires KYC, regional eligibility, card/bank on file, and locks them into USDC on Solana via a centralized custodian.

**Ika ramp replacement:**

1. User opens `/ramp` in KLUB
2. KLUB provisions (or reuses) a per-user **clear-wallet + dWallet set** via `bind_dwallet` — one dWallet per chain the user wants to fund from (BTC, ETH, ERC-20 USDC, Solana USDC)
3. UI shows deposit addresses for each chain — these are the user's dWallet addresses
4. User sends funds from *their existing wallet on any chain* to the matching deposit address
5. KLUB's on-chain program sees the balance, proposes a bridge-in-and-trade intent for the user's multisig to approve
6. User clear-signs the human-readable message (on Phantom / Ledger / Backpack — whatever Solana wallet they use)
7. The clear-wallet program CPIs `ika_sign` for the source-chain transfer + initiates a Wormhole / Portal / Allbridge / Solana-native swap into USDC on Solana
8. Funds land in the user's **Bulk trading account** (the deposit address that Bulk recognizes, which is the user's Solana wallet — KLUB never touches the actual USDC)

**What KLUB never does:** hold the user's BTC, ETH, USDC, or any keys that control them. The dWallet keys are 2PC-MPC-controlled by the Ika network under our program's CPI authority, and our program will only authorize sends that match a user-approved intent.

### 5.2 The replacement for "agent wallet with KMS"

**Current plan (Week 1 Day 5 → Week 2):** generate Ed25519 keypair in memory, wrap it in AWS KMS, unwrap in worker to sign follower trades. `canWithdraw: false` enforced at the Bulk API layer.

**Ika agent-wallet replacement:** the agent wallet is a *dWallet* bound to the user's clear-wallet with an intent `copy_trade_from_leader` that:
- Has `leader_pubkey` as a parameter
- Has `max_alloc_pct` as a parameter
- Has `allowed_symbols` as a parameter
- Template: `"authorize worker copy-trade: follow @{handle} up to {max_alloc_pct}% for {allowed_symbols}"`
- NO withdraw intent exists on this dWallet (not "disabled" — literally doesn't exist in the intent library)

The user clear-signs that intent once at follow-time. The KLUB worker then:
- Observes leader fills via Bulk WS
- For each fill, constructs the mirror order
- Proposes it against the `copy_trade_from_leader` intent
- The program's logic (on-chain, deterministic, auditable) checks it fits the leader + alloc + symbol constraints
- If yes → `ika_sign` → signature posted to Bulk

**What this gains over KMS:** (a) non-withdrawability is enforced at consensus, not at our API layer; (b) the user can revoke the follow intent on-chain any time and the worker physically cannot sign new orders; (c) no AWS KMS dependency for agent keys.

**What KMS is still for (Weeks 2–8):** our worker still needs *some* Solana key to drive the `propose`/`execute` CPIs that trigger `ika_sign`. That key can be fee-sponsor-only with no access to user funds. It lives in KMS.

### 5.3 The replacement for "leaderboard in Postgres"

**Current plan:** index leader fills into our Postgres, compute 30d PnL / win rate / drawdown, show it on `/follow`.

**Encrypt FHE replacement (stretch, Weeks 14–16+):** store per-leader cumulative position metrics as FHE ciphertexts. Copy-trade config is a ciphertext (which leader, what max alloc — invisible to KLUB, Bulk, or anyone else). Leaderboard rank is computed on ciphertexts via an `#[encrypt_fn]` comparator; users see ranks without KLUB seeing raw PnL or anyone's follow set.

**Why this is Weeks 14–16+:** Encrypt is pre-alpha, currently operates on plaintext-on-chain. Waiting for Encrypt Alpha 1 is the only safe path. Until then, leaderboards are plaintext in Postgres — same as Week 4 plan.

### 5.4 The replacement for "private positions" (V3)

Today a user's positions are plaintext on Bulk. Bulk validators, indexers, and any observer can attribute your book. With Encrypt + Ika there's a clear path to:
- Position size stored as `EUint64` ciphertext
- Entry price stored as `EUint64` ciphertext
- PnL computed on ciphertext via `#[encrypt_fn]`
- Revealed to the user on request (they sign a decryption request; Encrypt's decryptor responds with plaintext)
- Liquidation logic runs on ciphertexts — nobody sees the numbers until liquidation actually happens

**Deep future.** Not Weeks 1–16. But the roadmap must name it as the eventual V3 so we don't make architectural choices that foreclose it.

---

## 6. Where each piece lives in our code

Adding to the existing monorepo:

```
packages/
  ika-client/                       NEW — Ika dWallet bindings
    src/
      types.ts                      dWallet + IkaConfig + DwalletOwnership
      dkg.ts                        wrap the DKG gRPC + Ika program CPIs
      sign.ts                       approve_message + poll for signature
      chains/
        evm.ts                      EIP-1559 preimage builder (TS mirror of
                                    programs/clear-wallet/src/chains/evm.rs)
        btc.ts                      BIP143 P2WPKH preimage builder
        erc20.ts                    ERC-20 transfer preimage builder
  encrypt-client/                   FUTURE (Week 14+) — Encrypt FHE bindings
    src/
      types.ts                      EUint* ciphertext handles
      grpc.ts                       wrap encrypt-grpc for input creation +
                                    decryption requests

programs/
  klub-wallet/                      NEW — our fork of clear-msig-ika
    src/
      state/
        wallet.rs                   KlubWallet (per user)
        intent.rs                   our intent library
        proposal.rs                 proposal lifecycle
        ika_config.rs               per-chain dWallet binding
      instructions/
        create_wallet.rs            user onboarding
        bind_dwallet.rs             first deposit from a new chain
        propose.rs                  worker enqueues follower trade
        approve.rs                  user-side approve (rare, see below)
        execute.rs                  drives ika_sign + posts to Bulk
        ika_sign.rs                 adapter for Ika CPI
      chains/
        evm_1559.rs                 EVM preimage builder
        bitcoin_p2wpkh.rs           BTC preimage builder
        erc20.rs                    ERC-20 preimage builder
      intents/
        copy_trade_from_leader.rs   the core copy-trade intent
        withdraw_to_origin.rs       (opt-in) withdraw back to source chain
        ramp_in.rs                  deposit detection + swap-to-USDC

apps/worker/
  src/workers/
    klub-wallet-proposer.ts         NEW — worker side of propose/execute
    ika-signing-driver.ts           NEW — poll for Ika signature + broadcast
```

**Most visible frontend change:** `/ramp` becomes a multi-chain picker that starts from "what chain do you already have funds on?" instead of "we will charge your card." Card + Coinbase still exist as fallback options for users who literally have no crypto anywhere.

---

## 7. Dependency timeline

Both Ika and Encrypt are pre-alpha. We phase against their release schedule, not ours:

| Phase | Ika | Encrypt | What KLUB can ship |
|---|---|---|---|
| **Now** | pre-alpha (mock MPC) | pre-alpha (plaintext) | Testnet-only integration. UI, intents, plumbing. |
| **Ika Alpha 1** | real 2PC-MPC | (still pre-alpha) | Real cross-chain deposit flows. Leaderboard still plaintext. |
| **Encrypt Alpha 1** | | real FHE | Private positions, private copy-configs, private leaderboards. |
| **Ika + Encrypt mainnet** | | | Full confidential non-custodial KLUB. |

**Both projects wipe state at each phase transition.** Any dWallet created against pre-alpha stops existing at Ika Alpha 1. Any ciphertext account created against pre-alpha stops existing at Encrypt Alpha 1. We plan for this — nothing we build on pre-alpha ever holds real user value.

---

## 8. Risks that are ours (not the stack's)

1. **Pre-alpha cadence is unpredictable.** Ika and Encrypt could ship Alpha 1 in 3 months or 9. Our roadmap bakes in Week-13-onward uncertainty accordingly — we ship the Coinbase Onramp fallback at Week 0 and it stays live indefinitely.

2. **The chain-specific preimage builders are crucial and hard.** Get a byte wrong in the EIP-1559 RLP encoding and the signature is on a message the user did not approve. clear-msig-ika solves this by running identical Rust builders on-chain (in the program) and off-chain (in the CLI) and requiring byte-exact match. We inherit this discipline or we cannot offer cross-chain ramp.

3. **User-approval UX.** Every ramp, every follow, every new leader adds a clear-sign step. We need to keep the human-readable message templates short, unambiguous, and batch-friendly (so one approval can cover a session's follow-behavior, not one per trade).

4. **Hardware wallet support.** Ledger Solana app is required for professional users who will want to secure their clear-wallet signer. clear-msig-ika already supports this (`--signer-ledger`). We surface it from day one as an advanced-settings toggle.

---

## 9. Living document

This file updates when we learn new Ika/Encrypt facts. It is the canonical reference that Week 9+ (ramp integration) and Week 14+ (FHE positions) point at. Any engineering discussion about "should we use KMS or Ika" or "could we put this behind Encrypt" gets resolved by reading this doc first, then updating it.
