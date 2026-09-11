'use client';

/*
 * RENKOO Search Everywhere 1.0 (Phase 22).
 * "Understand where your customers are discovering you."
 * Surface coverage, opportunities, visibility, competitor
 * observations, sources, changes, NBA, cannot-measure.
 * No scores, no invented cross-surface data.
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
  Metric,
  StatusChip,
  DataSourceBadge,
  LoadingBlock,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import {
  getSearchSurfaces,
  getWebsites,
  type Website,
} from '@/lib/api';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

const FOCUS_SURFACES = [
  'GOOGLE_SEARCH',
  'CHATGPT',
  'PERPLEXITY',
  'GEMINI',
  'LOCAL_SEARCH',
  'BING_SEARCH',
];

export default function SearchEverywherePage() {
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
      setData(await getSearchSurfaces(siteId, 28));
    } catch (err: any) {
      setError(
        err?.message ||
          'Search surface evidence failed to load.',
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

  const summary = data?.summary ?? null;
  const surfaces: any[] = (data?.surfaces ?? []).filter(
    (entry: any) => FOCUS_SURFACES.includes(str(entry.key)),
  );
  const opportunities: any[] = data?.opportunities ?? [];
  const topics: any[] = data?.topics ?? [];
  const sources: any[] = (data?.sources ?? []).filter(
    (entry: any) => entry.crossSurface,
  );

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Search everywhere"
        title="Where customers discover you"
        description="Google, AI, local and Bing evidence in one place — observed surfaces only, never a universal score."
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
          <LoadingBlock title="Reading surface evidence" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Surface evidence failed to load"
            description={error}
            onRetry={() => {
              if (websiteId) void load(websiteId);
            }}
          />
        </div>
      ) : !summary ? (
        <div className="mt-6">
          <EmptyState
            title="No surface evidence"
            description="No observed queries in this window. Unavailable is not zero."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Surface coverage"
            title="Google · AI · Local · Bing"
            description="A surface is shown as observed only with actual evidence. Unchecked stays unknown."
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {surfaces.map((surface: any) => (
                <Metric
                  key={str(surface.key)}
                  label={str(surface.label)}
                  value={str(surface.observations ?? 0)}
                  detail={str(surface.availability)}
                />
              ))}
            </div>
          </Panel>

          <Panel
            eyebrow="Top cross-surface opportunities"
            title="Where to focus"
            description="Existing-action mapping only — high commercial value plus weak surface evidence."
          >
            {opportunities.length === 0 ? (
              <EmptyState
                title="No surface gaps observed"
                description="No commercial cross-surface gaps in stored evidence."
              />
            ) : (
              <ul className="space-y-2">
                {opportunities.slice(0, 8).map((opp: any) => (
                  <li
                    key={str(opp.title)}
                    className="flex flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-rk-ink">
                      {str(opp.title)}
                    </span>
                    <span className="text-xs text-rk-muted">
                      {str(opp.detail)}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <StatusChip status={str(opp.label)} />
                      <DataSourceBadge
                        source={`NBA: ${str(opp.suggestedNba)}`}
                        connected={false}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              eyebrow="Topics"
              title="Where you're visible"
              description="Topic ownership reused — Google plus AI coverage, no second score."
            >
              {topics.length === 0 ? (
                <EmptyState
                  title="No topics observed"
                  description="No query-to-topic evidence in this window."
                />
              ) : (
                <ul className="space-y-1">
                  {topics.slice(0, 8).map((topic: any) => (
                    <li
                      key={str(topic.topic)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold text-rk-ink">
                        {str(topic.topic)}
                      </span>
                      <StatusChip
                        status={str(topic.ownership)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              eyebrow="Sources"
              title="What sources keep appearing"
              description="Domains cited across multiple observed surfaces. Co-occurrence is never authority."
            >
              {sources.length === 0 ? (
                <EmptyState
                  title="No cross-surface sources"
                  description="No domain was cited across multiple observed surfaces."
                />
              ) : (
                <ul className="space-y-1">
                  {sources.slice(0, 8).map((source: any) => (
                    <li
                      key={str(source.domain)}
                      className="text-sm text-rk-secondary"
                    >
                      <span className="font-semibold text-rk-ink">
                        {str(source.domain)}
                      </span>{' '}
                      —{' '}
                      {(source.surfaces ?? [])
                        .map(str)
                        .join(', ')}{' '}
                      ({str(source.citations)} citations)
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            eyebrow="Honesty"
            title="What RENKOO cannot measure"
            description="Explicit unavailable evidence — never presented as zero."
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
