'use client';

import AppShell from '@/components/AppShell';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  askIntelligence,
  createIntelligenceAction,
  getWebsites,
  Website,
  IntelligenceResponse,
  IntelligenceOpportunity,
} from '@/lib/api';
import {
  INTELLIGENCE_PROMPTS,
  PERSONA_META,
  usePersona,
} from '@/lib/persona';

const QUICK_QUESTIONS = [
  'What changed?',
  'What should I fix first?',
  'Where am I losing visibility?',
  'Which competitor is ahead?',
  'What is hurting growth?',
  'Show my top opportunities.',
];

type Message =
  | { kind: 'user'; text: string }
  | {
      kind: 'answer';
      response: IntelligenceResponse;
    }
  | { kind: 'error'; text: string };

export default function AgentsPage() {
  const [open, setOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionMap, setActionMap] = useState<
    Record<string, { loading: boolean; done: boolean }>
  >({});
  const [actionErrors, setActionErrors] = useState<
    Record<string, string>
  >({});
  const bottomRef = useRef<HTMLDivElement | null>(null);

  /*
   * Persona-suggested questions reuse the same
   * ask pipeline and evidence rules — they are
   * shortcuts, not a separate AI system.
   */
  const { effectivePersona } = usePersona();
  const personaPrompts =
    INTELLIGENCE_PROMPTS[effectivePersona] ??
    [];

  useEffect(() => {
    async function init() {
      try {
        const sites = await getWebsites();
        const list = Array.isArray(sites) ? sites : [];
        setWebsites(list);

        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem('renkoo_website_id')
            : null;
        const valid =
          stored && list.some((site) => site.id === stored)
            ? stored
            : list[0]?.id || '';
        setWebsiteId(valid || '');

        if (list.length === 0) {
          setLoadError('No website found. Add a website first.');
        }
      } catch (err: any) {
        setLoadError(
          err?.message || 'Failed to load websites.',
        );
      }
    }

    void init();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages, asking]);

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    setMessages([]);

    if (typeof window !== 'undefined') {
      localStorage.setItem('renkoo_website_id', id);
    }
  }

  async function ask(question: string) {
    const text = question.trim();

    if (!text || !websiteId || asking) return;

    setMessages((prev) => [
      ...prev,
      { kind: 'user', text },
    ]);
    setInput('');
    setAsking(true);

    try {
      const response = await askIntelligence(
        websiteId,
        text,
      );
      setMessages((prev) => [
        ...prev,
        { kind: 'answer', response },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          kind: 'error',
          text:
            err?.message ||
            'Intelligence request failed.',
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  async function handleCreateAction(
    opportunity: IntelligenceOpportunity,
  ) {
    const key = opportunity.id;
    const state = actionMap[key];

    if (state?.loading || state?.done) return;

    try {
      setActionMap((prev) => ({
        ...prev,
        [key]: { loading: true, done: false },
      }));
      setActionErrors((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });

      if (opportunity.recommendationId) {
        await createIntelligenceAction({
          websiteId,
          recommendationId:
            opportunity.recommendationId,
        });
      } else {
        await createIntelligenceAction({
          websiteId,
          opportunityId: opportunity.id,
        });
      }

      setActionMap((prev) => ({
        ...prev,
        [key]: { loading: false, done: true },
      }));
    } catch (err: any) {
      setActionMap((prev) => ({
        ...prev,
        [key]: { loading: false, done: false },
      }));
      setActionErrors((prev) => ({
        ...prev,
        [key]:
          err?.message ||
          'Could not create an action from this item.',
      }));
    }
  }

  return (
    <AppShell
      mobileOpen={open}
      onClose={() => setOpen(false)}
      onMenu={() => setOpen(true)}
    >
      <section className="mx-auto max-w-[1150px] p-5 lg:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-rk-secondary">
                RENKOO Intelligence
              </div>
              <h1 className="mt-1 text-3xl font-bold">
                Ask your growth system
              </h1>
              <p className="mt-2 max-w-xl text-sm text-rk-secondary">
                Deterministic answers from your connected RENKOO
                data — never invented, always sourced. No LLM
                provider is configured.
              </p>
            </div>

            <select
              value={websiteId}
              onChange={(e) =>
                handleWebsiteChange(e.target.value)
              }
              disabled={websites.length === 0}
              className="max-w-xs rounded-rk-md border border-rk-border bg-white px-3 py-2.5 text-sm font-semibold outline-none disabled:opacity-60"
            >
              {websites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          {loadError && (
            <div className="mt-5 rounded-rk-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {loadError}
            </div>
          )}

          <div className="mt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-rk-muted">
              Suggested for{' '}
              {
                PERSONA_META[effectivePersona]
                  .label
              }
            </p>
            <div className="flex flex-wrap gap-2">
              {personaPrompts.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={!websiteId || asking}
                  onClick={() => ask(question)}
                  className="rounded-full border border-rk-ink bg-rk-ink px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                disabled={!websiteId || asking}
                onClick={() => ask(question)}
                className="rounded-full border border-rk-border bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-rk-ink hover:text-rk-ink disabled:opacity-60"
              >
                {question}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            {messages.length === 0 && (
              <div className="rounded-rk-lg border border-dashed border-rk-border bg-white p-10 text-center">
                <p className="text-sm font-bold text-slate-800">
                  No questions yet
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-rk-secondary">
                  Ask about changes, priorities, competitors, AI
                  visibility, actions, or growth blockers. Every
                  answer cites the RENKOO records behind it.
                </p>
              </div>
            )}

            {messages.map((message, index) => {
              if (message.kind === 'user') {
                return (
                  <div
                    key={index}
                    className="ml-auto max-w-[85%] rounded-rk-lg rounded-br-sm bg-rk-ink px-4 py-3 text-sm font-medium text-white"
                  >
                    {message.text}
                  </div>
                );
              }

              if (message.kind === 'error') {
                return (
                  <div
                    key={index}
                    className="rounded-rk-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                  >
                    {message.text}
                  </div>
                );
              }

              return (
                <AnswerCard
                  key={index}
                  response={message.response}
                  actionMap={actionMap}
                  actionErrors={actionErrors}
                  onCreateAction={handleCreateAction}
                />
              );
            })}

            {asking && (
              <div className="rounded-rk-lg border border-rk-border bg-white px-4 py-3 text-sm text-rk-secondary">
                Reading your RENKOO data...
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
            className="sticky bottom-4 mt-5 flex gap-2 rounded-rk-lg border border-rk-border bg-white p-2 shadow-lg"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                websiteId
                  ? 'Ask about your growth data...'
                  : 'Select a website first...'
              }
              disabled={!websiteId || asking}
              maxLength={2000}
              className="flex-1 rounded-rk-md px-3 py-2.5 text-sm outline-none disabled:bg-rk-soft"
            />
            <button
              type="submit"
              disabled={!websiteId || asking || !input.trim()}
              className="rounded-rk-md bg-rk-ink px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
            >
              Ask
            </button>
          </form>

          <p className="mt-3 text-xs leading-5 text-rk-muted">
            Stored website and competitor text is treated as data
            and can never override RENKOO rules or cross workspace
            boundaries. Action buttons only create tracked tasks —
            RENKOO never changes your website by itself.
          </p>
        </section>
    </AppShell>
  );
}

function AnswerCard({
  response,
  actionMap,
  actionErrors,
  onCreateAction,
}: {
  response: IntelligenceResponse;
  actionMap: Record<
    string,
    { loading: boolean; done: boolean }
  >;
  actionErrors: Record<string, string>;
  onCreateAction: (
    opportunity: IntelligenceOpportunity,
  ) => void;
}) {
  const availabilityEntries = Object.entries(
    response.dataAvailability ?? {},
  );

  return (
    <div className="rounded-rk-lg border border-rk-border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-rk-ink px-2.5 py-1 text-[11px] font-bold text-white">
          {formatLabel(response.intent)}
        </span>
        <ConfidenceBadge confidence={response.confidence} />
        <span className="text-xs text-rk-muted">
          {response.answerSource}
        </span>
      </div>

      {response.businessPriority && (
        <p className="mt-3 text-xs font-semibold text-rk-secondary">
          Business priority: {response.businessPriority}
        </p>
      )}

      <div className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-800">
        {response.answer}
      </div>

      {response.keySignals.length > 0 && (
        <div className="mt-4">
          <SectionTitle title="Key signals" />
          <ul className="mt-1.5 space-y-1.5">
            {response.keySignals.map((signal, i) => (
              <li
                key={i}
                className="text-sm leading-6 text-slate-700"
              >
                · {signal}
              </li>
            ))}
          </ul>
        </div>
      )}

      {response.evidence.length > 0 && (
        <div className="mt-4">
          <SectionTitle title={`Evidence (${response.evidence.length})`} />
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-rk-border uppercase tracking-wide text-rk-muted">
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2">Metric</th>
                  <th className="px-2 py-2">Value</th>
                  <th className="px-2 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {response.evidence.map((item, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-2 py-2 font-bold text-slate-700">
                      {formatLabel(item.source)}
                    </td>
                    <td className="px-2 py-2 text-slate-600">
                      {formatLabel(item.metric)}
                    </td>
                    <td className="px-2 py-2 font-semibold tabular-nums text-rk-ink">
                      {formatEvidenceValue(item)}
                    </td>
                    <td className="max-w-[280px] px-2 py-2 text-rk-secondary">
                      {[item.entity, item.note]
                        .filter(Boolean)
                        .join(' — ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {response.why.length > 0 && (
        <div className="mt-4 rounded-rk-md border-l-2 border-rk-ink bg-rk-soft px-4 py-3">
          <SectionTitle title="Why — correlation only" />
          <ul className="mt-1.5 space-y-1">
            {response.why.map((reason, i) => (
              <li
                key={i}
                className="text-xs leading-5 text-slate-700"
              >
                · {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {response.opportunities.length > 0 && (
        <div className="mt-4">
          <SectionTitle
            title={`Linked opportunities (${response.opportunities.length})`}
          />
          <div className="mt-2 space-y-2">
            {response.opportunities.map((opp) => {
              const state = actionMap[opp.id];
              const createError = actionErrors[opp.id];

              return (
                <div
                  key={opp.id}
                  className="flex flex-col gap-2 rounded-rk-md border border-rk-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-rk-ink">
                      {opp.title}
                    </div>
                    <div className="mt-0.5 text-xs text-rk-muted">
                      {opp.priority} · score {opp.score} ·{' '}
                      {formatLabel(opp.source)}
                    </div>
                    {createError && (
                      <p
                        role="alert"
                        className="mt-1 text-xs font-semibold text-red-600"
                      >
                        {createError}
                      </p>
                    )}
                    {state?.done && (
                      <Link
                        href="/actions"
                        className="mt-1 inline-block text-xs font-bold text-emerald-700 underline hover:text-emerald-900"
                      >
                        View in Actions
                      </Link>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={state?.loading || state?.done}
                    onClick={() => onCreateAction(opp)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                      state?.done
                        ? 'cursor-default bg-emerald-50 text-emerald-700'
                        : 'bg-rk-ink text-white hover:opacity-90 disabled:opacity-60'
                    }`}
                  >
                    {state?.loading
                      ? 'Adding...'
                      : state?.done
                        ? 'Added'
                        : 'Add to Actions'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {response.suggestedActions.length > 0 && (
        <div className="mt-4">
          <SectionTitle title="Suggested next steps" />
          <ul className="mt-1.5 space-y-1">
            {response.suggestedActions.map((step, i) => (
              <li
                key={i}
                className="text-xs leading-5 text-slate-600"
              >
                {i + 1}. {step}
              </li>
            ))}
          </ul>
        </div>
      )}

      {availabilityEntries.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {availabilityEntries.map(([source, state]) => (
            <span
              key={source}
              title={state}
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                state === 'AVAILABLE'
                  ? 'bg-emerald-50 text-emerald-700'
                  : state === 'NOT_CONNECTED'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-rk-soft text-rk-secondary'
              }`}
            >
              {formatLabel(source)}: {formatLabel(state)}
            </span>
          ))}
        </div>
      )}

      {response.limitations.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-rk-muted">
          Limits: {response.limitations.join(' ')}
        </p>
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider text-rk-muted">
      {title}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const value = String(confidence || '').toUpperCase();
  const styles =
    value === 'HIGH'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'MEDIUM'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-rk-soft text-rk-secondary';

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles}`}
      title="Confidence reflects available RENKOO evidence, not model certainty."
    >
      {value || '—'} confidence
    </span>
  );
}

function formatEvidenceValue(item: {
  value?: string | number | null;
  previousValue?: string | number | null;
  currentValue?: string | number | null;
  change?: string | number | null;
}) {
  if (
    item.previousValue !== undefined &&
    item.previousValue !== null &&
    item.currentValue !== undefined &&
    item.currentValue !== null
  ) {
    const change =
      item.change !== undefined && item.change !== null
        ? ` (${typeof item.change === 'number' && item.change > 0 ? '+' : ''}${item.change})`
        : '';
    return `${item.previousValue} → ${item.currentValue}${change}`;
  }

  return item.value ?? '—';
}

function formatLabel(value: unknown) {
  return String(value || '—')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
