// apps/web/lib/ramp/ika-experimental.ts
/**
 * Experimental ramp driver — Ika (dWallet) + Encrypt (FHE) on Solana.
 *
 *   - Ika:     https://solana-pre-alpha.ika.xyz/
 *   - Encrypt: https://docs.encrypt.xyz/
 *
 * The eventual architecture:
 *
 *   1. A Solana program holds the dWallet authority for a user's
 *      cross-chain custody account. The dWallet can sign on any chain
 *      (Ethereum, Arbitrum, etc.) via 2PC-MPC distributed signing.
 *   2. On ramp-in: user deposits from any chain; the Ika signer
 *      forwards the assets to a Bulk deposit transaction.
 *   3. On ramp-out: user requests withdrawal; the program checks
 *      conditions (2FA, cool-down, jurisdictional gate) and approves
 *      the message; Ika network produces the signature.
 *   4. Sensitive state (balance deltas, ramp history) lives in Encrypt
 *      FHE ciphertext accounts so validators and indexers never see it.
 *
 * Why this is disabled on mainnet:
 *
 *   Per their own docs (fetched during architecture review):
 *     - Ika: "pre-alpha... signing uses a single mock signer, not real
 *       distributed MPC... do not rely on any key material until
 *       mainnet."
 *     - Encrypt: "no real encryption — all data is completely public
 *       and stored as plaintext on-chain. Do not submit any sensitive
 *       or real data."
 *
 *   We architect for it, ship the interface, and light it up on
 *   testnet only until both reach production.
 */

import type { RampDriver, RampQuote, RampQuoteInput } from './index.js';

export const ikaExperimentalDriver: RampDriver = {
  id: 'ika-encrypt',
  label: 'Ika + Encrypt (Experimental)',
  isProduction: false,

  isAvailable() {
    const flag = process.env['NEXT_PUBLIC_EXPERIMENTAL_IKA_RAMP'];
    const network = process.env['NEXT_PUBLIC_BULK_NETWORK'];
    return flag === 'true' && network === 'testnet';
  },

  async getQuote(_input: RampQuoteInput): Promise<RampQuote> {
    // Stubbed quote — real implementation lands when Ika Alpha 1 ships.
    return {
      providerId: 'ika-encrypt',
      feeUsd: 0,
      estimatedReceiveUsd: _input.amountUsd,
      estimatedTimeSec: 30,
      action: {
        kind: 'unavailable',
        reason:
          'Experimental driver. Enable only on testnet. Waiting for Ika and Encrypt to reach Alpha 1.',
      },
    };
  },
};
