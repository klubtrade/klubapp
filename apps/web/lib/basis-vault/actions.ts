export type BasisVaultAction = "deposit" | "withdraw";

export function maxWithdrawAmount(withdrawableUsdc: number): number {
  if (!Number.isFinite(withdrawableUsdc) || withdrawableUsdc <= 0) return 0;
  return Math.floor(withdrawableUsdc * 1_000_000) / 1_000_000;
}

export function isValidWithdrawAmount(
  amountUsdc: number,
  withdrawableUsdc: number,
): boolean {
  return (
    Number.isFinite(amountUsdc) &&
    amountUsdc > 0 &&
    amountUsdc <= maxWithdrawAmount(withdrawableUsdc)
  );
}

export function initialAmountForAction({
  action,
  depositAmount,
  withdrawableUsdc,
}: {
  readonly action: BasisVaultAction;
  readonly depositAmount: number;
  readonly withdrawableUsdc: number;
}): number {
  return action === "withdraw"
    ? maxWithdrawAmount(withdrawableUsdc)
    : depositAmount;
}
