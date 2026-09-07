import type { Config } from 'tailwindcss';

/*
 * RENKOO V2 design tokens.
 * The `--rk-*` CSS variables in globals.css are the single
 * source of truth; this config only maps them into Tailwind
 * utilities. The legacy `renkoo` palette is kept untouched
 * until the last page migrates off it.
 */
const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        renkoo: {
          blue: '#2563EB',
          purple: '#7C3AED',
          ink: '#0F172A',
        },
        rk: {
          bg: 'var(--rk-bg)',
          canvas: 'var(--rk-canvas, var(--rk-bg))',
          surface: 'var(--rk-surface)',
          soft: 'var(--rk-surface-soft)',
          surfaceMuted:
            'var(--rk-surface-muted, var(--rk-surface-soft))',
          border: 'var(--rk-border)',
          strong: 'var(--rk-border-strong)',
          ink: 'var(--rk-text)',
          primary:
            'var(--rk-text-primary, var(--rk-text))',
          secondary:
            'var(--rk-text-secondary)',
          muted: 'var(--rk-text-muted)',
          accent: 'var(--rk-accent, var(--rk-info))',
          accentSoft:
            'var(--rk-accent-soft, var(--rk-info-soft))',
          success: 'var(--rk-success)',
          warning: 'var(--rk-warning)',
          danger: 'var(--rk-danger)',
          info: 'var(--rk-info)',
          successSoft:
            'var(--rk-success-soft)',
          warningSoft:
            'var(--rk-warning-soft)',
          dangerSoft:
            'var(--rk-danger-soft)',
          infoSoft: 'var(--rk-info-soft)',
          /* Kebab-case aliases for legacy class names
             (bg-rk-danger-soft, decoration-rk-border-strong).
             Same tokens, no new colors. */
          'success-soft':
            'var(--rk-success-soft)',
          'warning-soft':
            'var(--rk-warning-soft)',
          'danger-soft':
            'var(--rk-danger-soft)',
          'info-soft': 'var(--rk-info-soft)',
          'border-strong':
            'var(--rk-border-strong)',
          scrim: 'var(--rk-scrim)',
          focus: 'var(--rk-focus, var(--rk-text))',
          disabledBg: 'var(--rk-disabled-bg)',
          disabledText: 'var(--rk-disabled-text)',
          connected:
            'var(--rk-connected, var(--rk-success))',
          connectedSoft:
            'var(--rk-connected-soft, var(--rk-success-soft))',
          proposed: 'var(--rk-proposed)',
          proposedSoft: 'var(--rk-proposed-soft)',
          approved: 'var(--rk-approved)',
          approvedSoft: 'var(--rk-approved-soft)',
          executing: 'var(--rk-executing)',
          executingSoft:
            'var(--rk-executing-soft)',
          completed: 'var(--rk-completed)',
          completedSoft:
            'var(--rk-completed-soft)',
        },
      },
      borderRadius: {
        'rk-sm': 'var(--rk-radius-sm)',
        'rk-md': 'var(--rk-radius-md)',
        'rk-lg': 'var(--rk-radius-lg)',
      },
      boxShadow: {
        'rk-sm': 'var(--rk-shadow-sm)',
        'rk-md': 'var(--rk-shadow-md)',
        'rk-lg': 'var(--rk-shadow-lg, 0 20px 60px rgba(19,19,22,.12))',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;