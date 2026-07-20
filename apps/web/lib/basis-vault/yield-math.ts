const HOURS_PER_YEAR = 365 * 24;

export function estimateFundingCarryUsdc({
  annualSpreadPct,
  hours,
  deployedNotionalUsd,
}: {
  readonly annualSpreadPct: number;
  readonly hours: number;
  readonly deployedNotionalUsd: number;
}): number {
  if (
    !Number.isFinite(annualSpreadPct) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(deployedNotionalUsd) ||
    hours <= 0 ||
    deployedNotionalUsd <= 0
  ) {
    return 0;
  }

  return (
    deployedNotionalUsd * (annualSpreadPct / 100) * (hours / HOURS_PER_YEAR)
  );
}

export function annualizedVaultAprPct({
  earnedUsdc,
  depositedUsdc,
  hours,
}: {
  readonly earnedUsdc: number;
  readonly depositedUsdc: number;
  readonly hours: number;
}): number {
  if (
    !Number.isFinite(earnedUsdc) ||
    !Number.isFinite(depositedUsdc) ||
    !Number.isFinite(hours) ||
    earnedUsdc <= 0 ||
    depositedUsdc <= 0 ||
    hours <= 0
  ) {
    return 0;
  }

  return (earnedUsdc / depositedUsdc) * (HOURS_PER_YEAR / hours) * 100;
}
