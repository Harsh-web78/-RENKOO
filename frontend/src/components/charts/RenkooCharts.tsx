'use client';

/*
 * RENKOO V2 — chart abstraction (the ONLY recharts boundary).
 * Pages consume THESE components, never recharts directly.
 *
 * Covered types (only what the product needs):
 *   TrendChart  — time series with previous-period comparison
 *   BarList     — comparison / ranking (horizontal bars)
 *   Sparkline   — tiny trend inside metrics and table cells
 *   DonutChart  — contribution / distribution
 *   FunnelStages— staged conversion (opportunity → action → outcome)
 *   ProgressBar — single metric vs target
 *
 * Every chart supports the shared data states (loading /
 * error / empty / unavailable / insufficient history /
 * partial data), responsive sizing, restrained tooltips, and
 * a screen-reader summary plus a sr-only data table for
 * important charts. Palette comes from chartTheme — ink +
 * muted grays, semantic tones only for good/bad values.
 * Charts never fabricate values: missing data renders a
 * state, never a zero.
 */

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartStateBlock,
  type ChartState,
  type TrendPoint,
} from './primitives';
import {
  CHART_COMPARISON,
  CHART_CURSOR,
  CHART_GOOD,
  CHART_BAD,
  CHART_GRID,
  CHART_INK,
  CHART_MARGIN,
  CHART_MUTED,
  CHART_RAMP,
  prefersReducedMotion,
} from './chartTheme';

function useChartAnimation(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion());

    const query = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );
    function onChange() {
      setReduced(query.matches);
    }
    query.addEventListener('change', onChange);
    return () =>
      query.removeEventListener('change', onChange);
  }, []);

  return !reduced;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
}: any & {
  formatValue?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-xs shadow-rk-md">
      <p className="font-bold text-rk-ink">{label}</p>

      {payload.map((entry: any, index: number) => (
        <p
          key={index}
          className="mt-0.5 tabular-nums text-rk-secondary"
        >
          {entry.name}:{' '}
          <strong className="text-rk-ink">
            {formatValue
              ? formatValue(entry.value)
              : entry.value}
          </strong>
        </p>
      ))}
    </div>
  );
}

