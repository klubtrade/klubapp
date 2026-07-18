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

// Public devnet addresses. These are on-chain identifiers, not secrets. Keeping
// working defaults here means a missed Vercel variable cannot turn a deployed
// testnet product into a developer setup screen. Every value remains
// overridable for staging and the eventual mainnet migration.
const DEVNET_DEFAULTS = {
  programId: "AZWFCfPmynzsrHevyUWgHpMDN5uJLAyGKRbAeUHe8scx",
  admin: "HssCPh192ZHgPu3zV3nFDDM4v6AM28fGV3tuJGy1K8zj",
  strategyAuthority: "9pQCDtJxfHDaJzyGsgNyDxakivx1vuD3XQPFYCtiajgh",
  usdcMint: "724V1jFMAqpYNybSof6FLe5BENAuz3HXbDYD2mBDrai6",
  vaultAddress: "BpjvJVuG9ki5DzVp1x6U7FwWS6HTrRccYAHuaFuZoiw5",
  vaultUsdcAccount: "8gt84p9Lubbx83qQkxSVuobayduBEhLvspwxz1pcS6i2",
  adminFeeTokenAccount: "FXJW2kcBHk9bWqSgb5Q6oruZBfAfe1CBBCLdxrFTVvuh",
  rpcUrl: "https://api.devnet.solana.com",
} as const;

export function getBasisVaultConfig(): BasisVaultConfig {
  const programId = readEnv(
    process.env.NEXT_PUBLIC_BASIS_VAULT_PROGRAM_ID,
    DEVNET_DEFAULTS.programId,
  );
  const admin = readEnv(
    process.env.NEXT_PUBLIC_BASIS_VAULT_ADMIN,
    DEVNET_DEFAULTS.admin,
  );
  const strategyAuthority = readEnv(
    process.env.NEXT_PUBLIC_BASIS_VAULT_STRATEGY_AUTHORITY,
    DEVNET_DEFAULTS.strategyAuthority,
  );
  const usdcMint = readEnv(
    process.env.NEXT_PUBLIC_BASIS_VAULT_USDC_MINT,
    DEVNET_DEFAULTS.usdcMint,
  );
  const vaultAddress = readEnv(
    process.env.NEXT_PUBLIC_BASIS_VAULT_ADDRESS,
    DEVNET_DEFAULTS.vaultAddress,
  );
  const vaultUsdcAccount = readEnv(
    process.env.NEXT_PUBLIC_BASIS_VAULT_USDC_ACCOUNT,
    DEVNET_DEFAULTS.vaultUsdcAccount,
  );
  const adminFeeTokenAccount = readEnv(
    process.env.NEXT_PUBLIC_BASIS_VAULT_ADMIN_FEE_TOKEN_ACCOUNT,
    DEVNET_DEFAULTS.adminFeeTokenAccount,
  );
  const rpcUrl = readEnv(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
    DEVNET_DEFAULTS.rpcUrl,
  );

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
      process.env.NEXT_PUBLIC_BASIS_VAULT_MIN_DEPOSIT_USDC,
      BASIS_VAULT_DEFAULT_MIN_DEPOSIT_USDC,
    ),
    managementFeeBps: readNumberEnv(
      process.env.NEXT_PUBLIC_BASIS_VAULT_MANAGEMENT_FEE_BPS,
      BASIS_VAULT_DEFAULT_MANAGEMENT_FEE_BPS,
    ),
    performanceFeeBps: readNumberEnv(
      process.env.NEXT_PUBLIC_BASIS_VAULT_PERFORMANCE_FEE_BPS,
      BASIS_VAULT_DEFAULT_PERFORMANCE_FEE_BPS,
    ),
    rpcUrl,
  };
}

export function formatBasisVaultFee(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

function readEnv(
  value: string | undefined,
  fallback: string | null = null,
): string | null {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function readNumberEnv(value: string | undefined, fallback: number): number {
  const normalized = readEnv(value);
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}
