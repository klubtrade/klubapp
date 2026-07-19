import { createDbClient, faucetClaims } from "@klub/db";
import { and, eq } from "drizzle-orm";

const FAUCET = "basis-devnet";
const LIFETIME_WINDOW = new Date(0);

function db() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Basis faucet database unavailable.");
  return createDbClient({ connectionString, maxConnections: 2 });
}

export async function hasBasisFaucetClaim(wallet: string, mint: string) {
  const [claim] = await db()
    .select({ status: faucetClaims.status })
    .from(faucetClaims)
    .where(
      and(
        eq(faucetClaims.faucet, FAUCET),
        eq(faucetClaims.wallet, wallet),
        eq(faucetClaims.mint, mint),
      ),
    )
    .limit(1);
  return claim?.status === "confirmed" || claim?.status === "processing";
}

export async function reserveBasisFaucetClaim(
  wallet: string,
  mint: string,
  amountBaseUnits: string,
): Promise<boolean> {
  const client = db();
  const [inserted] = await client
    .insert(faucetClaims)
    .values({
      faucet: FAUCET,
      wallet,
      mint,
      amountBaseUnits,
      windowStartedAt: LIFETIME_WINDOW,
      status: "processing",
    })
    .onConflictDoNothing()
    .returning({ id: faucetClaims.id });
  if (inserted) return true;

  const [retried] = await client
    .update(faucetClaims)
    .set({ status: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(faucetClaims.faucet, FAUCET),
        eq(faucetClaims.wallet, wallet),
        eq(faucetClaims.mint, mint),
        eq(faucetClaims.status, "failed"),
      ),
    )
    .returning({ id: faucetClaims.id });
  return Boolean(retried);
}

export async function finishBasisFaucetClaim({
  wallet,
  mint,
  status,
  signature,
}: {
  readonly wallet: string;
  readonly mint: string;
  readonly status: "confirmed" | "failed";
  readonly signature?: string;
}) {
  await db()
    .update(faucetClaims)
    .set({
      status,
      transactionSignature: signature ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(faucetClaims.faucet, FAUCET),
        eq(faucetClaims.wallet, wallet),
        eq(faucetClaims.mint, mint),
      ),
    );
}
