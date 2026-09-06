'use client';

/*
 * RENKOO V2 — shared data-state system.
 * Eight visually distinct states with eight distinct meanings:
 * loading (skeleton) / empty (zero records) / error (retryable
 * failure) / unavailable (provider blocked) / insufficient
 * history (tracking, not enough comparison window) /
 * limit reached (plan/usage cap) / partial data (degraded but
 * usable) / not connected (never linked — offers connect path).
 * "No data yet" never looks like "not connected", which never
 * looks like "provider unavailable", which never looks like
 * "not enough history". No state invents data.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CloudOff,
  Gauge,
  Inbox,
  PieChart,
  Plug,
  RefreshCw,
} from 'lucide-react';

export type DataStateTone =
  | 'neutral'
  | 'error'
  | 'unavailable'
  | 'insufficient'
  | 'limit'
  | 'partial'
  | 'notConnected';

function Shell({
  icon,
  title,
  description,
  detail,
  children,
  tone = 'neutral',
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  detail?: ReactNode;
  children?: ReactNode;
  tone?: DataStateTone;
}) {
  const container =
    tone === 'error'
      ? 'border-rk-danger'
      : tone === 'unavailable'
        ? 'border-rk-border bg-rk-surface'
        : tone === 'insufficient'
          ? 'border-rk-warning/40 bg-rk-warningSoft/40'
          : tone === 'limit'
            ? 'border-rk-strong bg-rk-surface'
            : tone === 'partial'
              ? 'border-rk-info/40 bg-rk-infoSoft/40'
              : tone === 'notConnected'
                ? 'border-dashed border-rk-strong bg-rk-surface'
                : 'border-rk-border';

  const iconBox =
    tone === 'error'
      ? 'bg-rk-dangerSoft text-rk-danger'
      : tone === 'unavailable'
        ? 'bg-rk-soft text-rk-muted'
        : tone === 'insufficient'
          ? 'bg-rk-warningSoft text-rk-warning'
          : tone === 'limit'
            ? 'bg-rk-ink text-white'
            : tone === 'partial'
              ? 'bg-rk-infoSoft text-rk-info'
              : tone === 'notConnected'
                ? 'border border-dashed border-rk-strong bg-rk-surface text-rk-secondary'
                : 'bg-rk-soft text-rk-secondary';

  return (
    <div
      role="status"
      className={`rounded-rk-lg border bg-rk-surface p-6 text-center shadow-rk-sm ${container}`}
    >
      <div
        className={`mx-auto grid h-10 w-10 place-items-center rounded-rk-md ${iconBox}`}
      >
        {icon}
      </div>

      <p className="mt-3 text-sm font-bold text-rk-ink">
        {title}
      </p>

      {description ? (
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-rk-secondary">
          {description}
        </p>
      ) : null}

      {detail ? (
        <div className="rk-metadata mx-auto mt-2 max-w-md">
          {detail}
        </div>
      ) : null}

      {children ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function StateAction({
  label,
  href,
  onClick,
  primary = true,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
}) {
  const className = primary
    ? 'rk-focusable rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white'
    : 'rk-focusable rounded-rk-md border border-rk-strong bg-rk-surface px-4 py-2 text-xs font-bold text-rk-ink';

  if (href) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
    >
      {label}
    </button>
  );
}

export function LoadingBlock({
  title = 'Loading…',
  lines = 3,
}: {
  title?: string;
  lines?: number;
}) {
  return (
    <div
      role="status"
      aria-label={title}
      className="rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-rk-sm"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-rk-secondary">
        <RefreshCw
          size={15}
          className="animate-spin"
          aria-hidden
        />
        {title}
      </div>

      <div
        className="mt-4 space-y-2"
        aria-hidden
      >
        {Array.from({ length: lines }).map(
          (_, index) => (
            <div
              key={index}
              className="rk-skeleton h-4 w-full"
              style={{
                width: `${92 - index * 9}%`,
              }}
            />
          ),
        )}
      </div>
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'RENKOO could not load this section. Your data is safe — try again.',
  onRetry,
  retryLabel = 'Try again',
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <Shell
      tone="error"
      icon={
        <AlertTriangle
          size={18}
          aria-hidden
        />
      }
      title={title}
      description={description}
    >
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rk-focusable rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white"
        >
          {retryLabel}
        </button>
      ) : null}
    </Shell>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  icon,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <Shell
      icon={
        icon ?? (
          <Inbox size={18} aria-hidden />
        )
      }
      title={title}
      description={description}
    >
      {actionLabel &&
      (actionHref || onAction) ? (
        actionHref ? (
          <Link
            href={actionHref}
            className="rk-focusable rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white"
          >
            {actionLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="rk-focusable rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white"
          >
            {actionLabel}
          </button>
        )
      ) : null}
    </Shell>
  );
}

export function UnavailableState({
  title,
  description,
  detail,
  connectLabel = 'Open integrations',
  connectHref = '/integrations',
}: {
  title: string;
  description: string;
  detail?: ReactNode;
  connectLabel?: string;
  connectHref?: string;
}) {
  return (
    <Shell
      tone="unavailable"
      icon={
        <CloudOff size={18} aria-hidden />
      }
      title={title}
      description={description}
      detail={detail}
    >
      <Link
        href={connectHref}
        className="rk-focusable rounded-rk-md border border-rk-strong bg-rk-surface px-4 py-2 text-xs font-bold text-rk-ink"
      >
        {connectLabel}
      </Link>
    </Shell>
  );
}

export function InsufficientHistoryState({
  title = 'Not enough history yet',
  description = 'Tracking is active, but there is not enough historical data for a fair comparison yet.',
  detail,
  actionLabel,
  actionHref,
  onAction,
}: {
  title?: string;
  description?: string;
  detail?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <Shell
      tone="insufficient"
      icon={
        <CalendarClock size={18} aria-hidden />
      }
      title={title}
      description={description}
      detail={detail}
    >
      {actionLabel && (actionHref || onAction) ? (
        <StateAction
          label={actionLabel}
          href={actionHref}
          onClick={onAction}
          primary={false}
        />
      ) : null}
    </Shell>
  );
}

export function LimitReachedState({
  title = 'Limit reached',
  description = 'This workspace hit its plan limit. Real data is preserved — raise the limit to continue.',
  detail,
  actionLabel = 'View billing',
  actionHref = '/billing',
  onAction,
  secondaryLabel,
  secondaryHref,
  onSecondary,
}: {
  title?: string;
  description?: string;
  detail?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  onSecondary?: () => void;
}) {
  return (
    <Shell
      tone="limit"
      icon={<Gauge size={18} aria-hidden />}
      title={title}
      description={description}
      detail={detail}
    >
      <StateAction
        label={actionLabel}
        href={actionHref}
        onClick={onAction}
        primary
      />
      {secondaryLabel &&
      (secondaryHref || onSecondary) ? (
        <StateAction
          label={secondaryLabel}
          href={secondaryHref}
          onClick={onSecondary}
          primary={false}
        />
      ) : null}
    </Shell>
  );
}

export function PartialDataState({
  title = 'Partial data available',
  description = 'Some sources reported in. What is shown is real — the missing part is labelled, never filled in.',
  detail,
  actionLabel,
  actionHref,
  onAction,
}: {
  title?: string;
  description?: string;
  detail?: ReactNode;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <Shell
      tone="partial"
      icon={<PieChart size={18} aria-hidden />}
      title={title}
      description={description}
      detail={detail}
    >
      {actionLabel && (actionHref || onAction) ? (
        <StateAction
          label={actionLabel}
          href={actionHref}
          onClick={onAction}
          primary={false}
        />
      ) : null}
    </Shell>
  );
}

export function NotConnectedState({
  title,
  description,
  detail,
  connectLabel = 'Connect now',
  connectHref = '/integrations',
  onConnect,
  secondaryLabel,
  secondaryHref,
  onSecondary,
}: {
  title: string;
  description: string;
  detail?: ReactNode;
  connectLabel?: string;
  connectHref?: string;
  onConnect?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  onSecondary?: () => void;
}) {
  return (
    <Shell
      tone="notConnected"
      icon={<Plug size={18} aria-hidden />}
      title={title}
      description={description}
      detail={detail}
    >
      <StateAction
        label={connectLabel}
        href={connectHref}
        onClick={onConnect}
        primary
      />
      {secondaryLabel &&
      (secondaryHref || onSecondary) ? (
        <StateAction
          label={secondaryLabel}
          href={secondaryHref}
          onClick={onSecondary}
          primary={false}
        />
      ) : null}
    </Shell>
  );
}
