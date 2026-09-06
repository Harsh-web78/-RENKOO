'use client';

/*
 * RENKOO V2 — Metric.
 * Single statistic with label, tabular value, supporting
 * detail and an optional delta. Tone is semantic and always
 * paired with text — never color-only.
 */

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

export default function Metric({
  label,
  value,
  detail,
  delta,
  deltaDirection = 'flat',
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  detail?: string;
  delta?: string;
  deltaDirection?: 'up' | 'down' | 'flat';
  tone?:
    | 'neutral'
    | 'positive'
    | 'warning'
    | 'negative';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-rk-success'
      : tone === 'warning'
        ? 'text-rk-warning'
        : tone === 'negative'
          ? 'text-rk-danger'
          : 'text-rk-ink';

  const DeltaIcon =
    deltaDirection === 'up'
      ? ArrowUpRight
      : deltaDirection === 'down'
        ? ArrowDownRight
        : Minus;

  return (
    <div className="min-w-0">
      <p className="rk-label">{label}</p>

      <p
        className={`rk-number mt-2 text-[28px] font-bold leading-none ${toneClass}`}
      >
        {value}
      </p>

      {detail || delta ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-rk-muted">
          {delta ? (
            <span className="inline-flex items-center gap-1 font-semibold text-rk-secondary">
              <DeltaIcon
                size={13}
                aria-hidden
              />
              {delta}
            </span>
          ) : null}

          {detail ? <span>{detail}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
