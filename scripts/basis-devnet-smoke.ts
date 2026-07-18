import { readFile } from "node:fs/promises";

import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  getBase64EncodedWireTransaction,
  getTransactionDecoder,
  partiallySignTransaction,
  type Signature,
} from "@solana/kit";

import {
  buildBasisDepositTransaction,
  buildBasisWithdrawTransaction,
  getBasisVaultSnapshot,
} from "../apps/web/lib/basis-vault/client";
import { getBasisVaultConfig } from "../apps/web/lib/basis-vault/config";

let signer: Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>;
let rpc: ReturnType<typeof createSolanaRpc>;

async function main(): Promise<void> {
  const keypairPath = process.env.BASIS_E2E_KEYPAIR;
  if (!keypairPath)
    throw new Error("Set BASIS_E2E_KEYPAIR to a devnet keypair.");

  const keypairBytes = Uint8Array.from(
    JSON.parse(await readFile(keypairPath, "utf8")) as number[],
  );
  signer = await createKeyPairSignerFromBytes(keypairBytes);
  const config = getBasisVaultConfig();
  if (!config.rpcUrl) throw new Error("Basis RPC is not configured.");
  rpc = createSolanaRpc(config.rpcUrl);

  const before = await getBasisVaultSnapshot(signer.address);
  if (before.ownerUsdcBalance < 100) {
    throw new Error("Smoke wallet needs at least 100 vault mock USDC.");
  }

  const deposit = await buildBasisDepositTransaction({
    ownerBase58: signer.address,
    amountUsdc: 100,
    positionExists: before.position.exists,
  });
  await signSendConfirm(deposit);

  const afterDeposit = await getBasisVaultSnapshot(signer.address);
  assertClose(
    afterDeposit.position.depositedUsdc,
    before.position.depositedUsdc + 100,
    "deposit",
  );

  const withdrawal = await buildBasisWithdrawTransaction({
    ownerBase58: signer.address,
    amountUsdc: 100,
  });
  await signSendConfirm(withdrawal);

  const afterWithdrawal = await getBasisVaultSnapshot(signer.address);
  assertClose(
    afterWithdrawal.position.depositedUsdc,
    before.position.depositedUsdc,
    "withdrawal",
  );

  console.log(
    JSON.stringify({
      owner: signer.address,
      depositVerified: true,
      withdrawalVerified: true,
      finalWalletUsdc: afterWithdrawal.ownerUsdcBalance,
      finalDepositedUsdc: afterWithdrawal.position.depositedUsdc,
    }),
  );
}

async function signSendConfirm(transactionBytes: Uint8Array): Promise<void> {
  const transaction = getTransactionDecoder().decode(transactionBytes);
  const signed = await partiallySignTransaction([signer.keyPair], transaction);
  const signature = await rpc
    .sendTransaction(getBase64EncodedWireTransaction(signed), {
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })
    .send();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { value } = await rpc
      .getSignatureStatuses([signature as Signature], {
        searchTransactionHistory: true,
      })
      .send();
    const status = value[0];
    if (status?.err) {
      throw new Error(
        `Devnet transaction failed: ${JSON.stringify(status.err)}`,
      );
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Devnet transaction confirmation timed out.");
}

function assertClose(actual: number, expected: number, step: string): void {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(
      `${step} mismatch: expected ${expected}, received ${actual}`,
    );
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
