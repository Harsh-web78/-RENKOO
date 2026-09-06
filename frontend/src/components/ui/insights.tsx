'use client';

/*
 * RENKOO V2 — shared insight primitives.
 * Narrative building blocks for the product loop:
 *
 *   WHAT CHANGED → WHY → OPPORTUNITY → ACTION → OUTCOME
 *
 * InsightBlock frames a change, ChangeIndicator states the
 * delta, EvidenceList shows proof with sources,
 * ConfidenceIndicator states certainty, RecommendationCallout
 * states the suggested move, NextAction links to the real
 * screen that executes it. No page-specific business logic
 * lives here — every block renders real data passed in via
 * props. Deltas always pair direction icons with text and
 * semantic tone, never color alone.
 */

import Link from 'next/link';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  Minus,
  Quote,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

/* WHAT CHANGED → WHY wrapper. */
export function InsightBlock({
  eyebrow,
  title,
  change,
  cause,
  children,
}: {
  eyebrow: string;
  title: string;
  change?: React.ReactNode;
  cause?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-rk-lg border border-rk-border bg-rk-surface p-5 shadow-rk-sm"
    >
      <p className="rk-label">{eyebrow}</p>
      <h3 className="rk-section-title mt-1">
        {title}
      </h3>
      {change ? (
        <div className="mt-2">{change}</div>
      ) : null}
      {cause ? (
        <p className="mt-2 text-sm leading-6 text-rk-secondary">
          <strong className="font-semibold text-rk-ink">
            Why:{' '}
          </strong>
          {cause}
        </p>
      ) : null}
      {children ? (
        <div className="mt-3">{children}</div>
      ) : null}
    </section>
  );
}

/* Delta with direction icon + text + tone. */
export function ChangeIndicator({
  value,
  direction,
  tone = 'neutral',
  label,
  invert = false,
}: {
  value: string;
  direction: 'up' | 'down' | 'flat';
  tone?: 'positive' | 'negative' | 'neutral';
  label?: string;
  /**
   * Set when "down" is good (e.g. errors fixed, cost down).
   * Keeps semantics honest instead of hard-coding up=good.
   */
  invert?: boolean;
}) {
  const effective: 'positive' | 'negative' | 'neutral' =
    tone === 'neutral'
      ? 'neutral'
      : invert
        ? tone === 'positive'
          ? 'negative'
          : 'positive'
        : tone;

  const Icon =
    direction === 'up'
      ? ArrowUpRight
      : direction === 'down'
        ? ArrowDownRight
        : Minus;

  const toneClass =
    effective === 'positive'
      ? 'bg-rk-successSoft text-rk-success'
      : effective === 'negative'
        ? 'bg-rk-dangerSoft text-rk-danger'
        : 'bg-rk-soft text-rk-secondary';

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-rk-md px-2 py-1 text-xs font-bold tabular-nums ${toneClass}`}
    >
      <Icon size={14} aria-hidden />
      {value}
      {label ? (
        <span className="font-semibold">{label}</span>
      ) : null}
      <span className="sr-only">
        {effective === 'neutral'
          ? 'No significant change.'
          : effective === 'positive'
            ? 'Positive change.'
            : 'Negative change.'}
      </span>
    </span>
  );
}

/* Proof with sources — every item names where it came from. */
export function EvidenceList({
  items,
}: {
  items: Array<{
    text: string;
    source?: string;
    href?: string;
  }>;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-2">
      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-2 text-sm leading-6 text-rk-ink"
        >
          <Quote
            size={14}
            aria-hidden
            className="mt-1 shrink-0 text-rk-muted"
          />
          <span className="min-w-0">
            {item.text}{' '}
            {item.source ? (
              item.href ? (
                <Link
                  href={item.href}
                  className="rk-focusable font-semibold text-rk-info underline underline-offset-2"
                >
                  {item.source}
                </Link>
              ) : (
                <span className="rk-metadata">
                  — {item.source}
                </span>
              )
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* Certainty, stated plainly with icon + text. */
export function ConfidenceIndicator({
  level,
  reason,
}: {
  level: 'high' | 'medium' | 'low';
  reason?: string;
}) {
  const Icon =
    level === 'high'
      ? ShieldCheck
      : level === 'medium'
        ? CheckCircle2
        : level === 'low'
          ? ShieldAlert
          : HelpCircle;

  const toneClass =
    level === 'high'
      ? 'bg-rk-successSoft text-rk-success'
      : level === 'medium'
        ? 'bg-rk-infoSoft text-rk-info'
        : 'bg-rk-warningSoft text-rk-warning';

  const label =
    level === 'high'
      ? 'High confidence'
      : level === 'medium'
        ? 'Medium confidence'
        : 'Low confidence';

  return (
    <span className="inline-flex max-w-full items-start gap-2">
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-rk-sm border border-rk-border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${toneClass}`}
      >
        <Icon size={11} aria-hidden />
        {label}
      </span>
      {reason ? (
        <span className="rk-metadata min-w-0">
          {reason}
        </span>
      ) : null}
    </span>
  );
}

/* The suggested move, with an optional real action. */
export function RecommendationCallout({
  title = 'Recommended next step',
  text,
  actionLabel,
  actionHref,
  onAction,
}: {
  title?: string;
  text: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-rk-md border border-rk-info/30 bg-rk-infoSoft/50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-rk-ink">
        <Lightbulb
          size={15}
          aria-hidden
          className="shrink-0 text-rk-info"
        />
        {title}
      </p>
      <p className="mt-1 text-sm leading-6 text-rk-ink">
        {text}
      </p>
      {actionLabel &&
      (actionHref || onAction) ? (
        actionHref ? (
          <Link
            href={actionHref}
            className="rk-focusable mt-2 inline-flex items-center gap-1 text-sm font-bold text-rk-info underline underline-offset-2"
          >
            {actionLabel}
            <ArrowRight
              size={14}
              aria-hidden
            />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onAction}
            className="rk-focusable mt-2 inline-flex items-center gap-1 text-sm font-bold text-rk-info underline underline-offset-2"
          >
            {actionLabel}
            <ArrowRight size={14} aria-hidden />
          </button>
        )
      ) : null}
    </div>
  );
}

/* Link card to the real screen that executes the work. */
export function NextAction({
  label,
  detail,
  href,
}: {
  label: string;
  detail?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rk-focusable group flex items-center justify-between gap-3 rounded-rk-md border border-rk-border px-4 py-3 transition-colors hover:border-rk-strong"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-rk-ink">
          {label}
        </span>
        {detail ? (
          <span className="block truncate text-xs text-rk-secondary">
            {detail}
          </span>
        ) : null}
      </span>
      <ArrowRight
        size={16}
        aria-hidden
        className="shrink-0 text-rk-muted transition-transform group-hover:translate-x-0.5 group-hover:text-rk-ink"
      />
    </Link>
  );
}
