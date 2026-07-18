import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createSolanaRpc,
  createTransactionMessage,
  getAddressEncoder,
  getProgramDerivedAddress,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
} from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";

import { getBasisVaultConfig } from "./config";

const SYSTEM_PROGRAM_ADDRESS = address("11111111111111111111111111111111");
const BASIS_VAULT_DECIMALS = 6;
const BASIS_VAULT_DISCRIMINATORS = {
  initPosition: 2,
  requestDeposit: 3,
  requestWithdraw: 4,
} as const;

export interface BasisVaultAddresses {
  readonly programId: Address;
  readonly admin: Address;
  readonly usdcMint: Address;
  readonly vault: Address;
  readonly vaultUsdc: Address;
  readonly adminFeeTokenAccount: Address;
  readonly owner: Address;
  readonly ownerUsdc: Address;
  readonly position: Address;
}

export interface BasisUserPosition {
  readonly exists: boolean;
  readonly depositedUsdc: number;
  readonly claimableYieldUsdc: number;
  readonly withdrawableUsdc: number;
  readonly requestCount: number;
}

export interface BasisVaultSnapshot {
  readonly vaultReady: boolean;
  readonly ownerUsdcBalance: number;
  readonly vaultDepositedUsdc: number;
  readonly vaultClaimableYieldUsdc: number;
  readonly position: BasisUserPosition;
  readonly addresses: BasisVaultAddresses;
}

export async function getBasisVaultSnapshot(
  ownerBase58: string,
): Promise<BasisVaultSnapshot> {
  const config = requireVaultConfig();
  const rpc = createSolanaRpc(config.rpcUrl);
  const addresses = await deriveBasisVaultAddresses(ownerBase58);

  const [vaultAccount, positionAccount, ownerUsdcAccount] = await Promise.all([
    rpc.getAccountInfo(addresses.vault, { encoding: "base64" }).send(),
    rpc.getAccountInfo(addresses.position, { encoding: "base64" }).send(),
    rpc.getAccountInfo(addresses.ownerUsdc, { encoding: "base64" }).send(),
  ]);

  const vaultData = accountDataBytes(vaultAccount.value?.data);
  const positionData = accountDataBytes(positionAccount.value?.data);
  const ownerUsdcData = accountDataBytes(ownerUsdcAccount.value?.data);
  const vaultState = vaultData ? decodeVault(vaultData) : null;
  const positionState = positionData ? decodePosition(positionData) : null;

  return {
    vaultReady: Boolean(vaultState),
    ownerUsdcBalance: ownerUsdcData ? rawToUsdc(readU64(ownerUsdcData, 64)) : 0,
    vaultDepositedUsdc: vaultState ? rawToUsdc(vaultState.totalDeposited) : 0,
    vaultClaimableYieldUsdc: vaultState
      ? rawToUsdc(vaultState.totalClaimableYield)
      : 0,
    position: {
      exists: Boolean(positionState),
      depositedUsdc: positionState ? rawToUsdc(positionState.deposited) : 0,
      claimableYieldUsdc: positionState
        ? rawToUsdc(positionState.claimableYield)
        : 0,
      withdrawableUsdc: positionState
        ? rawToUsdc(positionState.deposited + positionState.claimableYield)
        : 0,
      requestCount: positionState ? Number(positionState.requestCount) : 0,
    },
    addresses,
  };
}

export async function buildBasisDepositTransaction({
  ownerBase58,
  amountUsdc,
  positionExists,
}: {
  readonly ownerBase58: string;
  readonly amountUsdc: number;
  readonly positionExists: boolean;
}): Promise<Uint8Array> {
  const config = requireVaultConfig();
  const rpc = createSolanaRpc(config.rpcUrl);
  const addresses = await deriveBasisVaultAddresses(ownerBase58);
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const amountRaw = usdcToRaw(amountUsdc);

  const instructions: Instruction[] = [createOwnerAtaInstruction(addresses)];

  if (!positionExists) {
    instructions.push(initPositionInstruction(addresses));
  }
  instructions.push(requestDepositInstruction(addresses, amountRaw));

  return buildUnsignedTransaction({
    feePayer: addresses.owner,
    latestBlockhash,
    instructions,
  });
}

export async function buildBasisWithdrawTransaction({
  ownerBase58,
  amountUsdc,
}: {
  readonly ownerBase58: string;
  readonly amountUsdc: number;
}): Promise<Uint8Array> {
  const config = requireVaultConfig();
  const rpc = createSolanaRpc(config.rpcUrl);
  const addresses = await deriveBasisVaultAddresses(ownerBase58);
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const amountRaw = usdcToRaw(amountUsdc);

  return buildUnsignedTransaction({
    feePayer: addresses.owner,
    latestBlockhash,
    instructions: [
      createOwnerAtaInstruction(addresses),
      requestWithdrawInstruction(addresses, amountRaw),
    ],
  });
}

