'use client';

/*
 * RENKOO Local Search Intelligence 1.0 (Phase 19).
 * Decision-first local overview: identity, visibility,
 * commercial opportunities, locations, competitors, SERP,
 * AI, outcomes, NBA, cannot-measure. No Local Score, no
 * Maps ranks, no GBP metrics, no invented reviews.
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
  getLocalOverview,
  getWebsites,
  type Website,
} from '@/lib/api';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

export default function LocalPage() {
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
      setData(await getLocalOverview(siteId, 28));
    } catch (err: any) {
      setError(
        err?.message || 'Local intelligence failed to load.',
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

  const identity = data?.identity ?? null;
  const queries: any[] = data?.localQueries ?? [];
  const opportunities: any[] = data?.opportunities ?? [];
  const locations: any[] = data?.locations ?? [];
  const health: any[] = data?.health ?? [];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Local search"
        title="Own nearby searches"
        description="Where this business is visible locally, where it is missing, and what to do next — observed evidence only."
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
          <LoadingBlock title="Reading local evidence" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Local intelligence failed to load"
            description={error}
            onRetry={() => {
              if (websiteId) void load(websiteId);
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* IDENTITY */}
          <Panel
            eyebrow="Business identity"
            title={str(identity?.businessName || 'Unknown business')}
            description={`Completeness: ${str(identity?.completeness || 'UNAVAILABLE')} · ${str(data?.nap?.scopeNote || '')}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                status={str(identity?.completeness || 'UNAVAILABLE')}
              />
              <StatusChip
                status={`NAP ${str(data?.nap?.state || 'UNAVAILABLE')}`}
              />
              <DataSourceBadge
                source={str(identity?.source || 'BusinessBrain')}
                connected={identity?.completeness === 'COMPLETE'}
              />
            </div>
            {identity ? (
              <p className="mt-2 text-xs text-rk-muted">
                {[identity.city, identity.country]
                  .filter(Boolean)
                  .join(', ')}
                {(identity.serviceAreas ?? [])
                  .slice(0, 5)
                  .map(str)
                  .join(' · ')}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-rk-muted">
              {str(data?.businessProfile?.note)}
            </p>
          </Panel>

          {/* VISIBILITY */}
          <Panel
            eyebrow="Local visibility"
            title="Observed local queries"
            description="GSC-verified local patterns. Organic positions are never labeled Maps positions."
          >
            {queries.length === 0 ? (
              <EmptyState
                title="No local queries observed"
                description="No service-plus-location patterns in this window. Unavailable is not zero."
              />
            ) : (
              <ul className="space-y-2">
                {queries.slice(0, 10).map((row: any) => (
                  <li
                    key={str(row.query)}
                    className="flex flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-rk-ink">
                        {str(row.query)}
                      </span>
                      <span className="mt-0.5 block text-xs text-rk-muted">
                        {str(row.impressions)} impressions ·
                        CTR{' '}
                        {row.ctr !== null
                          ? `${(Number(row.ctr) * 100).toFixed(2)}%`
                          : '—'}{' '}
                        · pos {row.position ?? '—'} ·{' '}
                        {str(row.rankLabel).replaceAll(
                          '_',
                          ' ',
                        )}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <StatusChip
                        status={str(row.pattern)}
                      />
                      <StatusChip
                        status={str(row.intentContext)}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* OPPORTUNITIES */}
          <Panel
            eyebrow="Commercial local opportunities"
            title="What matters"
            description="Existing-action mapping only — no second priority system."
          >
            {opportunities.length === 0 ? (
              <EmptyState
                title="No local gaps observed"
                description="No commercial local CTR, visibility, schema or page gaps in stored evidence."
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

          {/* LOCATIONS + HEALTH */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              eyebrow="Locations"
              title="Service locations"
              description="From stored business data — never assumed."
            >
              {locations.length === 0 ? (
                <EmptyState
                  title="No locations stored"
                  description="Add business locations to enable location detail."
                />
              ) : (
                <ul className="space-y-1">
                  {locations.map((loc: any) => (
                    <li
                      key={str(loc.id)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="font-semibold text-rk-ink">
                        {str(loc.name)}
                      </span>
                      <span className="text-xs text-rk-muted">
                        {[loc.city, loc.country]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                      {loc.isPrimary ? (
                        <StatusChip status="PRIMARY" />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              eyebrow="Local health"
              title="Area status"
              description="Status summaries — never scores."
            >
              <div className="grid grid-cols-2 gap-3">
                {health.map((h: any) => (
                  <Metric
                    key={str(h.area)}
                    label={str(h.area).replaceAll('_', ' ')}
                    value={str(h.state)}
                  />
                ))}
              </div>
            </Panel>
          </div>

          {/* CANNOT MEASURE */}
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
