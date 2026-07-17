export const DEFAULT_PRIVY_APP_ID = 'cmrp21bm502390cjxce8liowo';

export const PRIVY_LOGIN_METHODS = ['email', 'wallet'] as const;

export const PRIVY_SOLANA_WALLETS = [
  'phantom',
  'solflare',
  'backpack',
  'detected_solana_wallets',
  'wallet_connect_qr_solana',
] as const;

export function getPrivyLogoUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/privy-logo.png`;
}
