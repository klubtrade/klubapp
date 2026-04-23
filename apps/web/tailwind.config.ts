import type { Config } from 'tailwindcss';

/**
 * KLUB design tokens.
 *
 * Palette: light-purple (Violet 400 / 300) on near-black matte.
 * Typography: Inter UI + JetBrains Mono numerics.
 * Radii: `rounded-klub` = 10px default, `rounded-klub-lg` = 16px for cards.
 *
 * The accent token used to be `amber` — renamed when the palette pivoted.
 * All `text-accent`, `bg-accent`, `border-accent` references across the app
 * were migrated to `text-accent`, `bg-accent`, `border-accent`.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0A0A0B',
          surface: '#131316',
          elevated: '#1A1A1F',
        },
        border: {
          subtle: '#1C1C22',
          DEFAULT: '#26262C',
          strong: '#3F3F46',
        },
        fg: {
          primary: '#FAFAFA',
          secondary: '#A8A8AE',
          muted: '#5A5A63',
        },
        accent: {
          DEFAULT: '#A78BFA', // Violet 400
          bright: '#C4B5FD', // Violet 300 (hover / glow)
          soft: '#7C3AED',   // Violet 600 (pressed / deep)
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
        // Kept from the previous iteration — still used on the in-app
        // pages (/calculator, /health, /trade, /follow, /practice) which
        // haven't gone through the minimalist pass yet. Remove when those
        // pages are redesigned.
        smallcaps: '0.08em',
        smallcaps2: '0.14em',
      },
      borderRadius: {
        klub: '10px',
        'klub-lg': '16px',
      },
      keyframes: {
        'pulse-accent': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(167, 139, 250, 0.4)' },
          '50%': { opacity: '0.9', boxShadow: '0 0 0 6px rgba(167, 139, 250, 0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-accent': 'pulse-accent 2.2s ease-in-out infinite',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.2, 0.7, 0.2, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
