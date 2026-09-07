'use client';

/*
 * RENKOO V2 — recharts-free chart primitives.
 *
 * FunnelStages, ProgressBar and ChartLegend (plus the
 * shared chart data states) render with plain elements
 * only — no Recharts dependency. Routes that need just
 * these import from './primitives' (or the barrel) and
 * pay zero chart-library cost.
 *
 * Recharts-based components (TrendChart, BarList,
 * Sparkline, DonutChart) live in ./RenkooCharts and
 * must be consumed through ./lazy (Next.js dynamic
 * imports), never through a static route-level import.
 * ./RenkooCharts re-exports everything below so
 * existing deep imports keep working.
 */

import {
  EmptyState,
  ErrorState,
  InsufficientHistoryState,
  LoadingBlock,
  PartialDataState,
  UnavailableState,
} from '@/components/ui/states';
import {
  CHART_BAD,
  CHART_COMPARISON,
  CHART_GOOD,
  CHART_INK,
} from './chartTheme';

export type ChartState =
  | 'ready'
  | 'loading'
  | 'error'
  | 'empty'
  | 'unavailable'
  | 'insufficient'
  | 'partial';

export interface TrendPoint {
  x: string;
  y: number;
  previous?: number;
}

export function ChartStateBlock({
  state,
  title,
  description,
  detail,
  onRetry,
  connectHref,
  actionLabel,
  actionHref,
  onAction,
}: {
  state: ChartState;
  title: string;
  description?: string;
  detail?: React.ReactNode;
  onRetry?: () => void;
  connectHref?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  switch (state) {
    case 'loading':
      return <LoadingBlock title={title} />;
    case 'error':
      return (
        <ErrorState
          title={title}
          description={description}
          onRetry={onRetry}
        />
      );
    case 'unavailable':
      return (
        <UnavailableState
          title={title}
          description={
            description ??
            'This data source is not connected.'
          }
          connectHref={connectHref}
        />
      );
    case 'insufficient':
      return (
        <InsufficientHistoryState
          description={description}
          detail={detail}
          actionLabel={actionLabel}
          actionHref={actionHref}
          onAction={onAction}
        />
      );
    case 'partial':
      return (
        <PartialDataState
          title={title}
          description={description}
          detail={detail}
          actionLabel={actionLabel}
          actionHref={actionHref}
          onAction={onAction}
        />
      );
    case 'empty':
    default:
      return (
        <EmptyState
          title={title}
          description={description}
        />
      );
  }
}

/** Small inline legend — text-first, no oversized color keys. */
export function ChartLegend({
  items,
}: {
  items: Array<{
    label: string;
    tone?: 'ink' | 'comparison' | 'good' | 'bad';
  }>;
}) {
  const dot: Record<string, string> = {
    ink: CHART_INK,
    comparison: CHART_COMPARISON,
    good: CHART_GOOD,
    bad: CHART_BAD,
  };
  return (
    <ul
      aria-label="Legend"
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-rk-secondary"
    >
      {items.map((item) => (
        <li
          key={item.label}
          className="inline-flex items-center gap-1.5"
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background:
                dot[item.tone ?? 'ink'],
            }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export interface FunnelStage {
  label: string;
  value: number;
  /** Optional real href the stage drills into. */
  href?: string;
}

/*
 * FunnelStages — staged conversion without chart junk.
 * Answers "where do we lose them?" Each stage shows its
 * real value plus conversion from the previous stage.
 * Widths are proportional to the first stage; a stage
 * with no value renders its state, never a zero bar.
 */
export function FunnelStages({
  state = 'ready',
  stages,
  summary,
  formatValue,
  emptyTitle = 'No funnel data yet',
  emptyDescription,
  detail,
  onRetry,
  connectHref,
}: {
  state?: ChartState;
  stages: FunnelStage[];
  summary: string;
  formatValue?: (value: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  detail?: React.ReactNode;
  onRetry?: () => void;
  connectHref?: string;
}) {
  if (state !== 'ready') {
    return (
      <ChartStateBlock
        state={state}
        title={
          state === 'loading'
            ? 'Loading funnel…'
            : emptyTitle
        }
        description={emptyDescription}
        detail={detail}
        onRetry={onRetry}
        connectHref={connectHref}
      />
    );
  }

  const max = Math.max(
    1,
    ...stages.map((s) => s.value),
  );

  return (
    <div role="img" aria-label={summary}>
      <ol className="space-y-2">
        {stages.map((stage, index) => {
          const width = Math.max(
            4,
            (stage.value / max) * 100,
          );
          const prev = stages[index - 1];
          const conversion =
            prev && prev.value > 0
              ? (stage.value / prev.value) * 100
              : null;
          return (
            <li key={stage.label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-semibold text-rk-ink">
                  {stage.label}
                </span>
                <span className="rk-number shrink-0 text-rk-secondary">
                  {formatValue
                    ? formatValue(stage.value)
                    : stage.value}
                  {conversion !== null ? (
                    <span className="ml-2 text-xs text-rk-muted">
                      {conversion.toFixed(1)}% of
                      previous
                    </span>
                  ) : null}
                </span>
              </div>
              <div
                className="mt-1 h-2.5 overflow-hidden rounded-full bg-rk-soft"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-rk-ink"
                  style={{ width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sr-only">{summary}</p>
    </div>
  );
}

/*
 * ProgressBar — one metric against its target.
 * Answers "how far along are we?" Clamped at 100%;
 * over-achievement is stated in text, not decoration.
 */
export function ProgressBar({
  value,
  target,
  summary,
  formatValue,
  label,
}: {
  value: number;
  target: number;
  summary: string;
  formatValue?: (value: number) => string;
  label?: string;
}) {
  const pct =
    target > 0
      ? Math.min(100, (value / target) * 100)
      : 0;

  return (
    <div role="img" aria-label={summary}>
      {label ? (
        <p className="rk-field-label">{label}</p>
      ) : null}
      <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="rk-number font-extrabold text-rk-ink">
          {formatValue
            ? formatValue(value)
            : value}
        </span>
        <span className="rk-metadata">
          of{' '}
          {formatValue
            ? formatValue(target)
            : target}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-rk-soft"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-rk-ink"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="sr-only">{summary}</p>
    </div>
  );
}
