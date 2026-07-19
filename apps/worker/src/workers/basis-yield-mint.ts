import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type Signature,
} from "@solana/kit";

import { decodeStrategySecret } from "./basis-yield-operator.js";

const USDC_DECIMALS = 6;

export async function ensureStrategyPayoutBalance({
  rpc,
  owner,
  mint,
  token,
  currentBalanceRaw,
  requiredBalanceRaw,
}: {
  readonly rpc: ReturnType<typeof createSolanaRpc>;
  readonly owner: Address;
  readonly mint: Address;
  readonly token: Address;
  readonly currentBalanceRaw: bigint;
  readonly requiredBalanceRaw: bigint;
}): Promise<bigint> {
  if (
    process.env.BASIS_OPERATOR_AUTO_FUND_MOCK_USDC !== "true" ||
    currentBalanceRaw >= requiredBalanceRaw
  ) {
    return currentBalanceRaw;
  }
  const secret = process.env.BASIS_VAULT_MINT_AUTHORITY_SECRET?.trim();
  if (!secret) return currentBalanceRaw;
  const signer = await createKeyPairSignerFromBytes(
    decodeStrategySecret(secret),
  );
  const expected = process.env.BASIS_VAULT_MINT_AUTHORITY?.trim();
  if (expected && signer.address !== address(expected)) {
    throw new Error("Basis mint authority does not match configuration.");
  }
  const [expectedToken] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  if (expectedToken !== token) {
    throw new Error("Strategy payout token account is not the canonical ATA.");
  }
  const deltaRaw = requiredBalanceRaw - currentBalanceRaw;
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const instructions: Instruction[] = [
    getCreateAssociatedTokenIdempotentInstruction({
      payer: signer,
      ata: token,
      owner,
      mint,
    }),
    getMintToCheckedInstruction({
      mint,
      token,
      mintAuthority: signer,
      amount: deltaRaw,
      decimals: USDC_DECIMALS,
    }),
  ];
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (value) => setTransactionMessageFeePayer(signer.address, value),
    (value) =>
      setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, value),
    (value) => appendTransactionMessageInstructions(instructions, value),
  );
  const transaction = await signTransactionMessageWithSigners(message);
  const signature = await rpc
    .sendTransaction(getBase64EncodedWireTransaction(transaction), {
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })
    .send();
  await waitForConfirmation(rpc, signature);
  return requiredBalanceRaw;
}

async function waitForConfirmation(
  rpc: ReturnType<typeof createSolanaRpc>,
  signature: Signature,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { value } = await rpc
      .getSignatureStatuses([signature], { searchTransactionHistory: true })
      .send();
    const status = value[0];
    if (status?.err) throw new Error("Basis payout mint failed.");
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Basis payout mint confirmation timed out.");
}
