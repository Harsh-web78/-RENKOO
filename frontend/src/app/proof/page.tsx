'use client';

/*
 * RENKOO — Proof Cards (proof of impact).
 *
 * Every card answers: what changed, when, before vs after, and what
 * revenue was recorded — using stored workspace evidence only.
 * Missing evidence renders as "waiting / not enough data", never as
 * invented impact. Revenue is customer-recorded, never attributed.
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import Panel from '@/components/ui/Panel';
import {
  EmptyState,
  ErrorState,
  InsufficientHistoryState,
  LoadingBlock,
} from '@/components/ui/states';
import {
  getProofCards,
  getWebsites,
  type ProofCard,
  type ProofMetric,
  type ProofState,
  type Website,
} from '@/lib/api';

const STATE_META: Record<
  ProofState,
  { label: string; className: string }
> = {
  WAITING_FOR_DATA: {
    label: 'Waiting for data',
    className:
      'bg-amber-50 text-amber-800 border border-amber-200',
  },
  EARLY_SIGNAL: {
    label: 'Early signal',
    className:
      'bg-sky-50 text-sky-800 border border-sky-200',
  },
  MEASURABLE_IMPACT: {
    label: 'Measurable change',
    className:
      'bg-emerald-50 text-emerald-800 border border-emerald-200',
  },
  MIXED_RESULTS: {
    label: 'Mixed results',
    className:
      'bg-violet-50 text-violet-800 border border-violet-200',
  },
  NO_CLEAR_CHANGE: {
    label: 'No clear change',
    className:
      'bg-slate-100 text-slate-700 border border-slate-200',
  },
  INSUFFICIENT_DATA: {
    label: 'Not enough data yet',
    className:
      'bg-slate-100 text-slate-600 border border-dashed border-slate-300',
  },
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
}

function formatValue(
  metric: ProofMetric,
  value: number | null,
): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  if (
    metric.key === 'mentionRate' ||
    metric.key === 'citationRate'
  ) {
    return `${value.toFixed(1)}%`;
  }
  if (
    metric.key === 'revenue' ||
    metric.key === 'leadValue'
  ) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
  }
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toFixed(1);
}

function formatDelta(metric: ProofMetric): string {
  if (
    metric.delta === null ||
    !Number.isFinite(metric.delta)
  ) {
    return 'No comparable change';
  }
  const abs =
    metric.key === 'mentionRate' ||
    metric.key === 'citationRate'
      ? `${Math.abs(metric.delta).toFixed(1)} percentage points`
      : Math.abs(metric.delta).toLocaleString(undefined, {
          maximumFractionDigits: 1,
        });
  const dirWord =
    metric.direction === 'flat'
      ? 'No change'
      : metric.direction === 'up'
        ? `+${abs}`
        : `−${abs}`;
  if (
    metric.pct !== null &&
    Number.isFinite(metric.pct)
  ) {
    const sign = metric.pct > 0 ? '+' : '';
    return `${dirWord} (${sign}${metric.pct}%)`;
  }
  return dirWord;
}

function MetricRow({
  metric,
}: {
  metric: ProofMetric;
}) {
  const Icon =
    metric.direction === 'up'
      ? TrendingUp
      : metric.direction === 'down'
        ? TrendingDown
        : Minus;
  const tone = metric.improved
    ? 'text-emerald-700'
    : metric.declined
      ? 'text-rose-700'
      : 'text-slate-500';

  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-3 last:border-b-0">
      <div>
        <p className="text-[13px] font-bold text-rk-ink">
          {metric.label}
        </p>
        <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-rk-secondary">
          {formatValue(metric, metric.before)}
          {' → '}
          {formatValue(metric, metric.after)}
        </p>
      </div>
      <div
        className={`flex shrink-0 items-center gap-1.5 text-[13px] font-bold tabular-nums ${tone}`}
      >
        <Icon size={15} aria-hidden />
        <span>{formatDelta(metric)}</span>
      </div>
    </div>
  );
}

function ProofCardView({
  card,
}: {
  card: ProofCard;
}) {
  const meta = STATE_META[card.state];

  return (
    <article
      aria-label={`Proof card: ${card.title}`}
      className="rk-card overflow-hidden"
    >
      <div className="border-b border-rk-border bg-rk-soft px-5 py-3">
        <p className="rk-label">Proof of impact</p>
        <h2 className="mt-1 text-[17px] font-extrabold tracking-[-0.01em] text-rk-ink">
          {card.title}
        </h2>
        <p className="rk-metadata mt-1">
          {card.websiteName ?? card.websiteUrl ?? 'Website'}{' '}
          · Completed{' '}
          {formatDate(card.completedAt)}
          {card.recommendationTitle
            ? ` · From recommendation: ${card.recommendationTitle}`
            : ''}
        </p>
      </div>

      <div className="px-5 py-4">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${meta.className}`}
        >
          {meta.label}
        </span>
        {card.stateReason ? (
          <p className="mt-2 text-[13px] leading-6 text-rk-secondary">
            {card.stateReason}
          </p>
        ) : null}

        {card.metrics.length > 0 ? (
          <div className="mt-3">
            <p className="rk-field-label">
              What changed · recorded during the
              comparison window
            </p>
            <div className="mt-1">
              {card.metrics.map((metric) => (
                <MetricRow
                  key={metric.key}
                  metric={metric}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <InsufficientHistoryState
              title="Waiting for enough data"
              description="Your action is complete. RENKOO is waiting for enough comparable evidence to measure the result — nothing is estimated in the meantime."
            />
          </div>
        )}

        {card.revenueNote ? (
          <p className="mt-3 rounded-rk-md bg-rk-soft px-3 py-2 text-[12px] leading-5 text-rk-secondary">
            {card.revenueNote}
          </p>
        ) : null}

        {card.evidence.searchTraffic.state ===
        'SEE_SEARCH_VISIBILITY' ? (
          <p className="mt-3 text-[12px] font-medium text-rk-secondary">
            Search traffic lives in{' '}
            <Link
              href="/search-visibility"
              className="font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
            >
              Search Visibility
            </Link>{' '}
            (Google-connected data is compared
            there, not estimated here).
          </p>
        ) : card.evidence.searchTraffic.state ===
          'NOT_CONNECTED' ? (
          <p className="mt-3 text-[12px] font-medium text-rk-secondary">
            Google Search Console is not connected —{' '}
            <Link
              href="/integrations"
              className="font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
            >
              connect Google
            </Link>{' '}
            to measure search traffic alongside
            this proof.
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default function ProofPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [cards, setCards] = useState<ProofCard[]>(
    [],
  );
  const [websites, setWebsites] = useState<
    Website[]
  >([]);
  const [websiteFilter, setWebsiteFilter] =
    useState<string>('ALL');
  const [nextCursor, setNextCursor] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] =
    useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (
      websiteId: string,
      cursor?: string,
      append = false,
    ) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
          setError('');
        }
        const data = await getProofCards({
          websiteId:
            websiteId === 'ALL'
              ? undefined
              : websiteId,
          take: 10,
          cursorId: cursor,
        });
        setCards((current) =>
          append
            ? [
                ...current,
                ...(data?.cards ?? []),
              ]
            : (data?.cards ?? []),
        );
        setNextCursor(data?.nextCursorId ?? null);
      } catch (err: any) {
        if (!append) {
          setError(
            err?.message ||
              'Failed to load proof cards',
          );
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    getWebsites()
      .then((sites) => {
        if (Array.isArray(sites)) {
          setWebsites(sites);
        }
      })
      .catch(() => undefined);
    const selected = window.localStorage.getItem(
      'renkoo_website_id',
    );
    const initial = selected ?? 'ALL';
    setWebsiteFilter(initial);
    load(initial);
  }, [load]);

  function changeWebsite(id: string) {
    setWebsiteFilter(id);
    setNextCursor(null);
    if (id !== 'ALL') {
      window.localStorage.setItem(
        'renkoo_website_id',
        id,
      );
    }
    load(id);
  }

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <Panel
        eyebrow="Proof of impact"
        title="What was this fix actually worth?"
        description="Completed actions compared against stored before/after evidence. Only measured signals are shown — the rest waits for data."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label
            htmlFor="proof-website"
            className="rk-field-label"
          >
            Website
          </label>
          <select
            id="proof-website"
            value={websiteFilter}
            onChange={(event) =>
              changeWebsite(event.target.value)
            }
            className="rk-focusable h-10 rounded-rk-md border border-rk-border bg-white px-3 text-sm font-semibold text-rk-ink"
          >
            <option value="ALL">
              All websites
            </option>
            {websites.map((site) => (
              <option
                key={site.id}
                value={site.id}
              >
                {site.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <LoadingBlock title="Assembling proof from stored evidence…" />
        ) : error && cards.length === 0 ? (
          <ErrorState
            title="Proof cards unavailable"
            description={error}
            onRetry={() => load(websiteFilter)}
          />
        ) : cards.length === 0 ? (
          <EmptyState
            title="Your proof starts here."
            description="Complete a recommended growth action and RENKOO will track what changed afterward. Nothing is shown until a real action is completed — no demo results."
            actionLabel="View actions"
            actionHref="/actions"
          />
        ) : (
          <div className="space-y-4">
            {cards.map((card) => (
              <ProofCardView
                key={card.actionId}
                card={card}
              />
            ))}
            {nextCursor ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() =>
                  load(
                    websiteFilter,
                    nextCursor,
                    true,
                  )
                }
                className="rk-focusable inline-flex h-11 items-center gap-2 rounded-rk-md border border-rk-strong bg-white px-5 text-sm font-bold text-rk-ink hover:bg-rk-soft disabled:opacity-50"
              >
                {loadingMore
                  ? 'Loading…'
                  : 'Load more proof'}
                <ArrowRight
                  size={15}
                  aria-hidden
                />
              </button>
            ) : null}
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
