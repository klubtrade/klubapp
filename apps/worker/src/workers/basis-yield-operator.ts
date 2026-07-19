/* eslint-disable no-console */

import { BulkClient } from "@klub/api-client";
import { basisOperatorStates, basisYieldCredits, type Db } from "@klub/db";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  partiallySignTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
  type Signature,
} from "@solana/kit";
import bs58 from "bs58";
import { eq, sql } from "drizzle-orm";

import { loadBasisProfitSource } from "./basis-profit-source.js";
import { ensureStrategyPayoutBalance } from "./basis-yield-mint.js";

const USDC_SCALE = 1_000_000n;
const CREDIT_YIELD_DISCRIMINATOR = 7;

export interface BasisOperatorSummary {
  readonly sourceNetPnlUsdc: number;
  readonly availableProfitUsdc: number;
  readonly creditedUsdc: number;
  readonly positionsCredited: number;
  readonly status: "idle" | "credited";
}

export function startBasisYieldOperator({
  db,
  intervalMs = 60 * 60 * 1_000,
  logger = console,
}: {
  readonly db: Db;
  readonly intervalMs?: number;
  readonly logger?: Pick<Console, "error" | "log">;
}) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runBasisYieldOperatorOnce({ db });
      logger.log(`[basis-operator] ${JSON.stringify(result)}`);
    } catch (error) {
      logger.error("[basis-operator] settlement failed", error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return { close: () => clearInterval(timer) };
}

export async function runBasisYieldOperatorOnce({
  db,
}: {
  readonly db: Db;
}): Promise<BasisOperatorSummary> {
  const config = operatorConfig();
  const bulk = new BulkClient({ baseUrl: config.bulkApiUrl });
  const profit = await loadBasisProfitSource(bulk, config.sourceAccount);
  const sourcePnlRaw = toRaw(Math.max(0, profit.netPnlUsd));
  const [state] = await db
    .select()
    .from(basisOperatorStates)
    .where(eq(basisOperatorStates.sourceAccount, config.sourceAccount))
    .limit(1);
  const creditedBefore = state?.creditedYieldRaw ?? 0n;
  const availableProfitRaw = sourcePnlRaw - creditedBefore;
  const sourceTimestamp = profit.sourceTimestamp;

  if (availableProfitRaw <= 0n) {
    await saveOperatorState(db, {
      sourceAccount: config.sourceAccount,
      sourcePnlRaw,
      creditedYieldRaw: creditedBefore,
      sourceTimestamp,
    });
    return summary(profit.netPnlUsd, 0n, 0n, 0, "idle");
  }

  const rpc = createSolanaRpc(config.rpcUrl);
  const signer = await createKeyPairSignerFromBytes(config.strategySecret);
  if (signer.address !== config.strategyAuthority) {
    throw new Error("Basis strategy key does not match configured authority.");
  }
  const [strategyUsdc] = await findAssociatedTokenPda({
    owner: signer.address,
    mint: config.usdcMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const strategyBalanceRaw = await ensureStrategyPayoutBalance({
    rpc,
    owner: signer.address,
    mint: config.usdcMint,
    token: strategyUsdc,
    currentBalanceRaw: await tokenBalance(rpc, strategyUsdc),
    requiredBalanceRaw: minBigInt(
      availableProfitRaw,
      config.maxCreditPerRunRaw,
    ),
  });
  const budgetRaw = minBigInt(
    availableProfitRaw,
    strategyBalanceRaw,
    config.maxCreditPerRunRaw,
  );
  const positions = await loadPositions(config.rpcUrl, config.programId);
  const active = positions.filter((position) => position.principalRaw > 0n);
  const allocations = allocateProRata(active, budgetRaw);
  let creditedRaw = 0n;
  let positionsCredited = 0;

  for (const allocation of allocations) {
    const key = `${config.sourceAccount}:${sourcePnlRaw}:${allocation.position}`;
    const [inserted] = await db
      .insert(basisYieldCredits)
      .values({
        idempotencyKey: key,
        sourceAccount: config.sourceAccount,
        owner: allocation.owner,
        position: allocation.position,
        amountRaw: allocation.amountRaw,
        sourcePnlRaw,
      })
      .onConflictDoNothing()
      .returning({ key: basisYieldCredits.idempotencyKey });
    if (!inserted) continue;

    try {
      const transaction = await buildCreditTransaction({
        rpc,
        signer,
        config,
        strategyUsdc,
        position: address(allocation.position),
        amountRaw: allocation.amountRaw,
      });
      const signature = getSignatureFromTransaction(transaction);
      const wire = getBase64EncodedWireTransaction(transaction);
      await db
        .update(basisYieldCredits)
        .set({
          status: "submitting",
          signature,
          wireTransaction: wire,
          updatedAt: new Date(),
        })
        .where(eq(basisYieldCredits.idempotencyKey, key));
      await rpc
        .sendTransaction(wire, {
          encoding: "base64",
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })
        .send();
      await waitForConfirmation(rpc, signature);
      await db
        .update(basisYieldCredits)
        .set({
          status: "confirmed",
          wireTransaction: null,
          updatedAt: new Date(),
        })
        .where(eq(basisYieldCredits.idempotencyKey, key));
      creditedRaw += allocation.amountRaw;
      positionsCredited += 1;
    } catch (error) {
      await db
        .update(basisYieldCredits)
        .set({
          status: "reconciliation_required",
          error: error instanceof Error ? error.message : String(error),
          updatedAt: new Date(),
        })
        .where(eq(basisYieldCredits.idempotencyKey, key));
      throw error;
    }
  }

  await saveOperatorState(db, {
    sourceAccount: config.sourceAccount,
    sourcePnlRaw,
    creditedYieldRaw: creditedBefore + creditedRaw,
    sourceTimestamp,
  });
  return summary(
    profit.netPnlUsd,
    availableProfitRaw,
    creditedRaw,
    positionsCredited,
    creditedRaw > 0n ? "credited" : "idle",
  );
}

interface PositionRow {
  readonly position: string;
  readonly owner: string;
  readonly principalRaw: bigint;
}

async function loadPositions(
  rpcUrl: string,
  programId: Address,
): Promise<readonly PositionRow[]> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getProgramAccounts",
      params: [programId, { encoding: "base64", commitment: "confirmed" }],
    }),
  });
  if (!response.ok)
    throw new Error(`Solana position query failed (${response.status}).`);
  const payload = (await response.json()) as {
    readonly result?: readonly {
      readonly pubkey: string;
      readonly account: { readonly data: readonly [string, string] };
    }[];
    readonly error?: unknown;
  };
  if (payload.error || !payload.result)
    throw new Error("Solana position query returned an error.");
  return payload.result.flatMap((row) => {
    const data = Buffer.from(row.account.data[0], "base64");
    if (data[0] !== 2 || data.length < 90) return [];
    return [
      {
        position: row.pubkey,
        owner: bs58.encode(data.subarray(1, 33)),
        principalRaw: data.readBigUInt64LE(65),
      },
    ];
  });
}

