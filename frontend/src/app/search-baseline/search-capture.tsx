'use client';

/*
 * SEARCH CAPTURE 1.0 (Phase 16) — zero-click + commercial
 * search intelligence section for the Search Baseline page.
 * Evidence-backed: visible ≠ clicked ≠ lead ≠ revenue.
 * Low CTR is never proven zero-click. Reuses shared UI
 * primitives; mobile-safe; loading/error/empty states.
 */

import { useEffect, useState } from 'react';
import { getSearchCapture } from '@/lib/api';
import {
  Panel,
  Metric,
  StatusChip,
  DataSourceBadge,
  LoadingBlock,
  ErrorState,
  EmptyState,
} from '@/components/ui';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function pct(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export default function SearchCapturePanel({
  websiteId,
  days,
}: {
  websiteId: string;
  days: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (!websiteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    getSearchCapture(websiteId, days)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: any) => {
        if (!cancelled)
          setError(
            err?.message || 'Search capture failed to load.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [websiteId, days]);

  if (loading)
    return (
      <Panel
        eyebrow="Search capture"
        title="Visibility → clicks → business value"
        description="Where search visibility fails to capture clicks or outcomes, and which commercial queries matter most."
      >
        <LoadingBlock title="Reading stored search evidence" />
      </Panel>
    );

  if (error)
    return (
      <Panel
        eyebrow="Search capture"
        title="Visibility → clicks → business value"
        description="Where search visibility fails to capture clicks or outcomes, and which commercial queries matter most."
      >
        <ErrorState
          title="Search capture failed to load"
          description={error}
          onRetry={() => {
            setLoading(true);
            setError('');
            getSearchCapture(websiteId, days)
              .then(setData)
              .catch((err: any) =>
                setError(
                  err?.message ||
                    'Search capture failed to load.',
                ),
              )
              .finally(() => setLoading(false));
          }}
        />
      </Panel>
    );

  const summary = data?.summary ?? null;
  if (!summary)
    return (
      <Panel
        eyebrow="Search capture"
        title="Visibility → clicks → business value"
        description="Where search visibility fails to capture clicks or outcomes, and which commercial queries matter most."
      >
        <EmptyState
          title="No capture evidence"
          description="No GSC query observations in this window. Unavailable is not zero."
        />
      </Panel>
    );

  const commercial: any[] =
    data?.commercialOpportunities ?? [];
  const pages: any[] = data?.pageDiagnostics ?? [];
  const cannotMeasure: string[] =
    data?.cannotMeasure ?? [];

  return (
    <Panel
      eyebrow="Search capture"
      title="Visibility → clicks → business value"
      description="High search visibility with low observed click capture. Low CTR is not proven zero-click — VISIBLE ≠ CLICKED ≠ LEAD ≠ REVENUE."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric
          label="High visibility, low capture"
          value={String(summary.highVisibilityLowCapture ?? 0)}
          detail="Queries needing CTR work"
        />
        <Metric
          label="Commercial gaps"
          value={String(summary.commercialGaps ?? 0)}
          detail="High intent, weak capture"
        />
        <Metric
          label="Striking commercial"
          value={String(summary.strikingCommercial ?? 0)}
          detail="Positions 4–20, commercial"
        />
        <Metric
          label="Outcome connected"
          value={String(summary.outcomeConnected ?? 0)}
          detail="Clicks tied to leads/revenue"
        />
      </div>

      <div className="mt-4">
        <h4 className="text-sm font-semibold text-rk-ink">
          Commercial search opportunities
        </h4>
        {commercial.length === 0 ? (
          <p className="mt-1 text-xs text-rk-muted">
            No commercial visibility or CTR gap observed in
            this window.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {commercial.slice(0, 8).map((row: any) => (
              <li
                key={str(row.query)}
                className="flex flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-rk-ink">
                    {str(row.query)}
                  </span>
                  <span className="mt-0.5 block text-xs text-rk-muted">
                    {str(row.google?.impressions ?? 0)}{' '}
                    impressions · CTR{' '}
                    {pct(row.google?.ctr)} · pos{' '}
                    {row.google?.position ?? '—'} ·{' '}
                    {str(row.business?.gap).replaceAll(
                      '_',
                      ' ',
                    )}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <StatusChip
                    status={str(row.commercialTier)}
                  />
                  <DataSourceBadge
                    source={`NBA: ${str(row.suggestedNba)}`}
                    connected={false}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4">
        <h4 className="text-sm font-semibold text-rk-ink">
          Top pages by capture
        </h4>
        {pages.length === 0 ? (
          <p className="mt-1 text-xs text-rk-muted">
            No page-level query evidence in this window.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {pages.slice(0, 6).map((page: any) => (
              <li
                key={str(page.url)}
                className="flex flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-rk-ink">
                    {str(page.url)}
                  </span>
                  <span className="mt-0.5 block text-xs text-rk-muted">
                    {str(page.impressions ?? 0)} impressions
                    · CTR {pct(page.ctr)} ·{' '}
                    {str(page.diagnosis).replaceAll(
                      '_',
                      ' ',
                    )}
                  </span>
                </span>
                <StatusChip
                  status={str(page.suggestedNba)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-rk-sm border border-rk-border bg-rk-soft px-3 py-2">
        <h4 className="text-xs font-bold text-rk-ink">
          What RENKOO cannot measure
        </h4>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-rk-muted">
          {cannotMeasure.map((line: string, i: number) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
