'use client';

/*
 * RENKOO V2 — status chips.
 * Severity, priority and workflow status always pair color
 * with an icon and uppercase text so meaning never depends
 * on color alone.
 */

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  MinusCircle,
} from 'lucide-react';

function Chip({
  label,
  className,
  icon,
}: {
  label: string;
  className: string;
  icon: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-rk-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${className}`}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

const SEVERITY_STYLE: Record<
  string,
  { className: string; icon: React.ReactNode }
> = {
  CRITICAL: {
    className:
      'border-rk-danger bg-rk-danger text-white',
    icon: <AlertOctagon size={11} />,
  },
  HIGH: {
    className:
      'border-rk-border bg-rk-dangerSoft text-rk-danger',
    icon: <AlertTriangle size={11} />,
  },
  MEDIUM: {
    className:
      'border-rk-border bg-rk-warningSoft text-rk-warning',
    icon: <AlertTriangle size={11} />,
  },
  LOW: {
    className:
      'border-rk-border bg-rk-soft text-rk-secondary',
    icon: <Info size={11} />,
  },
};

export function SeverityChip({
  severity,
}: {
  severity: string;
}) {
  const key = String(
    severity ?? '',
  ).toUpperCase();
  const style = SEVERITY_STYLE[key] ?? {
    className:
      'border-rk-border bg-rk-soft text-rk-secondary',
    icon: <MinusCircle size={11} />,
  };

  return (
    <Chip
      label={key || 'UNKNOWN'}
      className={style.className}
      icon={style.icon}
    />
  );
}

const PRIORITY_STYLE: Record<
  string,
  { className: string; icon: React.ReactNode }
> = {
  HIGH: {
    className:
      'border-rk-border bg-rk-dangerSoft text-rk-danger',
    icon: <AlertTriangle size={11} />,
  },
  MEDIUM: {
    className:
      'border-rk-border bg-rk-warningSoft text-rk-warning',
    icon: <Clock size={11} />,
  },
  LOW: {
    className:
      'border-rk-border bg-rk-soft text-rk-secondary',
    icon: <MinusCircle size={11} />,
  },
};

export function PriorityChip({
  priority,
}: {
  priority: string;
}) {
  const key = String(
    priority ?? '',
  ).toUpperCase();
  const style = PRIORITY_STYLE[key] ?? {
    className:
      'border-rk-border bg-rk-soft text-rk-secondary',
    icon: <MinusCircle size={11} />,
  };

  return (
    <Chip
      label={key || 'UNKNOWN'}
      className={style.className}
      icon={style.icon}
    />
  );
}

const STATUS_STYLE: Record<string, string> = {
  TODO: 'border-rk-border bg-rk-soft text-rk-secondary',
  IN_PROGRESS:
    'border-rk-border bg-rk-infoSoft text-rk-info',
  DONE: 'border-rk-success/30 bg-rk-success/10 text-rk-success',
  OPEN: 'border-rk-border bg-rk-soft text-rk-secondary',
  DETECTED:
    'border-rk-warning/30 bg-rk-warning/10 text-rk-warning',
  ACKNOWLEDGED:
    'border-rk-border bg-rk-infoSoft text-rk-info',
  RESOLVED:
    'border-rk-border bg-rk-successSoft text-rk-success',
  COMPLETED:
    'border-rk-border bg-rk-successSoft text-rk-success',
};

export function StatusChip({
  status,
}: {
  status: string;
}) {
  const key = String(status ?? '').toUpperCase();
  const done = ['DONE', 'RESOLVED', 'COMPLETED'].includes(
    key,
  );

  return (
    <Chip
      label={String(status ?? '').replaceAll('_', ' ') || 'UNKNOWN'}
      className={
        STATUS_STYLE[key] ??
        'border-rk-border bg-rk-soft text-rk-secondary'
      }
      icon={
        done ? (
          <CheckCircle2 size={11} />
        ) : (
          <Circle size={11} />
        )
      }
    />
  );
}

export function ScoreBadge({
  score,
}: {
  score: number | string;
}) {
  return (
    <span className="rk-number inline-flex shrink-0 items-center rounded-rk-sm bg-rk-ink px-1.5 py-0.5 text-[10px] font-bold text-white">
      {score}
    </span>
  );
}
