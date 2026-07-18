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
  type Signature,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { type NextRequest, NextResponse } from "next/server";

import { getBasisVaultConfig } from "@/lib/basis-vault/config";
import {
  requireLinkedSolanaWallet,
  requirePrivyAuth,
} from "@/lib/server/privy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAUCET_USDC = 1_000;
const USDC_DECIMALS = 6;
const EXPECTED_MINT_AUTHORITY = "HmA31z4YGiH8mB4GqoNDbXgasfASYYoErK3RxMQp475X";
const recentClaims = new Map<string, number>();

export async function POST(request: NextRequest) {
  const auth = await requirePrivyAuth(request);
  if (!auth.ok) return auth.response;
  try {
    const body = (await request.json()) as { owner?: unknown };
    if (typeof body.owner !== "string")
      return error("Connect a Solana wallet first.", 400);
    const owner = address(body.owner);
    const ownershipError = requireLinkedSolanaWallet(auth.principal, owner);
    if (ownershipError) return ownershipError;
    const now = Date.now();
    if (now - (recentClaims.get(owner) ?? 0) < 60_000) {
      return error(
        "Your vault USDC is already being prepared. Try again shortly.",
        429,
      );
    }

    const config = getBasisVaultConfig();
    if (!config.rpcUrl || !config.usdcMint)
      return error("Vault faucet is temporarily unavailable.", 503);
    const secret = process.env.BASIS_VAULT_MINT_AUTHORITY_SECRET;
    if (!secret) return error("Vault faucet is temporarily unavailable.", 503);

    const signer = await createKeyPairSignerFromBytes(decodeSecret(secret));
    if (signer.address !== EXPECTED_MINT_AUTHORITY) {
      throw new Error(
        "Configured Basis mint authority does not match the devnet mint.",
      );
    }

    const rpc = createSolanaRpc(config.rpcUrl);
    const mint = address(config.usdcMint);
    const [ownerAta] = await findAssociatedTokenPda({
      owner,
      mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const currentBalance = await getTokenBalance(rpc, ownerAta);
    if (currentBalance >= FAUCET_USDC) {
      return NextResponse.json({
        status: "funded",
        balance: currentBalance,
        signature: null,
      });
    }

    recentClaims.set(owner, now);
    const amountRaw = BigInt(
      Math.round((FAUCET_USDC - currentBalance) * 10 ** USDC_DECIMALS),
    );
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const instructions = [
      getCreateAssociatedTokenIdempotentInstruction({
        payer: signer,
        ata: ownerAta,
        owner,
        mint,
      }),
      getMintToCheckedInstruction({
        mint,
        token: ownerAta,
        mintAuthority: signer,
        amount: amountRaw,
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

    return NextResponse.json({
      status: "claimed",
      balance: FAUCET_USDC,
      signature,
    });
  } catch (cause) {
    console.error("[basis-faucet] claim failed", cause);
    return error(
      "Vault faucet is temporarily unavailable. Please try again.",
      502,
    );
  }
}

function decodeSecret(value: string): Uint8Array {
  const bytes = Uint8Array.from(Buffer.from(value.trim(), "base64"));
  if (bytes.length !== 64)
    throw new Error("Basis mint authority must be a base64 64-byte keypair.");
  return bytes;
}

async function getTokenBalance(
  rpc: ReturnType<typeof createSolanaRpc>,
  tokenAccount: Address,
): Promise<number> {
  try {
    const { value } = await rpc.getTokenAccountBalance(tokenAccount).send();
    return Number(value.uiAmountString ?? "0");
  } catch {
    return 0;
  }
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
    if (status?.err) throw new Error("Basis faucet transaction failed.");
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Basis faucet confirmation timed out.");
}

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
