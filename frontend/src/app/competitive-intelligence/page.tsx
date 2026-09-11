'use client';

/*
 * RENKOO Competitive Intelligence 1.0 (Phase 27).
 * "Where are your competitors winning?"
 * Movements, needs, criteria, Google/AI views, claims,
 * pages, sources, gaps, response, measurement. Observed
 * presence only — never superiority or causation.
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import AppShell from '@/components/AppShell';
import Drawer from '@/components/ui/Drawer';
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
  getCompetitiveDetail,
  getCompetitiveSummary,
  getWebsites,
  type Website,
} from '@/lib/api';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function human(value: unknown): string {
  return str(value).replaceAll('_', ' ');
}

export default function CompetitiveIntelligencePage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async (siteId: string) => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    try {
      setData(await getCompetitiveSummary(siteId, 28));
    } catch (err: any) {
      setError(
        err?.message || 'Competitive intelligence failed to load.',
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

  async function openCompetitor(id: string) {
    setOpenId(id);
    setDetail(null);
    if (!websiteId) return;
    try {
      setDetail(await getCompetitiveDetail(websiteId, id));
    } catch {
      setDetail({ error: true });
    }
  }

  const competitors: any[] = data?.competitors ?? [];
  const needs: any[] = data?.needs ?? [];
  const gaps: any[] = data?.gaps ?? [];
  const movements: any[] = data?.movements ?? [];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Competitive intelligence"
        title="Where are competitors winning?"
        description="Observed competitor presence across needs, surfaces and claims — evidence only, never superiority."
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
          <LoadingBlock title="Reading competitive evidence" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Competitive intelligence failed to load"
            description={error}
            onRetry={() => {
              if (websiteId) void load(websiteId);
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Top competitive movements"
            title="What moved"
            description="Observed movements only — history unavailable stays unavailable, never fabricated."
          >
            {movements.length === 0 ? (
              <EmptyState
                title="No movements observed"
                description="No competitor entries, exits, rank, citation or source movements in available history."
              />
            ) : (
              <ul className="space-y-2">
                {movements.slice(0, 8).map((row: any, i: number) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="font-semibold text-rk-ink">
                      {str(row.competitor)}
                    </span>
                    <StatusChip
                      status={human(row.movement)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            eyebrow="Customer needs"
            title="Needs under competition"
            description="Own vs competitor evidence per need, surface and criterion."
          >
            {needs.length === 0 ? (
              <EmptyState
                title="No contested needs"
                description="No customer-need competition in available evidence."
              />
            ) : (
              <ul className="space-y-2">
                {needs.slice(0, 8).map((need: any) => (
                  <li
                    key={str(need.key)}
                    className="rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                  >
                    <span className="block text-sm font-semibold text-rk-ink">
                      {str(need.label)}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-2">
                      {(need.competitors ?? [])
                        .slice(0, 3)
                        .map((name: string) => (
                          <DataSourceBadge
                            key={name}
                            source={`Observed: ${name}`}
                            connected={false}
                          />
                        ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              eyebrow="Competitors"
              title="Configured competitors"
              description="Configured identities with observed Google and AI evidence."
            >
              {competitors.length === 0 ? (
                <EmptyState
                  title="No competitors configured"
                  description="Add competitors to unlock need-level competition."
                />
              ) : (
                <ul className="space-y-2">
                  {competitors.map((entry: any) => (
                    <li key={str(entry.id)}>
                      <button
                        type="button"
                        onClick={() => void openCompetitor(str(entry.id))}
                        className="rk-focusable flex w-full flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left"
                      >
                        <span className="text-sm font-semibold text-rk-ink">
                          {str(entry.name)}
                        </span>
                        <span className="flex flex-wrap gap-2">
                          <StatusChip
                            status={human(entry.identity)}
                          />
                          <span className="text-xs text-rk-muted">
                            AI observations:{' '}
                            {str(entry.ai?.observations ?? 0)} ·
                            SERP sets:{' '}
                            {str(entry.serpHits ?? 0)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              eyebrow="Gaps"
              title="Recommended response"
              description="Existing rails only — create, improve, optimize, link, authority, local or monitor."
            >
              {gaps.length === 0 ? (
                <EmptyState
                  title="No competitive gaps"
                  description="No missing criteria, citations, visibility or source gaps observed."
                />
              ) : (
                <ul className="space-y-2">
                  {gaps.slice(0, 8).map((gap: any, i: number) => (
                    <li
                      key={i}
                      className="text-sm text-rk-secondary"
                    >
                      <span className="font-semibold text-rk-ink">
                        {str(gap.competitor || 'Evidence')}
                      </span>{' '}
                      — {str(gap.detail).slice(0, 160)}
                      <span className="mt-1 flex flex-wrap gap-2">
                        <StatusChip
                          status={human(gap.gap)}
                        />
                        <StatusChip
                          status={human(gap.action)}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            eyebrow="Honesty"
            title="What RENKOO cannot conclude"
            description="Presence is observed; superiority and causation are never claimed."
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

      <Drawer
        open={openId !== null}
        onClose={() => {
          setOpenId(null);
          setDetail(null);
        }}
        title={detail?.name ?? 'Competitor'}
        eyebrow="Competitor detail"
      >
        {!detail || detail.error ? (
          <p className="text-sm text-rk-muted">
            {detail?.error
              ? 'Detail unavailable.'
              : 'Loading…'}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-rk-secondary">
              Observed in{' '}
              {(detail.needs ?? []).length} customer
              need(s).
            </p>
            <ul className="space-y-1">
              {(detail.needs ?? [])
                .slice(0, 8)
                .map((need: any) => (
                  <li
                    key={str(need.key)}
                    className="text-sm text-rk-secondary"
                  >
                    <span className="font-semibold text-rk-ink">
                      {str(need.label)}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="text-xs text-rk-muted">
              Observation does not establish causation or
              product superiority.
            </p>
          </div>
        )}
      </Drawer>
    </AppShell>
  );
}