export function allocateProRata(
  positions: readonly PositionRow[],
  budgetRaw: bigint,
): readonly (PositionRow & { readonly amountRaw: bigint })[] {
  const total = positions.reduce((sum, row) => sum + row.principalRaw, 0n);
  if (total <= 0n || budgetRaw <= 0n) return [];
  return positions.flatMap((position) => {
    const amountRaw = (budgetRaw * position.principalRaw) / total;
    return amountRaw > 0n ? [{ ...position, amountRaw }] : [];
  });
}

async function buildCreditTransaction({
  rpc,
  signer,
  config,
  strategyUsdc,
  position,
  amountRaw,
}: {
  readonly rpc: ReturnType<typeof createSolanaRpc>;
  readonly signer: Awaited<ReturnType<typeof createKeyPairSignerFromBytes>>;
  readonly config: ReturnType<typeof operatorConfig>;
  readonly strategyUsdc: Address;
  readonly position: Address;
  readonly amountRaw: bigint;
}) {
  const instruction: Instruction = {
    programAddress: config.programId,
    accounts: [
      { address: signer.address, role: AccountRole.READONLY_SIGNER },
      { address: config.vault, role: AccountRole.WRITABLE },
      { address: position, role: AccountRole.WRITABLE },
      { address: strategyUsdc, role: AccountRole.WRITABLE },
      { address: config.vaultUsdc, role: AccountRole.WRITABLE },
      { address: config.usdcMint, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: concatBytes(
      Uint8Array.of(CREDIT_YIELD_DISCRIMINATOR),
      encodeU64(amountRaw),
    ),
  };
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (value) => setTransactionMessageFeePayer(signer.address, value),
    (value) => setTransactionMessageLifetimeUsingBlockhash(blockhash, value),
    (value) => appendTransactionMessageInstruction(instruction, value),
  );
  return partiallySignTransaction(
    [signer.keyPair],
    compileTransaction(message),
  );
}

async function tokenBalance(
  rpc: ReturnType<typeof createSolanaRpc>,
  token: Address,
): Promise<bigint> {
  const result = await rpc.getAccountInfo(token, { encoding: "base64" }).send();
  if (!result.value) return 0n;
  const data = Buffer.from(result.value.data[0], "base64");
  return data.readBigUInt64LE(64);
}

async function waitForConfirmation(
  rpc: ReturnType<typeof createSolanaRpc>,
  signature: Signature,
) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { value } = await rpc
      .getSignatureStatuses([signature], { searchTransactionHistory: true })
      .send();
    const status = value[0];
    if (status?.err)
      throw new Error(`Yield credit failed: ${JSON.stringify(status.err)}`);
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Yield credit confirmation timed out.");
}

