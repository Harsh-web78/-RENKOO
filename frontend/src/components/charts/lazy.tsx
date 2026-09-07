'use client';

/*
 * RENKOO V2 — lazy Recharts boundary.
 *
 * TrendChart, BarList, Sparkline and DonutChart are
 * Recharts-based and heavy. Routes consume THESE
 * wrappers (directly or through the charts barrel),
 * so the chart library loads on demand in its own
 * chunk instead of competing with first paint.
 *
 * Behavior contract (unchanged from ./RenkooCharts):
 * - identical props, data, tooltips, legends,
 *   responsive containers, interactions and states
 * - client-only render (Recharts measures on mount,
 *   so SSR output is the same skeleton the pages
 *   already show while data loads — no flash, no
 *   fake data)
 */

import dynamic from 'next/dynamic';

import { LoadingBlock } from '@/components/ui/states';

function ChartLoading() {
  return <LoadingBlock title="Loading chart…" />;
}

function SparklineLoading() {
  return (
    <span
      role="status"
      aria-label="Loading trend"
      className="rk-skeleton inline-block align-middle"
      style={{ width: 120, height: 32 }}
    />
  );
}

export const TrendChart = dynamic(
  () =>
    import('./RenkooCharts').then(
      (module) => module.TrendChart,
    ),
  { ssr: false, loading: ChartLoading },
);

export const BarList = dynamic(
  () =>
    import('./RenkooCharts').then(
      (module) => module.BarList,
    ),
  { ssr: false, loading: ChartLoading },
);

export const Sparkline = dynamic(
  () =>
    import('./RenkooCharts').then(
      (module) => module.Sparkline,
    ),
  { ssr: false, loading: SparklineLoading },
);

export const DonutChart = dynamic(
  () =>
    import('./RenkooCharts').then(
      (module) => module.DonutChart,
    ),
  { ssr: false, loading: ChartLoading },
);
