export function normalizeBulkErrorMessage(message: string, status?: number): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('<!doctype html') ||
    lower.includes('<html') ||
    lower.includes('cloudflare') ||
    lower.includes('bad gateway') ||
    (status !== undefined && status >= 500)
  ) {
    return 'Bulk exchange is temporarily unavailable. Please try again in a few minutes.';
  }
  return message;
}

export function normalizeFaucetErrorMessage(message: string, status?: number): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('<!doctype html') ||
    lower.includes('<html') ||
    lower.includes('bad gateway') ||
    lower.includes('cloudflare') ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return 'Bulk faucet is temporarily unavailable. If this wallet already has test USDC, continue to Funding; otherwise try again in a few minutes.';
  }

  if (
    lower.includes('already') ||
    lower.includes('rate limit') ||
    lower.includes('rate-limit') ||
    lower.includes('too many') ||
    lower.includes('24h') ||
    lower.includes('24 h') ||
    lower.includes('once per')
  ) {
    return 'This wallet has already claimed test USDC recently. Continue to Funding.';
  }

  return message;
}
