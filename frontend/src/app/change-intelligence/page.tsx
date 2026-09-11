'use client';

/*
 * RENKOO Search Change Intelligence 1.0 (Phase 26).
 * "What changed and what happened next?"
 * Material changes, timeline, search/AI/content
 * changes, divergence, limitations. Temporal
 * association only — never causal.
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
  getChangeSummary,
  getWebsites,
  type Website,
} from '@/lib/api';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function human(value: unknown): string {
  return str(value).replaceAll('_', ' ');
}

export default function ChangeIntelligencePage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (siteId: string) => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    try {
      setData(await getChangeSummary(siteId, 28));
    } catch (err: any) {
      setError(
        err?.message || 'Change intelligence failed to load.',
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

  const material: any[] = data?.materialChanges ?? [];
  const timeline: any[] = data?.timeline ?? [];
  const divergence: any[] = data?.divergence ?? [];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        tourAnchor="discover-changes"
        eyebrow="Change intelligence"
        title="What changed?"
        description="Page, search, AI and business changes with an evidence timeline. Observed after — never caused by."
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
          <LoadingBlock title="Reading change evidence" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Change intelligence failed to load"
            description={error}
            onRetry={() => {
              if (websiteId) void load(websiteId);
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Top material changes"
            title="What changed most"
            description="Ordered by existing priority and evidence — never by invented score."
          >
            {material.length === 0 ? (
              <EmptyState
                title="No material changes observed"
                description="No comparable before/after evidence in the available history. Tracked sources, data windows and limitations below."
              />
            ) : (
              <ol className="space-y-2">
                {material.map((change: any) => (
                  <li key={str(change.id)}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenId(
                          openId === str(change.id)
                            ? null
                            : str(change.id),
                        )
                      }
                      aria-expanded={
                        openId === str(change.id)
                      }
                      className="rk-focusable w-full rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left"
                    >
                      <span className="block truncate text-sm font-semibold text-rk-ink">
                        {human(change.changeType)} —{' '}
                        {str(change.entity)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusChip
                          status={human(change.direction)}
                        />
                        <DataSourceBadge
                          source={str(change.source)}
                          connected={
                            change.evidenceState !==
                            'UNAVAILABLE'
                          }
                        />
                        <span className="text-xs text-rk-muted">
                          {str(change.before) || '—'} →{' '}
                          {str(change.after) || '—'}
                        </span>
                      </span>
                      {openId === str(change.id) ? (
                        <span className="mt-2 block space-y-1">
                          {(change.explanation ?? []).map(
                            (line: string, i: number) => (
                              <span
                                key={i}
                                className="block text-xs text-rk-muted"
                              >
                                {line}
                              </span>
                            ),
                          )}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel
            eyebrow="Timeline"
            title="Evidence in order"
            description="Chronological observed events with source and evidence state."
          >
            {timeline.length === 0 ? (
              <EmptyState
                title="No timeline events"
                description="RENKOO needs a previous observation to compare changes."
              />
            ) : (
              <ol className="space-y-1">
                {timeline.slice(0, 30).map((event: any, i: number) => (
                  <li
                    key={i}
                    className="flex flex-col gap-0.5 border-l-2 border-rk-line pl-3 sm:flex-row sm:gap-3"
                  >
                    <span className="w-24 shrink-0 text-xs font-semibold text-rk-ink">
                      {str(event.observedAt).slice(0, 10) ||
                        'undated'}
                    </span>
                    <span className="min-w-0 flex-1 text-xs text-rk-secondary">
                      <b>{human(event.changeType)}</b> —{' '}
                      <span className="break-words">
                        {str(event.entity)}
                      </span>{' '}
                      · {str(event.detail)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {divergence.length > 0 ? (
            <Panel
              eyebrow="Search / AI divergence"
              title="Surfaces moving apart"
              description="Google and AI signals disagreeing — no combined score."
            >
              <ul className="space-y-1">
                {divergence.map((row: any) => (
                  <li
                    key={str(row.keyword)}
                    className="text-sm text-rk-secondary"
                  >
                    <span className="font-semibold text-rk-ink">
                      {str(row.keyword)}
                    </span>{' '}
                    — search {human(row.search)}, AI{' '}
                    {human(row.ai)}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel
            eyebrow="Honesty"
            title="What RENKOO cannot conclude"
            description="Temporal association is never causation."
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
