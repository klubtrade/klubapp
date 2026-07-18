export interface BasisVaultConfig {
  readonly ready: boolean;
  readonly missing: readonly string[];
  readonly programId: string | null;
  readonly admin: string | null;
  readonly strategyAuthority: string | null;
  readonly usdcMint: string | null;
  readonly vaultAddress: string | null;
  readonly vaultUsdcAccount: string | null;
  readonly adminFeeTokenAccount: string | null;
  readonly minDepositUsdc: number;
  readonly managementFeeBps: number;
  readonly performanceFeeBps: number;
  readonly rpcUrl: string | null;
}

export const BASIS_VAULT_DEFAULT_MIN_DEPOSIT_USDC = 100;
export const BASIS_VAULT_DEFAULT_MANAGEMENT_FEE_BPS = 0;
export const BASIS_VAULT_DEFAULT_PERFORMANCE_FEE_BPS = 10;

export function getBasisVaultConfig(): BasisVaultConfig {
  const programId = readEnv("NEXT_PUBLIC_BASIS_VAULT_PROGRAM_ID");
  const admin = readEnv("NEXT_PUBLIC_BASIS_VAULT_ADMIN");
  const strategyAuthority = readEnv(
    "NEXT_PUBLIC_BASIS_VAULT_STRATEGY_AUTHORITY",
  );
  const usdcMint = readEnv("NEXT_PUBLIC_BASIS_VAULT_USDC_MINT");
  const vaultAddress = readEnv("NEXT_PUBLIC_BASIS_VAULT_ADDRESS");
  const vaultUsdcAccount = readEnv("NEXT_PUBLIC_BASIS_VAULT_USDC_ACCOUNT");
  const adminFeeTokenAccount = readEnv(
    "NEXT_PUBLIC_BASIS_VAULT_ADMIN_FEE_TOKEN_ACCOUNT",
  );
  const rpcUrl = readEnv("NEXT_PUBLIC_SOLANA_RPC_URL");

  const required: readonly (readonly [string, string | null])[] = [
    ["NEXT_PUBLIC_BASIS_VAULT_PROGRAM_ID", programId],
    ["NEXT_PUBLIC_BASIS_VAULT_ADMIN", admin],
    ["NEXT_PUBLIC_BASIS_VAULT_STRATEGY_AUTHORITY", strategyAuthority],
    ["NEXT_PUBLIC_BASIS_VAULT_USDC_MINT", usdcMint],
    ["NEXT_PUBLIC_BASIS_VAULT_ADDRESS", vaultAddress],
    ["NEXT_PUBLIC_BASIS_VAULT_USDC_ACCOUNT", vaultUsdcAccount],
    ["NEXT_PUBLIC_BASIS_VAULT_ADMIN_FEE_TOKEN_ACCOUNT", adminFeeTokenAccount],
    ["NEXT_PUBLIC_SOLANA_RPC_URL", rpcUrl],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  return {
    ready: missing.length === 0,
    missing,
    programId,
    admin,
    strategyAuthority,
    usdcMint,
    vaultAddress,
    vaultUsdcAccount,
    adminFeeTokenAccount,
    minDepositUsdc: readNumberEnv(
      "NEXT_PUBLIC_BASIS_VAULT_MIN_DEPOSIT_USDC",
      BASIS_VAULT_DEFAULT_MIN_DEPOSIT_USDC,
    ),
    managementFeeBps: readNumberEnv(
      "NEXT_PUBLIC_BASIS_VAULT_MANAGEMENT_FEE_BPS",
      BASIS_VAULT_DEFAULT_MANAGEMENT_FEE_BPS,
    ),
    performanceFeeBps: readNumberEnv(
      "NEXT_PUBLIC_BASIS_VAULT_PERFORMANCE_FEE_BPS",
      BASIS_VAULT_DEFAULT_PERFORMANCE_FEE_BPS,
    ),
    rpcUrl,
  };
}

export function formatBasisVaultFee(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

function readEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = readEnv(name);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
