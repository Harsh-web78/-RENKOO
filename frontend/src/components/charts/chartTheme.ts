/*
 * RENKOO V2 — chart visual language (single source of truth).
 *
 * Restrained and premium: ink for primary series, muted gray
 * for comparison periods, semantic tones ONLY for good/bad
 * values. No gradients, no 3D, no decorative backgrounds.
 * Every chart behind the RenkooCharts abstraction consumes
 * these constants so all product charts answer their question
 * in the same voice.
 */

/** Primary data ink — the answer to the chart's question. */
export const CHART_INK = '#111318';

/** Comparison / previous-period series. */
export const CHART_COMPARISON = '#c3c8d1';

/** Secondary muted series (grid, axis text). */
export const CHART_MUTED = '#8b929f';

/** Grid line color (always subtle, horizontal only). */
export const CHART_GRID = '#e7e9ee';

/** Semantic tones — reserved for good/bad values only. */
export const CHART_GOOD = '#16835b';
export const CHART_BAD = '#c24141';
export const CHART_CAUTION = '#b7791f';

/** Restrained categorical ramp for contribution charts.
 *  Ink-first; grays after; semantic tones never included.
 *  Tail values stay legible on white (never near-invisible). */
export const CHART_RAMP = [
  '#111318',
  '#3d4451',
  '#6b7280',
  '#9aa1ad',
  '#aeb4be',
  '#c9ced6',
];

/** Shared margins — compact, no chart junk. */
export const CHART_MARGIN = {
  top: 8,
  right: 8,
  bottom: 0,
  left: 0,
};

/** Tooltip cursor — barely-there. */
export const CHART_CURSOR = { stroke: '#e7e9ee' };

/* Metric formatting — one voice for numbers everywhere. */

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000)
    return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)
    return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

export function formatPercent(
  value: number,
  digits = 1,
): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function formatDelta(
  value: number,
  digits = 1,
): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

/*
 * Reduced motion: recharts animates by default. Pages never
 * touch this — the chart components disable animation when
 * the user prefers reduced motion.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;
}