/** Screen-reader data table for important charts. */
function ChartDataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={j}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TrendChart({
  state = 'ready',
  points,
  previousLabel = 'Previous period',
  currentLabel = 'Current period',
  height = 240,
  summary,
  formatValue,
  emptyTitle = 'No trend data',
  emptyDescription,
  detail,
  onRetry,
  connectHref,
}: {
  state?: ChartState;
  points: TrendPoint[];
  previousLabel?: string;
  currentLabel?: string;
  height?: number;
  summary: string;
  formatValue?: (value: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  detail?: React.ReactNode;
  onRetry?: () => void;
  connectHref?: string;
}) {
  const animate = useChartAnimation();

  if (state !== 'ready') {
    return (
      <ChartStateBlock
        state={state}
        title={
          state === 'loading'
            ? 'Loading trend…'
            : emptyTitle
        }
        description={emptyDescription}
        detail={detail}
        onRetry={onRetry}
        connectHref={connectHref}
      />
    );
  }

  const showPrevious = points.some(
    (point) =>
      typeof point.previous === 'number',
  );

  return (
    <div
      role="img"
      aria-label={summary}
      className="rk-chart w-full"
    >
      <ResponsiveContainer
        width="100%"
        height={height}
      >
        <LineChart
          data={points}
          margin={CHART_MARGIN}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke={CHART_GRID}
          />

          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={{ stroke: CHART_GRID }}
            minTickGap={32}
            tick={{ fill: CHART_MUTED }}
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={{ fill: CHART_MUTED }}
            tickFormatter={
              formatValue as any
            }
          />

          <Tooltip
            content={
              <ChartTooltip
                formatValue={formatValue}
              />
            }
            cursor={CHART_CURSOR}
          />

          {showPrevious ? (
            <Line
              type="monotone"
              dataKey="previous"
              name={previousLabel}
              stroke={CHART_COMPARISON}
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={animate}
            />
          ) : null}

          <Line
            type="monotone"
            dataKey="y"
            name={currentLabel}
            stroke={CHART_INK}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={animate}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="sr-only">{summary}</p>
      <ChartDataTable
        caption={summary}
        headers={
          showPrevious
            ? ['Period', currentLabel, previousLabel]
            : ['Period', currentLabel]
        }
        rows={points.map((p) => [
          p.x,
          String(p.y),
          ...(typeof p.previous === 'number'
            ? [String(p.previous)]
            : []),
        ])}
      />
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  tone?: 'neutral' | 'good' | 'bad';
}

export function BarList({
  state = 'ready',
  bars,
  height = 240,
  summary,
  formatValue,
  emptyTitle = 'No data to compare',
  emptyDescription,
  detail,
  onRetry,
  connectHref,
}: {
  state?: ChartState;
  bars: BarDatum[];
  height?: number;
  summary: string;
  formatValue?: (value: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  detail?: React.ReactNode;
  onRetry?: () => void;
  connectHref?: string;
}) {
  const animate = useChartAnimation();

  if (state !== 'ready') {
    return (
      <ChartStateBlock
        state={state}
        title={
          state === 'loading'
            ? 'Loading comparison…'
            : emptyTitle
        }
        description={emptyDescription}
        detail={detail}
        onRetry={onRetry}
        connectHref={connectHref}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={summary}
      className="rk-chart w-full"
    >
      <ResponsiveContainer
        width="100%"
        height={height}
      >
        <BarChart
          data={bars}
          layout="vertical"
          margin={{
            top: 0,
            right: 16,
            bottom: 0,
            left: 0,
          }}
        >
          <CartesianGrid
            horizontal={false}
            strokeDasharray="3 3"
            stroke={CHART_GRID}
          />

          <XAxis type="number" hide />

          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            width={140}
            tick={{ fill: CHART_MUTED }}
          />

          <Tooltip
            content={
              <ChartTooltip
                formatValue={formatValue}
              />
            }
            cursor={{ fill: CHART_GRID }}
          />

          <Bar
            dataKey="value"
            radius={[4, 4, 4, 4]}
            maxBarSize={18}
            isAnimationActive={animate}
          >
            {bars.map((bar, index) => (
              <Cell
                key={index}
                fill={
                  bar.tone === 'good'
                    ? CHART_GOOD
                    : bar.tone === 'bad'
                      ? CHART_BAD
                      : CHART_INK
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="sr-only">{summary}</p>
      <ChartDataTable
        caption={summary}
        headers={['Item', 'Value']}
        rows={bars.map((b) => [
          b.label,
          formatValue
            ? formatValue(b.value)
            : String(b.value),
        ])}
      />
    </div>
  );
}

/*
 * Sparkline — tiny trend for metrics and table cells.
 * Answers "which direction?" at a glance. No axes, no
 * grid, no tooltip: the surrounding Metric owns the label
 * and the sr-only text owns the interpretation.
 */
export function Sparkline({
  state = 'ready',
  points,
  width = 120,
  height = 32,
  summary,
  tone = 'neutral',
  onRetry,
}: {
  state?: ChartState;
  points: number[];
  width?: number;
  height?: number;
  summary: string;
  tone?: 'neutral' | 'good' | 'bad';
  onRetry?: () => void;
}) {
  const animate = useChartAnimation();

  if (state !== 'ready') {
    if (state === 'loading') {
      return (
        <div
          role="status"
          aria-label="Loading trend"
          className="rk-skeleton"
          style={{ width, height }}
        />
      );
    }
    return (
      <span className="rk-metadata">
        {state === 'error' ? (
          <button
            type="button"
            onClick={onRetry}
            className="rk-focusable underline underline-offset-2"
          >
            Retry trend
          </button>
        ) : (
          'No trend'
        )}
      </span>
    );
  }

  if (points.length < 2) {
    return (
      <span className="rk-metadata">
        Not enough points
      </span>
    );
  }

  const data = points.map((y, i) => ({
    x: i,
    y,
  }));
  const stroke =
    tone === 'good'
      ? CHART_GOOD
      : tone === 'bad'
        ? CHART_BAD
        : CHART_INK;

  return (
    <span
      role="img"
      aria-label={summary}
      className="rk-chart inline-block align-middle"
    >
      <LineChart
        data={data}
        width={width}
        height={height}
        margin={{
          top: 2,
          right: 2,
          bottom: 2,
          left: 2,
        }}
      >
        <Line
          type="monotone"
          dataKey="y"
          stroke={stroke}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={animate}
        />
      </LineChart>
      <span className="sr-only">{summary}</span>
    </span>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
}

/*
 * DonutChart — contribution / distribution.
 * Answers "what makes up the whole?" Center shows the
 * total; the legend lists real shares. Slices beyond the
 * ramp reuse grays — never a rainbow.
 */
export function DonutChart({
  state = 'ready',
  slices,
  height = 220,
  summary,
  formatValue,
  centerLabel,
  emptyTitle = 'Nothing to distribute yet',
  emptyDescription,
  detail,
  onRetry,
  connectHref,
}: {
  state?: ChartState;
  slices: DonutSlice[];
  height?: number;
  summary: string;
  formatValue?: (value: number) => string;
  centerLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  detail?: React.ReactNode;
  onRetry?: () => void;
  connectHref?: string;
}) {
  const animate = useChartAnimation();

  if (state !== 'ready') {
    return (
      <ChartStateBlock
        state={state}
        title={
          state === 'loading'
            ? 'Loading distribution…'
            : emptyTitle
        }
        description={emptyDescription}
        detail={detail}
        onRetry={onRetry}
        connectHref={connectHref}
      />
    );
  }

  const total = slices.reduce(
    (sum, s) => sum + s.value,
    0,
  );
  const ranked = [...slices].sort(
    (a, b) => b.value - a.value,
  );

  return (
    <div
      role="img"
      aria-label={summary}
      className="rk-chart w-full"
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div
          className="relative shrink-0"
          style={{ width: height, height }}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <PieChart>
              <Tooltip
                content={
                  <ChartTooltip
                    formatValue={formatValue}
                  />
                }
              />
              <Pie
                data={ranked}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="88%"
                strokeWidth={2}
                stroke="var(--rk-surface)"
                isAnimationActive={animate}
              >
                {ranked.map((_, index) => (
                  <Cell
                    key={index}
                    fill={
                      CHART_RAMP[
                        index % CHART_RAMP.length
                      ]
                    }
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="rk-number text-xl font-extrabold text-rk-ink">
                {formatValue
                  ? formatValue(total)
                  : total}
              </p>
              {centerLabel ? (
                <p className="rk-metadata">
                  {centerLabel}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <ul className="w-full min-w-0 space-y-1.5 text-sm">
          {ranked.map((slice, index) => (
            <li
              key={slice.label}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{
                  background:
                    CHART_RAMP[
                      index % CHART_RAMP.length
                    ],
                }}
              />
              <span className="min-w-0 flex-1 truncate text-rk-secondary">
                {slice.label}
              </span>
              <span className="rk-number shrink-0 font-bold text-rk-ink">
                {formatValue
                  ? formatValue(slice.value)
                  : slice.value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="sr-only">{summary}</p>
      <ChartDataTable
        caption={summary}
        headers={['Segment', 'Value']}
        rows={ranked.map((s) => [
          s.label,
          formatValue
            ? formatValue(s.value)
            : String(s.value),
        ])}
      />
    </div>
  );
}

/*
 * Sync-safe pieces live in ./primitives
 * (recharts-free). Re-exported here so existing deep
 * imports keep resolving; routes must still prefer
 * './primitives' or './lazy' to avoid bundling
 * Recharts statically.
 */
export type {
  ChartState,
  FunnelStage,
  TrendPoint,
} from './primitives';

export {
  ChartLegend,
  FunnelStages,
  ProgressBar,
} from './primitives';
