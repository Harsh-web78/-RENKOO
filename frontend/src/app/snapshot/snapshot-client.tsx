'use client';

/*
 * RENKOO public AI Visibility Snapshot — client flow.
 * Input → honest loading (staged messages, no fake percentages) →
 * evidence-first results → deterministic insight → signup CTA.
 * Only measured snapshot evidence is shown; everything else is
 * labeled unavailable or not tested.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  MinusCircle,
  XCircle,
} from 'lucide-react';
import {
  rememberSnapshotDomain,
  runSnapshot,
  type SnapshotReport,
  type SnapshotResultItem,
} from '@/lib/snapshot';
import { ErrorState } from '@/components/ui/states';

const LOADING_STEPS = [
  'Checking your domain…',
  'Testing AI responses…',
  'Comparing brand mentions…',
  'Building your snapshot…',
];

const UNAVAILABLE_ENGINES: Array<{
  id: string;
  displayName: string;
  reason: string;
}> = [
  {
    id: 'PERPLEXITY',
    displayName: 'Perplexity',
    reason: 'Not connected.',
  },
  {
    id: 'ANTHROPIC',
    displayName: 'Claude',
    reason: 'Not connected.',
  },
  {
    id: 'GOOGLE_AI_SEARCH',
    displayName: 'Google AI Overviews / AI Search',
    reason: 'Not connected.',
  },
];

function MentionBadge({
  mentioned,
}: {
  mentioned: boolean | null;
}) {
  if (mentioned === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500">
        <MinusCircle size={15} aria-hidden />
        No result
      </span>
    );
  }
  if (mentioned) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-emerald-700">
        <CheckCircle2 size={15} aria-hidden />
        Mentioned
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-500">
      <XCircle size={15} aria-hidden />
      Not mentioned
    </span>
  );
}

function ResultCard({
  item,
}: {
  item: SnapshotResultItem;
}) {
  return (
    <div className="rounded-rk-md border border-rk-border bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-rk-ink">
          {item.providerDisplayName}{' '}
          <span className="font-medium text-rk-muted">
            · API result, not the consumer app
          </span>
        </p>
        <MentionBadge mentioned={item.mentioned} />
      </div>
      {item.error ? (
        <p className="mt-1.5 text-[13px] text-rk-secondary">
          {item.error}
        </p>
      ) : item.excerpt ? (
        <blockquote className="mt-1.5 border-l-2 border-rk-border-strong pl-3 text-[13px] leading-6 text-rk-secondary">
          “{item.excerpt}”
        </blockquote>
      ) : null}
    </div>
  );
}

export default function SnapshotClient() {
  const [domain, setDomain] = useState('');
  const [report, setReport] =
    useState<SnapshotReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<
    typeof setInterval
  > | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearInterval(timer.current);
      }
    };
  }, []);

  async function submit(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    const value = domain.trim();
    if (!value || loading) return;

    setLoading(true);
    setError('');
    setReport(null);
    setStep(0);
    timer.current = setInterval(() => {
      setStep((current) =>
        Math.min(
          current + 1,
          LOADING_STEPS.length - 1,
        ),
      );
    }, 4000);

    try {
      const data = await runSnapshot(value);
      setReport(data);
    } catch (err: any) {
      setError(
        err?.message ||
          'That domain could not be verified. Check the spelling and try again.',
      );
    } finally {
      if (timer.current) {
        clearInterval(timer.current);
        timer.current = null;
      }
      setLoading(false);
    }
  }

  const testedNames =
    report && report.enginesTested.length > 0
      ? report.enginesTested
          .map((id) =>
            id === 'GEMINI'
              ? 'Gemini'
              : id === 'OPENAI'
                ? 'OpenAI'
                : id,
          )
          .join(' and ')
      : 'the configured AI engines';

  const unavailable =
    report && report.enginesUnavailable.length > 0
      ? report.enginesUnavailable
      : UNAVAILABLE_ENGINES;

  const promptGroups =
    report?.prompts.map((prompt) => ({
      prompt,
      items: (report.results ?? []).filter(
        (r) => r.prompt === prompt,
      ),
    })) ?? [];

  const mentionInsight = (() => {
    if (!report?.summary) return null;
    const { mentionedCount, totalChecks } =
      report.summary;
    if (totalChecks === 0) return null;
    if (mentionedCount === totalChecks) {
      return 'Your brand appeared in every tested response.';
    }
    if (mentionedCount === 0) {
      return 'Your brand was not mentioned for these tested intents.';
    }
    return `Your brand appeared in ${mentionedCount} of ${totalChecks} tested responses.`;
  })();

  return (
    <section
      aria-labelledby="snapshot-heading"
      className="border-b border-rk-border bg-rk-bg"
    >
      <div className="mx-auto max-w-[1100px] px-5 pb-14 pt-12 sm:pt-16 lg:px-8">
        <p className="rk-label">
          Free AI Visibility Snapshot
        </p>
        <h1
          id="snapshot-heading"
          className="mt-2 max-w-2xl text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-rk-ink sm:text-[42px]"
        >
          See how your brand appears in AI
          answers.
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-7 text-rk-secondary">
          Run a free AI visibility snapshot
          across the AI engines RENKOO can
          currently test. Based on the prompts
          tested in this snapshot only.
        </p>

        <form
          onSubmit={submit}
          className="mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
        >
          <div className="flex-1">
            <label
              htmlFor="snapshot-domain"
              className="sr-only"
            >
              Enter your website domain
            </label>
            <input
              id="snapshot-domain"
              name="domain"
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder="acme.com"
              value={domain}
              onChange={(event) =>
                setDomain(event.target.value)
              }
              disabled={loading}
              className="rk-focusable h-12 w-full rounded-rk-md border border-rk-strong bg-white px-4 text-[15px] font-semibold text-rk-ink placeholder:text-rk-muted disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !domain.trim()}
            className="rk-focusable inline-flex h-12 items-center justify-center gap-2 rounded-rk-md bg-rk-ink px-7 text-[15px] font-bold text-white shadow-rk-md hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? 'Running…'
              : 'Run free snapshot'}
            {!loading && (
              <ArrowRight
                size={16}
                aria-hidden
              />
            )}
          </button>
        </form>
        <p className="rk-metadata mt-3">
          No signup required. Limited free
          snapshot — results depend on live AI
          availability.
        </p>

        {loading ? (
          <div
            role="status"
            aria-live="polite"
            className="rk-card mt-8 max-w-xl p-6"
          >
            <p className="text-[15px] font-bold text-rk-ink">
              {LOADING_STEPS[step]}
            </p>
            <p className="rk-metadata mt-1">
              Live checks can take up to a
              minute. Nothing is estimated —
              each engine result appears when
              it actually completes.
            </p>
          </div>
        ) : null}

        {error && !loading ? (
          <div className="mt-8 max-w-xl">
            <ErrorState
              title="Snapshot unavailable"
              description={error}
              onRetry={() => submit()}
            />
          </div>
        ) : null}

        {report && !loading ? (
          <div className="mt-10 max-w-3xl space-y-4">
            <div className="rk-card p-6">
              <p className="rk-label">
                AI visibility snapshot ·{' '}
                {report.normalizedDomain}
                {report.cached
                  ? ' · cached result'
                  : ''}
              </p>
              <p className="mt-2 text-[15px] leading-7 text-rk-secondary">
                Engines tested:{' '}
                <strong className="text-rk-ink">
                  {testedNames}
                </strong>{' '}
                (API results, not the consumer
                apps).
              </p>
              {report.summary ? (
                <p className="mt-3 text-[22px] font-extrabold tracking-[-0.02em] text-rk-ink">
                  {report.summary.note}
                </p>
              ) : null}
            </div>

            {promptGroups.map((group) => (
              <div
                key={group.prompt}
                className="rk-card p-6"
              >
                <p className="rk-field-label">
                  Prompt
                </p>
                <p className="mt-1 text-[15px] font-bold text-rk-ink">
                  “{group.prompt}”
                </p>
                <div className="mt-3 space-y-2.5">
                  {group.items.map((item) => (
                    <ResultCard
                      key={`${item.provider}-${item.prompt}`}
                      item={item}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="rk-card p-6">
              <p className="rk-field-label">
                Competitors observed
              </p>
              <p className="mt-1 text-[14px] leading-6 text-rk-secondary">
                No competitor claims are made
                from this snapshot. Competitor
                tracking requires a RENKOO
                workspace with tracked
                competitors.
              </p>
            </div>

            <div className="rk-card p-6">
              <p className="rk-field-label">
                Citations
              </p>
              <p className="mt-1 text-[14px] leading-6 text-rk-secondary">
                Not available from these live
                API checks. Provider text
                responses do not include source
                metadata.
              </p>
            </div>

            <div className="rk-card p-6">
              <p className="rk-field-label">
                Not tested
              </p>
              <ul className="mt-2 space-y-1.5">
                {unavailable.map((engine) => (
                  <li
                    key={engine.id}
                    className="text-[14px] font-medium text-rk-secondary"
                  >
                    <strong className="text-rk-ink">
                      {engine.displayName}
                    </strong>{' '}
                    — {engine.reason}
                  </li>
                ))}
              </ul>
              <p className="rk-metadata mt-3">
                This limited snapshot does not
                represent all AI answers,
                rankings, traffic, or Google AI
                Overviews.
              </p>
            </div>

            {mentionInsight ? (
              <div className="rk-card border-rk-strong p-6">
                <p className="rk-field-label">
                  What this means
                </p>
                <p className="mt-1 text-[15px] font-bold leading-7 text-rk-ink">
                  {mentionInsight}
                </p>
                <p className="mt-1 text-[14px] leading-6 text-rk-secondary">
                  Mentioned responses show the
                  exact evidence above. Gaps
                  are prompts worth tracking
                  over time — not proof of a
                  problem.
                </p>
              </div>
            ) : null}

            <div className="rk-card bg-rk-ink p-6 text-white">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/70">
                Next step
              </p>
              <p className="mt-2 text-[22px] font-extrabold tracking-[-0.02em]">
                Track your AI visibility
                continuously
              </p>
              <p className="mt-2 text-[14px] leading-6 text-white/80">
                Connect {report.normalizedDomain}{' '}
                to RENKOO to monitor AI
                visibility, find gaps, and turn
                opportunities into actions.
              </p>
              <Link
                href={`/signup?domain=${encodeURIComponent(report.normalizedDomain)}`}
                onClick={() =>
                  rememberSnapshotDomain(
                    report.normalizedDomain,
                  )
                }
                className="rk-focusable mt-4 inline-flex h-12 items-center gap-2 rounded-rk-md bg-white px-7 text-[15px] font-bold text-rk-ink hover:opacity-90"
              >
                Create free account
                <ArrowRight
                  size={16}
                  aria-hidden
                />
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
