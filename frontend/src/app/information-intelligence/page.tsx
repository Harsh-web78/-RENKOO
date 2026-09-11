'use client';

/*
 * RENKOO Information Intelligence 1.0 (Phase 25).
 * "Can AI clearly understand your business?"
 * Top risks, decision coverage, claims, conflicts,
 * freshness, AI citation, entities, lineage, gaps,
 * NBA, measurement. No scores, no truth claims.
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
  getInformationIntelligence,
  getWebsites,
  type Website,
} from '@/lib/api';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function human(value: unknown): string {
  return str(value).replaceAll('_', ' ');
}

export default function InformationIntelligencePage() {
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
      setData(await getInformationIntelligence(siteId));
    } catch (err: any) {
      setError(
        err?.message || 'Information intelligence failed to load.',
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

  const risks: any[] = data?.risks ?? [];
  const decisionCoverage: any[] = data?.decisionCoverage ?? [];
  const claims: any[] = data?.claims ?? [];
  const conflicts: any[] = data?.conflicts ?? [];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Information intelligence"
        title="Can AI clearly understand your business?"
        description="Claim-level evidence from your own pages — what is clear, supported, stale, conflicting or missing. Citation is observation, never proof."
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
          <LoadingBlock title="Reading information evidence" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Information intelligence failed to load"
            description={error}
            onRetry={() => {
              if (websiteId) void load(websiteId);
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Top information risks"
            title="What needs attention"
            description="Ranked by evidence strength and customer relevance — never by invented score."
          >
            {risks.length === 0 ? (
              <EmptyState
                title="No information risks observed"
                description="No conflicts, staleness or decision gaps in stored evidence."
              />
            ) : (
              <ol className="space-y-2">
                {risks.map((risk: any, i: number) => (
                  <li
                    key={i}
                    className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                  >
                    <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                      {String(i + 1).padStart(2, '0')}
                    </span>{' '}
                    <span className="text-sm font-semibold text-rk-ink">
                      {str(risk.title)}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-2">
                      <StatusChip
                        status={human(risk.action)}
                      />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel
            eyebrow="Customer decision coverage"
            title="Facts behind decisions"
            description="Per-criterion claim existence, support, freshness and citation."
          >
            {decisionCoverage.length === 0 ? (
              <EmptyState
                title="No decision coverage"
                description="Customer demand evidence is needed to map decision criteria."
              />
            ) : (
              <div className="space-y-3">
                {decisionCoverage.slice(0, 3).map((need: any) => (
                  <div key={str(need.need)}>
                    <p className="text-sm font-semibold text-rk-ink">
                      {str(need.need)}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {(need.criteria ?? [])
                        .slice(0, 8)
                        .map((row: any) => (
                          <li
                            key={str(row.criterion)}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="w-36 shrink-0 font-medium text-rk-ink">
                              {human(row.criterion)}
                            </span>
                            <StatusChip
                              status={human(row.state)}
                            />
                            <span className="truncate text-xs text-rk-muted">
                              {str(row.page)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              eyebrow="Claim explorer"
              title="Observed claims"
              description="Subject → predicate → object with source and state."
            >
              {claims.length === 0 ? (
                <EmptyState
                  title="No claims extracted"
                  description="Crawl evidence holds no extractable factual claims."
                />
              ) : (
                <ul className="space-y-1">
                  {claims.slice(0, 10).map((claim: any) => (
                    <li
                      key={str(claim.key)}
                      className="text-sm text-rk-secondary"
                    >
                      <span className="font-semibold text-rk-ink">
                        {str(claim.object)}
                      </span>{' '}
                      <StatusChip status={human(claim.type)} />{' '}
                      <StatusChip status={human(claim.state)} />
                      <span className="block truncate text-xs text-rk-muted">
                        {str(claim.subject)} ·{' '}
                        {str(claim.provenance)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              eyebrow="Conflicts"
              title="Meaningful contradictions"
              description="Semantic conflicts only — wording differences are never flagged."
            >
              {conflicts.length === 0 ? (
                <EmptyState
                  title="No conflicts observed"
                  description="No meaningful contradictions in stored evidence."
                />
              ) : (
                <ul className="space-y-2">
                  {conflicts
                    .slice(0, 5)
                    .map((conflict: any, i: number) => (
                      <li key={i}>
                        <p className="text-sm font-semibold text-rk-ink">
                          {str(conflict.topic)}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {(conflict.sources ?? []).map(
                            (source: any, j: number) => (
                              <li
                                key={j}
                                className="break-words text-xs text-rk-muted"
                              >
                                {str(source.value)} —{' '}
                                {str(source.page)}
                              </li>
                            ),
                          )}
                        </ul>
                      </li>
                    ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            eyebrow="Entity consistency"
            title="One business, one story"
            description="Name representations across brain, pages and structured data."
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                status={human(data?.entities?.consistency)}
              />
              <StatusChip
                status={`Brand ${human(data?.entities?.brandAlignment)}`}
              />
              <DataSourceBadge
                source={`Freshness: ${human(data?.freshness?.state)}`}
                connected={
                  data?.freshness?.state === 'CURRENT'
                }
              />
            </div>
            <p className="mt-2 text-xs text-rk-muted">
              AI citations: {str(data?.ai?.cited)} ·
              mentions: {str(data?.ai?.mentioned)} ·
              corroborating domains:{' '}
              {str(data?.corroboration?.referringDomains)}
            </p>
          </Panel>

          <Panel
            eyebrow="Honesty"
            title="What RENKOO cannot measure"
            description="Absolute truth is unavailable — support, conflict, staleness or insufficiency only."
          >
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-rk-muted">
              {(data?.limitations ?? []).map(
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
