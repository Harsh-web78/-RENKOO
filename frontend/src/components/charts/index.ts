/*
 * RENKOO V2 — chart barrel.
 * Pages import from '@/components/charts', never recharts.
 *
 * Heavy Recharts components resolve to Next.js dynamic
 * wrappers (./lazy) so the chart library loads on
 * demand; sync-safe primitives and types resolve to
 * ./primitives with zero chart-library cost. The
 * barrel itself never bundles Recharts statically.
 */

export {
  TrendChart,
  BarList,
  Sparkline,
  DonutChart,
} from './lazy';
export {
  FunnelStages,
  ProgressBar,
  ChartLegend,
} from './primitives';
export type {
  ChartState,
  TrendPoint,
  FunnelStage,
} from './primitives';
export type {
  BarDatum,
  DonutSlice,
} from './RenkooCharts';
export {
  CHART_INK,
  CHART_COMPARISON,
  CHART_MUTED,
  CHART_GRID,
  CHART_GOOD,
  CHART_BAD,
  CHART_CAUTION,
  CHART_RAMP,
  formatCompact,
  formatPercent,
  formatDelta,
} from './chartTheme';
