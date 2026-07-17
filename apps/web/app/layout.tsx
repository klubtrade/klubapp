import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

import { Providers } from './providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

/**
 * Viewport. Critical for mobile rendering — without `width=device-width`
 * iOS Safari renders at 980px and scales down, so every page looks like
 * a tiny desktop site. `maximumScale: 1` prevents the iOS double-tap
 * zoom-on-input bug for our trading inputs (no, you don't want the
 * page to zoom when the user taps the size field). `themeColor` paints
 * the iOS/Android browser chrome to match our deep-black bg so the app
 * looks installed even in a regular tab.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#06080F',
};

export const metadata: Metadata = {
  title: 'Klub: retail gateway to Bulk haven',
  description:
    'A clean retail trading gateway for Bulk Exchange: simple funding, safer order flow, copy trading, portfolio health, and Pro tools when you need them.',
  metadataBase: new URL('https://klubapp-web.vercel.app'),
  applicationName: 'Klub',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: 'Klub: retail gateway to Bulk haven',
    description:
      'The Apple-clean retail layer for Bulk Exchange: fund, trade, follow, and manage risk without terminal chaos.',
    type: 'website',
    url: 'https://klubapp-web.vercel.app',
    siteName: 'Klub',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Klub: retail gateway to Bulk haven',
    description: 'Simple retail access to Bulk Exchange, with Pro power only when you ask for it.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg-base font-sans text-fg-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
