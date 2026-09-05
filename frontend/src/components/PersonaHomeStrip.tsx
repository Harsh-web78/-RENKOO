'use client';

/*
 * Persona home strip: role-aware prioritization
 * header for the Growth Command Center. Shows the
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
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
              <Sparkles size={12} aria-hidden />
              {loading
                ? 'Your focus'
                : `${meta.label} focus`}
            </span>

            {!loading && source === 'default' && (
              <span className="text-xs text-slate-400">
                Suggested for your workspace
                role
              </span>
            )}
          </div>

          <h2 className="mt-3 text-xl font-bold text-slate-900 lg:text-2xl">
            {meta.question}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {meta.tagline} Prioritized from
            your live workspace data below —
            nothing here is sampled or
            simulated.
          </p>

          {goalMissing && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
                className="mt-2 inline-flex items-center gap-1 font-semibold text-amber-900 underline underline-offset-2"
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
              className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-slate-900"
            >
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {action.label}
                </span>
                <span className="block text-xs text-slate-500">
                  {action.detail}
                </span>
              </span>
              <ArrowRight
                size={16}
                aria-hidden
                className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-900"
              />
            </Link>
          ))}
        </div>
      </div>

      {!loading &&
        !persona &&
        source === 'default' &&
        !nudgeDismissed && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing the{' '}
              <strong>{meta.label}</strong>{' '}
              view. Tell us your role for a
              sharper focus.
            </p>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/settings"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Choose my role
              </Link>
              <button
                type="button"
                onClick={dismissNudge}
                aria-label="Dismiss role suggestion"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
    </section>
  );
}
