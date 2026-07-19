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
  type Instruction,
  type Signature,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import { type NextRequest, NextResponse } from "next/server";

import { getBasisVaultConfig } from "@/lib/basis-vault/config";
import {
  requireLinkedSolanaWallet,
  requirePrivyAuth,
} from "@/lib/server/privy-auth";
import {
  finishBasisFaucetClaim,
  hasBasisFaucetClaim,
  reserveBasisFaucetClaim,
} from "@/lib/server/basis-faucet-claims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FAUCET_USDC = 1_000;
const USDC_DECIMALS = 6;
// The first deposit creates a user-position PDA. Keep enough SOL in the
// connected wallet for its rent and transaction fees so mock USDC is usable.
const MIN_OWNER_SOL_LAMPORTS = 3_000_000n;
const EXPECTED_MINT_AUTHORITY = "HmA31z4YGiH8mB4GqoNDbXgasfASYYoErK3RxMQp475X";

export async function GET(request: NextRequest) {
  const auth = await requirePrivyAuth(request);
  if (!auth.ok) return auth.response;
  try {
    const ownerValue = request.nextUrl.searchParams.get("owner");
    if (!ownerValue) return error("Connect a Solana wallet first.", 400);
    const owner = address(ownerValue);
    const ownershipError = requireLinkedSolanaWallet(auth.principal, owner);
    if (ownershipError) return ownershipError;
    const config = getBasisVaultConfig();
    if (!config.rpcUrl || !config.usdcMint)
      return error("Vault faucet is temporarily unavailable.", 503);
    const mint = address(config.usdcMint);
    const [ownerAta] = await findAssociatedTokenPda({
      owner,
      mint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });
    const rpc = createSolanaRpc(config.rpcUrl);
    const [{ value: tokenAccount }, { value: ownerLamports }, recorded] =
      await Promise.all([
        rpc.getAccountInfo(ownerAta, { encoding: "base64" }).send(),
        rpc.getBalance(owner).send(),
        hasBasisFaucetClaim(owner, mint),
      ]);
    return NextResponse.json({
      eligible:
        (!tokenAccount && !recorded) || ownerLamports < MIN_OWNER_SOL_LAMPORTS,
      gasReady: ownerLamports >= MIN_OWNER_SOL_LAMPORTS,
      alreadyClaimed: Boolean(tokenAccount || recorded),
    });
  } catch (cause) {
    console.error("[basis-faucet] status failed", cause);
    return error("Vault faucet status is temporarily unavailable.", 503);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePrivyAuth(request);
  if (!auth.ok) return auth.response;
  let reservedClaim: { readonly wallet: string; readonly mint: string } | null =
    null;
  try {
    const body = (await request.json()) as { owner?: unknown };
    if (typeof body.owner !== "string")
      return error("Connect a Solana wallet first.", 400);
    const owner = address(body.owner);
    const ownershipError = requireLinkedSolanaWallet(auth.principal, owner);
    if (ownershipError) return ownershipError;
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
    const [{ value: tokenAccount }, { value: ownerLamports }] =
      await Promise.all([
        rpc.getAccountInfo(ownerAta, { encoding: "base64" }).send(),
        rpc.getBalance(owner).send(),
      ]);
    const recorded = await hasBasisFaucetClaim(owner, mint);
    const alreadyClaimed = Boolean(tokenAccount || recorded);
    const needsSol = ownerLamports < MIN_OWNER_SOL_LAMPORTS;
    if (alreadyClaimed && !needsSol) {
      return NextResponse.json(
        {
          error: "Vault USDC was already claimed for this wallet.",
          alreadyClaimed: true,
        },
        { status: 409 },
      );
    }
    const amountBaseUnits = String(FAUCET_USDC * 10 ** USDC_DECIMALS);
    if (
      !alreadyClaimed &&
      !(await reserveBasisFaucetClaim(owner, mint, amountBaseUnits))
    ) {
      return NextResponse.json(
        {
          error: "Vault USDC was already claimed for this wallet.",
          alreadyClaimed: true,
        },
        { status: 409 },
      );
    }
    if (!alreadyClaimed) reservedClaim = { wallet: owner, mint };
    const currentBalance = 0;
    const needsUsdc = !alreadyClaimed && currentBalance < FAUCET_USDC;
    if (!needsUsdc && !needsSol) {
      return NextResponse.json({
        status: "funded",
        balance: currentBalance,
        gasReady: true,
        signature: null,
      });
    }

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
    const instructions: Instruction[] = [];
    if (needsSol) {
      instructions.push(
        getTransferSolInstruction({
          source: signer,
          destination: owner,
          amount: MIN_OWNER_SOL_LAMPORTS - ownerLamports,
        }),
      );
    }
    if (needsUsdc) {
      const amountRaw = BigInt(
        Math.round((FAUCET_USDC - currentBalance) * 10 ** USDC_DECIMALS),
      );
      instructions.push(
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
      );
    }
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
    if (!alreadyClaimed) {
      await finishBasisFaucetClaim({
        wallet: owner,
        mint,
        status: "confirmed",
        signature,
      });
    }

    return NextResponse.json({
      status: needsUsdc ? "claimed" : "gas_ready",
      balance: FAUCET_USDC,
      gasReady: true,
      signature,
    });
  } catch (cause) {
    console.error("[basis-faucet] claim failed", cause);
    if (reservedClaim) {
      await finishBasisFaucetClaim({
        ...reservedClaim,
        status: "failed",
      }).catch((error) =>
        console.error("[basis-faucet] failed to release claim", error),
      );
    }
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
