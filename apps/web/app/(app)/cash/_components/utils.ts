// =============================================================================
// Helpers
// =============================================================================

export function formatUsd(n: number): string {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

export function short(pk: string): string {
  return pk.length <= 10 ? pk : `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}