export async function deriveBasisVaultAddresses(
  ownerBase58: string,
): Promise<BasisVaultAddresses> {
  const config = requireVaultConfig();
  const programId = address(config.programId);
  const admin = address(config.admin);
  const usdcMint = address(config.usdcMint);
  const owner = address(ownerBase58);
  const vault = address(config.vaultAddress);
  const vaultUsdc = address(config.vaultUsdcAccount);
  const adminFeeTokenAccount = address(config.adminFeeTokenAccount);
  const [derivedVault] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: ["basis_vault", getAddressEncoder().encode(admin)],
  });
  if (derivedVault !== vault) {
    throw new Error("Basis vault address does not match admin/program PDA.");
  }
  const [position] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds: [
      "basis_position",
      getAddressEncoder().encode(owner),
      getAddressEncoder().encode(vault),
    ],
  });
  const [ownerUsdc] = await findAssociatedTokenPda({
    owner,
    mint: usdcMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  return {
    programId,
    admin,
    usdcMint,
    vault,
    vaultUsdc,
    adminFeeTokenAccount,
    owner,
    ownerUsdc,
    position,
  };
}

export function formatUsdc(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function requireVaultConfig(): {
  readonly rpcUrl: string;
  readonly programId: string;
  readonly admin: string;
  readonly usdcMint: string;
  readonly vaultAddress: string;
  readonly vaultUsdcAccount: string;
  readonly adminFeeTokenAccount: string;
} {
  const config = getBasisVaultConfig();
  if (
    !config.ready ||
    !config.rpcUrl ||
    !config.programId ||
    !config.admin ||
    !config.usdcMint ||
    !config.vaultAddress ||
    !config.vaultUsdcAccount ||
    !config.adminFeeTokenAccount
  ) {
    throw new Error(
      `Basis vault setup incomplete: ${config.missing.join(", ")}`,
    );
  }
  return {
    rpcUrl: config.rpcUrl,
    programId: config.programId,
    admin: config.admin,
    usdcMint: config.usdcMint,
    vaultAddress: config.vaultAddress,
    vaultUsdcAccount: config.vaultUsdcAccount,
    adminFeeTokenAccount: config.adminFeeTokenAccount,
  };
}

function createOwnerAtaInstruction(
  addresses: BasisVaultAddresses,
): Instruction {
  return {
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: addresses.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: addresses.ownerUsdc, role: AccountRole.WRITABLE },
      { address: addresses.owner, role: AccountRole.READONLY },
      { address: addresses.usdcMint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: Uint8Array.of(1),
  };
}

function initPositionInstruction(addresses: BasisVaultAddresses): Instruction {
  return {
    programAddress: addresses.programId,
    accounts: [
      { address: addresses.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: addresses.vault, role: AccountRole.READONLY },
      { address: addresses.position, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: Uint8Array.of(BASIS_VAULT_DISCRIMINATORS.initPosition),
  };
}

function requestDepositInstruction(
  addresses: BasisVaultAddresses,
  amountRaw: bigint,
): Instruction {
  return {
    programAddress: addresses.programId,
    accounts: [
      { address: addresses.owner, role: AccountRole.READONLY_SIGNER },
      { address: addresses.vault, role: AccountRole.WRITABLE },
      { address: addresses.position, role: AccountRole.WRITABLE },
      { address: addresses.ownerUsdc, role: AccountRole.WRITABLE },
      { address: addresses.vaultUsdc, role: AccountRole.WRITABLE },
      { address: addresses.usdcMint, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: concatBytes(
      Uint8Array.of(BASIS_VAULT_DISCRIMINATORS.requestDeposit),
      encodeU64(amountRaw),
    ),
  };
}

function requestWithdrawInstruction(
  addresses: BasisVaultAddresses,
  amountRaw: bigint,
): Instruction {
  return {
    programAddress: addresses.programId,
    accounts: [
      { address: addresses.owner, role: AccountRole.READONLY_SIGNER },
      { address: addresses.admin, role: AccountRole.READONLY },
      { address: addresses.vault, role: AccountRole.WRITABLE },
      { address: addresses.position, role: AccountRole.WRITABLE },
      { address: addresses.vaultUsdc, role: AccountRole.WRITABLE },
      { address: addresses.ownerUsdc, role: AccountRole.WRITABLE },
      { address: addresses.adminFeeTokenAccount, role: AccountRole.WRITABLE },
      { address: addresses.usdcMint, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data: concatBytes(
      Uint8Array.of(BASIS_VAULT_DISCRIMINATORS.requestWithdraw),
      encodeU64(amountRaw),
    ),
  };
}

function buildUnsignedTransaction({
  feePayer,
  latestBlockhash,
  instructions,
}: {
  readonly feePayer: Address;
  readonly latestBlockhash: {
    readonly blockhash: Blockhash;
    readonly lastValidBlockHeight: bigint;
  };
  readonly instructions: readonly Instruction[];
}): Uint8Array {
  const message = pipe(
    createTransactionMessage({ version: "legacy" }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const transaction = compileTransaction(message);
  return Uint8Array.from(getTransactionEncoder().encode(transaction));
}

function accountDataBytes(
  data: readonly [string, string] | string | null | undefined,
): Uint8Array | null {
  if (!data) return null;
  const base64 = Array.isArray(data) ? data[0] : data;
  return base64ToBytes(base64);
}

function decodeVault(data: Uint8Array): {
  readonly totalDeposited: bigint;
  readonly totalClaimableYield: bigint;
} {
  if (data[0] !== 1) throw new Error("Invalid Basis vault account.");
  return {
    totalDeposited: readU64(data, 149),
    totalClaimableYield: readU64(data, 173),
  };
}

function decodePosition(data: Uint8Array): {
  readonly deposited: bigint;
  readonly claimableYield: bigint;
  readonly requestCount: bigint;
} {
  if (data[0] !== 2) throw new Error("Invalid Basis position account.");
  return {
    deposited: readU64(data, 81),
    claimableYield: readU64(data, 89),
    requestCount: readU64(data, 97),
  };
}

function usdcToRaw(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Enter a valid USDC amount.");
  }
  return BigInt(Math.round(value * 10 ** BASIS_VAULT_DECIMALS));
}

function rawToUsdc(value: bigint): number {
  return Number(value) / 10 ** BASIS_VAULT_DECIMALS;
}

function readU64(data: Uint8Array, offset: number): bigint {
  return new DataView(
    data.buffer,
    data.byteOffset,
    data.byteLength,
  ).getBigUint64(offset, true);
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

function base64ToBytes(base64: string): Uint8Array {
  if (typeof window === "undefined") {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  }
  const binary = window.atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
