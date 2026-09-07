'use client';

/*
 * RENKOO V2 — badges.
 * Generic Badge + StatusBadge for entity states, DataSourceBadge
 * for provider provenance, PersonaBadge for the presentation-only
 * persona emphasis, and WorkflowBadge for the
 * proposed → approved → executing → completed lifecycle.
 * Meaning never depends on color alone: every badge pairs
 * tone with an icon and uppercase text.
 */

import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Database,
  FileWarning,
  Play,
  Sparkles,
  User,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { PERSONA_META } from '@/lib/persona';

function Base({
  label,
  className,
  icon,
}: {
  label: string;
  className: string;
  icon: ReactNode;
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

const TONES: Record<string, string> = {
  neutral:
    'border-rk-border bg-rk-soft text-rk-secondary',
  info: 'border-rk-border bg-rk-infoSoft text-rk-info',
  positive:
    'border-rk-border bg-rk-successSoft text-rk-success',
  warning:
    'border-rk-border bg-rk-warningSoft text-rk-warning',
  danger:
    'border-rk-border bg-rk-dangerSoft text-rk-danger',
  /* Solid for CRITICAL only — the single highest
     severity must never blend in with HIGH. */
  critical: 'border-rk-danger bg-rk-danger text-white',
};

export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?:
    | 'neutral'
    | 'info'
    | 'positive'
    | 'warning'
    | 'danger'
    | 'critical';
  icon?: ReactNode;
}) {
  return (
    <Base
      label={label}
      className={TONES[tone]}
      icon={icon ?? <Circle size={11} />}
    />
  );
}

const STATUS_TONE: Record<string, 'neutral' | 'info' | 'positive' | 'warning' | 'danger' | 'critical'> = {
  TODO: 'neutral',
  OPEN: 'neutral',
  PROPOSED: 'neutral',
  DRAFT: 'neutral',
  IN_PROGRESS: 'info',
  ACKNOWLEDGED: 'info',
  APPROVED: 'info',
  EXECUTING: 'warning',
  DETECTED: 'warning',
  PENDING: 'warning',
  DONE: 'positive',
  RESOLVED: 'positive',
  COMPLETED: 'positive',
  CONNECTED: 'positive',
  ACTIVE: 'positive',
  FAILED: 'danger',
  ERROR: 'danger',
  CRITICAL: 'critical',
};

export function StatusBadge({
  status,
}: {
  status: string;
}) {
  const key = String(status ?? '').toUpperCase();
  const tone = STATUS_TONE[key] ?? 'neutral';
  const done = ['DONE', 'RESOLVED', 'COMPLETED'].includes(
    key,
  );

  return (
    <Badge
      label={
        String(status ?? '').replaceAll('_', ' ') ||
        'Unknown'
      }
      tone={tone}
      icon={
        done ? (
          <CheckCircle2 size={11} />
        ) : tone === 'warning' ? (
          <AlertTriangle size={11} />
        ) : (
          <Circle size={11} />
        )
      }
    />
  );
}

const SOURCE_TONE: Record<string, 'positive' | 'neutral' | 'warning'> = {
  CONNECTED: 'positive',
  LIVE: 'positive',
  AVAILABLE: 'positive',
  SYNCED: 'positive',
  UNAVAILABLE: 'warning',
  STALE: 'warning',
  DISCONNECTED: 'neutral',
  NOT_CONNECTED: 'neutral',
};

export function DataSourceBadge({
  source,
  connected,
}: {
  source: string;
  connected?: boolean;
}) {
  const key = String(source ?? '').toUpperCase();
  const tone =
    typeof connected === 'boolean'
      ? connected
        ? 'positive'
        : 'neutral'
      : (SOURCE_TONE[key] ?? 'neutral');

  return (
    <Badge
      label={source || 'Unknown source'}
      tone={tone}
      icon={<Database size={11} />}
    />
  );
}

export function PersonaBadge({
  persona,
}: {
  persona: string;
}) {
  const key = String(persona ?? '').toUpperCase();
  const meta =
    PERSONA_META[key as keyof typeof PERSONA_META];

  return (
    <Badge
      label={meta ? `${meta.label} view` : 'Role view'}
      tone="neutral"
      icon={<User size={11} />}
    />
  );
}

const WORKFLOW: Record<
  string,
  {
    tone: 'neutral' | 'info' | 'positive' | 'warning';
    icon: ReactNode;
  }
> = {
  PROPOSED: {
    tone: 'neutral',
    icon: <FileWarning size={11} />,
  },
  APPROVED: {
    tone: 'info',
    icon: <CheckCircle2 size={11} />,
  },
  EXECUTING: {
    tone: 'warning',
    icon: <Play size={11} />,
  },
  COMPLETED: {
    tone: 'positive',
    icon: <CheckCircle2 size={11} />,
  },
};

export function WorkflowBadge({
  stage,
}: {
  stage: string;
}) {
  const key = String(stage ?? '').toUpperCase();
  const style = WORKFLOW[key] ?? {
    tone: 'neutral' as const,
    icon: <Clock size={11} />,
  };

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-rk-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONES[style.tone]}`}
    >
      <span aria-hidden>{style.icon}</span>
      {key || 'UNKNOWN'}
    </span>
  );
}

export function AiBadge({ label = 'RENKOO AI' }: { label?: string }) {
  return (
    <Base
      label={label}
      className="border-rk-border bg-rk-ink text-white"
      icon={<Sparkles size={11} />}
    />
  );
}

/*
 * Freshness — subtle but discoverable recency indicator.
 * Use where staleness affects interpretation (provider
 * panels, metric footnotes), not on every metric.
 */
export function FreshnessBadge({
  label,
  stale = false,
}: {
  /** Pre-formatted by the page, e.g. "Updated 2h ago". */
  label: string;
  stale?: boolean;
}) {
  return (
    <Badge
      label={label}
      tone={stale ? 'warning' : 'neutral'}
      icon={<Clock size={11} />}
    />
  );
}
