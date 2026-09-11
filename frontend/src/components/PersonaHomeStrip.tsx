'use client';

/*
 * Persona home strip: role-aware prioritization
 * header for the dashboard. Shows the
 * persona's guiding question, navigation-only
 * quick actions (real screens), and a Business
 * Brain missing-goal nudge when the goal is
 * genuinely unset. No data is fabricated: every
 * block renders from loaded state or not at all.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

import {
  PERSONA_META,
  QUICK_ACTIONS,
  usePersona,
} from '@/lib/persona';
import {
  getBusinessContext,
  type BusinessContext,
} from '@/lib/api';

const NUDGE_KEY = 'renkoo_persona_nudge';

export default function PersonaHomeStrip({
  websiteId,
}: {
  websiteId: string | null;
}) {
  const {
    effectivePersona,
    persona,
    source,
    loading,
  } = usePersona();

  const meta = PERSONA_META[effectivePersona];
  const actions =
    QUICK_ACTIONS[effectivePersona] ?? [];

  const [context, setContext] =
    useState<BusinessContext | null>(null);

  const [nudgeDismissed, setNudgeDismissed] =
    useState(true);

  useEffect(() => {
    try {
      setNudgeDismissed(
        window.localStorage.getItem(NUDGE_KEY) ===
          '1',
      );
    } catch {
      setNudgeDismissed(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    if (!websiteId) {
      setContext(null);
      return;
    }

    getBusinessContext(websiteId)
      .then((data) => {
        if (mounted) setContext(data);
      })
      .catch(() => {
        if (mounted) setContext(null);
      });

    return () => {
      mounted = false;
    };
  }, [websiteId]);

  const goalMissing =
    context !== null &&
    !context.profile?.primaryGoal;

  function dismissNudge() {
    try {
      window.localStorage.setItem(
        NUDGE_KEY,
        '1',
      );
    } catch {
      // Dismissal is best-effort only.
    }

    setNudgeDismissed(true);
  }

  return (
    <section
      aria-label={`${meta.label} focus`}
      className="overflow-hidden rounded-rk-lg border border-rk-border bg-rk-surface p-5 shadow-rk-sm sm:p-6"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rk-ink px-3 py-1 text-xs font-bold text-white">
              <Sparkles size={12} aria-hidden />
              {loading
                ? 'Your focus'
                : `${meta.label} focus`}
            </span>

            {!loading && source === 'default' && (
              <span className="rk-metadata">
                Suggested for your workspace role
              </span>
            )}
          </div>

          <h2 className="mt-3 text-xl font-extrabold tracking-[-0.02em] text-rk-ink lg:text-[22px]">
            {meta.question}
          </h2>

          <p className="mt-1 max-w-xl text-sm leading-6 text-rk-secondary">
            {meta.tagline} Prioritized from
            your live workspace data below —
            nothing here is sampled or
            simulated.
          </p>

          {goalMissing && (
            <div className="mt-4 rounded-rk-md border border-rk-warning/30 bg-rk-warningSoft px-4 py-3 text-sm text-rk-ink">
              <p className="font-semibold">
                Your primary growth goal
                isn&apos;t configured yet.
              </p>
              <p className="mt-1">
                Set your goal to make
                recommendations more
                relevant.
              </p>
              <Link
                href="/business-brain"
                className="rk-focusable mt-2 inline-flex items-center gap-1 font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
              >
                Open Business Brain
                <ArrowRight
                  size={14}
                  aria-hidden
                />
              </Link>
            </div>
          )}
        </div>

        <div className="grid w-full shrink-0 gap-2 sm:grid-cols-2 lg:w-[340px] lg:grid-cols-1">
          {actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="rk-focusable group flex items-center justify-between gap-3 rounded-rk-md border border-rk-border bg-white px-4 py-3 shadow-rk-sm transition-all hover:border-rk-strong hover:shadow-rk-md"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-rk-ink">
                  {action.label}
                </span>
                <span className="block truncate text-xs text-rk-secondary">
                  {action.detail}
                </span>
              </span>
              <ArrowRight
                size={16}
                aria-hidden
                className="shrink-0 text-rk-muted transition group-hover:translate-x-0.5 group-hover:text-rk-ink"
              />
            </Link>
          ))}
        </div>
      </div>

      {!loading &&
        !persona &&
        source === 'default' &&
        !nudgeDismissed && (
          <div className="mt-4 flex flex-col gap-2 rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3 text-sm text-rk-secondary sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing the{' '}
              <strong className="text-rk-ink">{meta.label}</strong>{' '}
              view. Tell us your role for a
              sharper focus.
            </p>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/settings"
                className="rk-focusable rounded-rk-sm bg-rk-ink px-3 py-1.5 text-xs font-bold text-white"
              >
                Choose my role
              </Link>
              <button
                type="button"
                onClick={dismissNudge}
                aria-label="Dismiss role suggestion"
                className="rk-focusable rounded-rk-sm border border-rk-border bg-rk-surface px-3 py-1.5 text-xs font-bold text-rk-ink hover:bg-white"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
    </section>
  );
}