async function saveOperatorState(
  db: Db,
  input: {
    sourceAccount: string;
    sourcePnlRaw: bigint;
    creditedYieldRaw: bigint;
    sourceTimestamp: bigint;
  },
) {
  await db
    .insert(basisOperatorStates)
    .values({
      sourceAccount: input.sourceAccount,
      highWaterPnlRaw: input.sourcePnlRaw,
      creditedYieldRaw: input.creditedYieldRaw,
      sourceTimestamp: input.sourceTimestamp,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: basisOperatorStates.sourceAccount,
      set: {
        highWaterPnlRaw: sql`GREATEST(${basisOperatorStates.highWaterPnlRaw}, ${input.sourcePnlRaw})`,
        creditedYieldRaw: input.creditedYieldRaw,
        sourceTimestamp: input.sourceTimestamp,
        updatedAt: new Date(),
      },
    });
}

function operatorConfig() {
  const required = (name: string) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required env: ${name}`);
    return value;
  };
  return {
    network: (() => {
      const network = required("BASIS_OPERATOR_NETWORK");
      if (network !== "devnet") {
        throw new Error("The software-key Basis operator is devnet-only.");
      }
      return network;
    })(),
    sourceAccount: required("BASIS_BULK_STRATEGY_ACCOUNT"),
    strategyAuthority: address(required("BASIS_VAULT_STRATEGY_AUTHORITY")),
    strategySecret: decodeStrategySecret(
      required("BASIS_VAULT_STRATEGY_AUTHORITY_SECRET"),
    ),
    rpcUrl: required("SOLANA_RPC_URL"),
    bulkApiUrl:
      process.env.BULK_HTTP_URL ??
      process.env.BULK_API_URL ??
      "https://exchange-api.bulk.trade/api/v1",
    programId: address(required("BASIS_VAULT_PROGRAM_ID")),
    usdcMint: address(required("BASIS_VAULT_USDC_MINT")),
    vault: address(required("BASIS_VAULT_ADDRESS")),
    vaultUsdc: address(required("BASIS_VAULT_USDC_ACCOUNT")),
    maxCreditPerRunRaw: toRaw(
      Number(process.env.BASIS_MAX_CREDIT_PER_RUN_USDC ?? "100"),
    ),
  };
}

export function decodeStrategySecret(value: string): Uint8Array {
  const normalized = value
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2")
    .trim();
  const directJson = parseSecretJson(normalized);
  if (directJson) return directJson;

  const decoded = Buffer.from(normalized.replace(/\s+/g, ""), "base64");
  if (decoded.length === 64) return Uint8Array.from(decoded);

  const encodedJson = parseSecretJson(decoded.toString("utf8"));
  if (encodedJson) return encodedJson;
  throw new Error(
    `Basis strategy secret is invalid (decoded ${decoded.length} bytes; expected 64). Re-paste the base64 value only.`,
  );
}

function parseSecretJson(value: string): Uint8Array | null {
  if (!value.startsWith("[") || !value.endsWith("]")) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 64 ||
      parsed.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)
    ) {
      return null;
    }
    return Uint8Array.from(parsed as number[]);
  } catch {
    return null;
  }
}

function summary(
  netPnl: number,
  availableRaw: bigint,
  creditedRaw: bigint,
  count: number,
  status: "idle" | "credited",
): BasisOperatorSummary {
  return {
    sourceNetPnlUsdc: netPnl,
    availableProfitUsdc: fromRaw(availableRaw),
    creditedUsdc: fromRaw(creditedRaw),
    positionsCredited: count,
    status,
  };
}

const toRaw = (value: number): bigint =>
  BigInt(Math.floor(value * Number(USDC_SCALE)));
const fromRaw = (value: bigint): number => Number(value) / Number(USDC_SCALE);
function minBigInt(...values: readonly bigint[]): bigint {
  return values.reduce((min, value) => (value < min ? value : min));
}
function encodeU64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}
function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
