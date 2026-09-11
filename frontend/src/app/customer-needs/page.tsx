'use client';

/*
 * RENKOO Customer Demand Intelligence 2.0 (Phase 24).
 * "What are your customers trying to decide?"
 * Top needs, journey, criteria, coverage, gaps,
 * surfaces, competitors, NBA, outcome, cannot-measure.
 * No scores, no synthetic demand.
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import AppShell from '@/components/AppShell';
import {
  PageHeader,
  Panel,
  StatusChip,
  DataSourceBadge,
  LoadingBlock,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import {
  getCustomerNeeds,
  getWebsites,
  type Website,
} from '@/lib/api';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function human(value: unknown): string {
  return str(value).replaceAll('_', ' ');
}

export default function CustomerNeedsPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (siteId: string) => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    try {
      setData(await getCustomerNeeds(siteId, 28));
    } catch (err: any) {
      setError(
        err?.message || 'Customer demand failed to load.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getWebsites()
      .then((sites) => {
        if (cancelled) return;
        const list = Array.isArray(sites) ? sites : [];
        setWebsites(list);
        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem('renkoo_website_id')
            : null;
        const valid =
          stored && list.some((s) => s.id === stored)
            ? stored
            : list[0]?.id || '';
        setWebsiteId(valid);
        if (valid) void load(valid);
        else setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const topNeeds: any[] = data?.topNeeds ?? [];
  const journey: any[] = data?.journey ?? [];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Customer demand"
        title="What are customers deciding?"
        description="Needs, journeys and decision coverage from observed queries and prompts — hypotheses labeled, never synthetic demand."
        meta={
          <select
            aria-label="Website"
            value={websiteId}
            onChange={(e) => {
              setWebsiteId(e.target.value);
              if (typeof window !== 'undefined')
                localStorage.setItem(
                  'renkoo_website_id',
                  e.target.value,
                );
              if (e.target.value) void load(e.target.value);
            }}
            className="rounded-lg border border-rk-line bg-white px-3 py-2 text-sm text-rk-ink"
          >
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Reading demand evidence" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Customer demand failed to load"
            description={error}
            onRetry={() => {
              if (websiteId) void load(websiteId);
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Top customer needs"
            title="What matters most"
            description="Commercial value plus observed demand plus coverage gaps. No scores."
          >
            {topNeeds.length === 0 ? (
              <EmptyState
                title="No customer needs observed"
                description="Connect Search Console or AI monitoring to reveal demand evidence."
              />
            ) : (
              <ol className="space-y-2">
                {topNeeds.map((need: any, i: number) => (
                  <li
                    key={str(need.key)}
                    className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                  >
                    <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                      {String(i + 1).padStart(2, '0')}
                    </span>{' '}
                    <span className="text-sm font-semibold text-rk-ink">
                      {str(need.label)}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-2">
                      <StatusChip
                        status={human(need.journey)}
                      />
                      <StatusChip
                        status={human(need.need)}
                      />
                      <DataSourceBadge
                        source={`${str(need.queryCount)} queries · ${str(need.impressions)} impressions`}
                        connected={need.hasHighCommercial === true}
                      />
                    </span>
                    <span className="mt-1 block text-xs text-rk-muted">
                      Gaps:{' '}
                      {(need.gaps ?? [])
                        .map(human)
                        .join(' · ') || 'none observed'}
                    </span>
                    {(need.competitors ?? []).length > 0 ? (
                      <span className="mt-1 block text-xs text-rk-muted">
                        Observed competitors:{' '}
                        {(need.competitors ?? [])
                          .slice(0, 3)
                          .map(str)
                          .join(' · ')}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              eyebrow="Customer journey"
              title="Stages with evidence"
              description="Only stages supported by observed queries and prompts."
            >
              {journey.length === 0 ? (
                <EmptyState
                  title="No journey evidence"
                  description="Journey stages appear once queries are observed."
                />
              ) : (
                <ul className="space-y-1">
                  {journey.map((stage: any) => (
                    <li
                      key={str(stage.stage)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="w-44 shrink-0 font-medium text-rk-ink">
                        {human(stage.stage)}
                      </span>
                      <span className="text-xs text-rk-muted">
                        {str(stage.queries)} queries
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              eyebrow="Decision coverage"
              title="Top need criteria"
              description="COVERED, PARTIAL, MISSING or UNAVAILABLE per criterion — never a content score."
            >
              {topNeeds.length === 0 ? (
                <EmptyState
                  title="No criteria observed"
                  description="Decision criteria appear with commercial demand."
                />
              ) : (
                <ul className="space-y-1">
                  {Object.entries(
                    (topNeeds[0]?.coverage ?? {}) as Record<
                      string,
                      any
                    >,
                  )
                    .slice(0, 10)
                    .map(([criterion, value]: [string, any]) => (
                      <li
                        key={criterion}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="w-36 shrink-0 font-medium text-rk-ink">
                          {human(criterion)}
                        </span>
                        <StatusChip
                          status={human(value?.state)}
                        />
                      </li>
                    ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            eyebrow="Honesty"
            title="What RENKOO cannot measure"
            description="Explicit limitations — inferred hypotheses, never synthetic demand."
          >
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-rk-muted">
              {(data?.cannotMeasure ?? []).map(
                (line: string, i: number) => (
                  <li key={i}>{line}</li>
                ),
              )}
            </ul>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
