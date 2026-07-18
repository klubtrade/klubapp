import type { Config } from 'tailwindcss';

/**
 * KLUB design tokens.
 *
 * Palette philosophy (post Week-2 brand pass):
 *   - **Black is louder.** Base bg is `#06080F` - a deep blue-black that
 *     reads as institutional rather than gritty. Aligned in spirit with
 *     Bulk's `#020713` so KLUB-on-Bulk feels native, but not identical
 *     (we sit one notch warmer / brighter).
 *   - **White is louder.** `#FFFFFF` for primary text instead of an
 *     off-white - KLUB is a serious workspace, not a moody playground.
 *   - **Gold is the brand.** A warm amber `#E8B647` is now the primary
 *     accent. Replaces purple as the dominant brand signal - used on
 *     CTAs, the live dot, key numbers, and the wordmark. Distinct from
 *     Bulk's indigo so the two products read side-by-side as a partner-
 *     ship, not a clone.
 *   - **Purple is tertiary.** Demoted from primary accent to a state
 *     indicator only - links, focus rings, hover glows on muted UI.
 *     Keeps a memory of the previous palette without dominating.
 *   - **PnL semantics unchanged.** Green/red are universal trading
 *     conventions; touching them confuses the chart.
 *
 * The accent token name stays `accent` (now gold) because every existing
 * page references `text-accent` / `bg-accent` semantically - meaning
 * "the brand color." Renaming would force a sweep across 30+ files.
 * Purple is now under `accent-purple` for the few cases that want it.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#06080F',      // deep blue-black, Bulk-aligned in spirit
          surface: '#0F1320',   // raised cards / inputs
          elevated: '#171B2A',  // modals, drawers
          hover: '#1A1F2E',
        },
        border: {
          subtle: '#1A1F2E',
          DEFAULT: '#252B3C',
          strong: '#3D435A',
        },
        fg: {
          primary: '#FFFFFF',   // pure white - louder than the old #FAFAFA
          secondary: '#B5BAC9',
          muted: '#6A7185',
        },
        accent: {
          DEFAULT: '#E8B647',   // warm amber - KLUB primary
          bright: '#F5CC6F',    // hover / glow
          soft: '#B8902F',      // pressed / deep
          dim: '#3A2F12',       // tinted bg for accent-on-bg fills
        },
        'accent-purple': {
          DEFAULT: '#A78BFA',   // tertiary - links + focus rings only
          soft: '#6D5BC7',
        },
        pnl: {
          long: '#10B981',
          short: '#EF4444',
        },
        alert: {
          yellow: '#EAB308',
          orange: '#F97316',
          red: '#DC2626',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
      },
      letterSpacing: {
        smallcaps: '0.08em',
        smallcaps2: '0.14em',
      },
      borderRadius: {
        klub: '10px',
        'klub-lg': '16px',
      },
      keyframes: {
        'pulse-accent': {
          // Pulse now uses gold rgba.
          '0%, 100%': {
            opacity: '1',
            boxShadow: '0 0 0 0 rgba(232, 182, 71, 0.45)',
          },
          '50%': {
            opacity: '0.9',
            boxShadow: '0 0 0 6px rgba(232, 182, 71, 0)',
          },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'pulse-accent': 'pulse-accent 2.2s ease-in-out infinite',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'fade-in': 'fade-in 200ms ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
