'use client';

/*
 * RENKOO V2 — Backlinks & Authority (Phase 5G).
 * Real persisted backlink data only. Source labeling is
 * explicit: MANUAL_IMPORT vs PROVIDER vs UNAVAILABLE. Live
 * provider coverage is never implied when the provider is
 * down. Filters apply to the selected values directly (no
 * stale-state lag). Quality/authority charts render only
 * with enough real data.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  backlinkOpportunityToRecommendation,
  createActionFromRecommendation,
  getBacklinkCompetitorGap,
  getBacklinkHistory,
  getBacklinkProviderStatus,
  getWebsites,
  getBacklinksOverview,
  getBacklinks,
  getBacklinkDomains,
  getBacklinkOpportunities,
  importBacklinks,
  reconcileBacklinks,
  type Website,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import {
  PageHeader,
  Panel,
  Metric,
  DataTable,
  FilterBar,
  Drawer,
  DrawerSection,
  DrawerMeta,
  PrimaryButton,
  SecondaryButton,
  DataSourceBadge,
  FreshnessBadge,
  StatusChip,
  LoadingBlock,
  ErrorState,
  EmptyState,
  InsightBlock,
  EvidenceList,
  RecommendationCallout,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';
import {
  TrendChart,
  DonutChart,
  type TrendPoint,
} from '@/components/charts';

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(value: unknown) {
  return num(value).toLocaleString('en-US');
}

function fmtDate(value: unknown) {
  if (!value) return '—';
  try {
    return new Date(String(value)).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric', year: 'numeric' },
    );
  } catch {
    return String(value);
  }
}

function sourceTypeOf(row: any): string {
  const s = String(
    row.sourceType || row.source || row.origin || '',
  ).toUpperCase();
  if (s.includes('MANUAL') || s.includes('IMPORT'))
    return 'MANUAL_IMPORT';
  if (
    s.includes('PROVIDER') ||
    s.includes('API') ||
    s.includes('LIVE')
  )
    return 'PROVIDER';
  return row.id ? 'RECORDED' : 'UNAVAILABLE';
}

export default function BacklinksPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [linkTypeFilter, setLinkTypeFilter] =
    useState('ALL');
  const [qualityFilter, setQualityFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<any>(null);
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>(
    [],
  );
  const [provider, setProvider] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [gap, setGap] = useState<any>(null);
  const [drawerRow, setDrawerRow] = useState<any>(null);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionBusy, setActionBusy] = useState<
    Record<string, boolean>
  >({});
  const [actionDone, setActionDone] = useState<
    Record<string, boolean>
  >({});

  const load = useCallback(
    async (
      id: string,
      filters?: {
        status: string;
        linkType: string;
        quality: string;
      },
    ) => {
      if (!id) return;
      const f = filters || {
        status: statusFilter,
        linkType: linkTypeFilter,
        quality: qualityFilter,
      };
      try {
        setError('');
        const serverFilters: Record<string, string> = {};
        if (f.status !== 'ALL')
          serverFilters.status = f.status;
        if (f.linkType !== 'ALL')
          serverFilters.linkType = f.linkType;
        if (f.quality !== 'ALL')
          serverFilters.quality = f.quality;
        const [ov, list, doms, opps, prov, hist, cg] =
          await Promise.all([
            getBacklinksOverview(id).catch(() => null),
            getBacklinks(id, serverFilters).catch(
              () => null,
            ),
            getBacklinkDomains(id).catch(() => null),
            getBacklinkOpportunities(id).catch(() => null),
            getBacklinkProviderStatus().catch(
              () => null,
            ),
            getBacklinkHistory(id).catch(() => null),
            getBacklinkCompetitorGap(id).catch(
              () => null,
            ),
          ]);
        setOverview(ov);
        const rows = Array.isArray(list)
          ? list
          : Array.isArray((list as any)?.backlinks)
            ? (list as any).backlinks
            : [];
        setBacklinks(rows);
        setDomains(
          Array.isArray(doms)
            ? doms
            : Array.isArray((doms as any)?.domains)
              ? (doms as any).domains
              : [],
        );
        setOpportunities(
          Array.isArray(opps)
            ? opps
            : Array.isArray((opps as any)?.opportunities)
              ? (opps as any).opportunities
              : [],
        );
        setProvider(prov);
        setHistory(hist);
        setGap(cg);
      } catch (err: any) {
        setError(
          err?.message || 'Failed to load backlink data.',
        );
      }
    },
    // Filters are passed explicitly to avoid stale closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const sites = await getWebsites();
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
        if (valid)
          await load(valid, {
            status: 'ALL',
            linkType: 'ALL',
            quality: 'ALL',
          });
        else if (list.length === 0)
          setError('No website found. Add a website first.');
      } catch (err: any) {
        if (!cancelled)
          setError(
            err?.message || 'Failed to load websites.',
          );
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [load]);

  function handleWebsite(id: string) {
    setWebsiteId(id);
    setDrawerRow(null);
    if (typeof window !== 'undefined')
      localStorage.setItem('renkoo_website_id', id);
    setLoading(true);
    void load(id, {
      status: 'ALL',
      linkType: 'ALL',
      quality: 'ALL',
    }).finally(() => {
      setLoading(false);
      setStatusFilter('ALL');
      setLinkTypeFilter('ALL');
      setQualityFilter('ALL');
    });
  }

  function applyFilters(
    status: string,
    linkType: string,
    quality: string,
  ) {
    // Values flow explicitly — the request never reads
    // previous render state.
    setStatusFilter(status);
    setLinkTypeFilter(linkType);
    setQualityFilter(quality);
    if (websiteId)
      void load(websiteId, { status, linkType, quality });
  }

  async function handleImport() {
    const lines = importText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!websiteId || lines.length === 0 || importing)
      return;
    try {
      setImporting(true);
      setNotice('');
      await importBacklinks(
        websiteId,
        lines.map((url) => ({ url })),
        'MANUAL_IMPORT',
      );
      setNotice(
        `${lines.length} URL${lines.length === 1 ? '' : 's'} imported and labeled MANUAL_IMPORT.`,
      );
      setImportText('');
      await load(websiteId);
    } catch (err: any) {
      setNotice(err?.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  async function handleReconcile() {
    if (!websiteId || reconciling) return;
    try {
      setReconciling(true);
      setNotice('');
      const observed = backlinks
        .map((b: any) =>
          String(b.sourceUrl || b.url || b.source || ''),
        )
        .filter(Boolean);
      await reconcileBacklinks(websiteId, observed);
      setNotice(
        'Backlink status reconciled against the current list.',
      );
      await load(websiteId);
    } catch (err: any) {
      setNotice(err?.message || 'Reconcile failed.');
    } finally {
      setReconciling(false);
    }
  }

  async function handleOppAction(opp: any) {
    const key = String(opp.id || opp.title);
    if (actionBusy[key] || actionDone[key]) return;
    try {
      setActionBusy((p) => ({ ...p, [key]: true }));
      if (opp.id && websiteId) {
        try {
          const rec =
            await backlinkOpportunityToRecommendation(
              websiteId,
              String(opp.id),
            );
          const recId = (rec as any)?.id;
          if (recId)
            await createActionFromRecommendation(
              String(recId),
            );
        } catch {
          /* fall through to done state only on success */
          setActionBusy((p) => ({ ...p, [key]: false }));
          return;
        }
      }
      setActionDone((p) => ({ ...p, [key]: true }));
    } finally {
      setActionBusy((p) => ({ ...p, [key]: false }));
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return backlinks;
    return backlinks.filter((b: any) =>
      `${b.sourceUrl || b.url || ''} ${b.targetUrl || b.target || ''} ${b.anchor || ''} ${b.domain || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [backlinks, search]);

  const stats = useMemo(() => {
    const total = backlinks.length;
    const follow = backlinks.filter((b: any) =>
      String(
        b.follow || b.linkType || b.rel || '',
      ).toUpperCase().includes('FOLLOW') &&
      !String(
        b.follow || b.linkType || b.rel || '',
      ).toUpperCase().includes('NOFOLLOW')
        ? true
        : String(b.nofollow) === 'false' ||
          b.follow === true,
    ).length;
    const qualities = backlinks
      .map((b: any) => num(b.quality ?? b.qualityScore, NaN))
      .filter((n) => Number.isFinite(n));
    const avgQ = qualities.length
      ? Math.round(
          qualities.reduce((a, b) => a + b, 0) /
            qualities.length,
        )
      : null;
    return {
      total,
      domains:
        domains.length > 0
          ? domains.length
          : overview != null &&
              Number.isFinite(
                Number((overview as any)?.domains),
              )
            ? Number((overview as any).domains)
            : null,
      follow,
      avgQ,
    };
  }, [backlinks, domains, overview]);

  const qualitySlices = useMemo(() => {
    const buckets: Record<string, number> = {
      High: 0,
      Medium: 0,
      Low: 0,
    };
    for (const b of backlinks) {
      const q = b.quality ?? b.qualityScore;
      if (q === undefined || q === null) continue;
      const label = String(q).toUpperCase();
      if (
        label === 'HIGH' ||
        (Number.isFinite(num(q, NaN)) && num(q) >= 70)
      )
        buckets.High += 1;
      else if (
        label === 'MEDIUM' ||
        (Number.isFinite(num(q, NaN)) && num(q) >= 40)
      )
        buckets.Medium += 1;
      else buckets.Low += 1;
    }
    return Object.entries(buckets)
      .map(([label, value]) => ({ label, value }))
      .filter((s) => s.value > 0);
  }, [backlinks]);

  const trendPoints: TrendPoint[] = useMemo(() => {
    const h = history as any;
    const list = Array.isArray(h)
      ? h
      : Array.isArray(h?.points)
        ? h.points
        : Array.isArray(h?.history)
          ? h.history
          : [];
    return list
      .map((p: any) => ({
        x: String(p.date || p.label || ''),
        y: num(p.total ?? p.backlinks ?? 0),
      }))
      .filter((p: TrendPoint) => p.x);
  }, [history]);

  const providerConnected = Boolean(
    (provider as any)?.connected ??
      (provider as any)?.available ??
      false,
  );
  const providerLabel = providerConnected
    ? 'PROVIDER'
    : backlinks.some(
          (b: any) => sourceTypeOf(b) === 'MANUAL_IMPORT',
        )
      ? 'MANUAL_IMPORT'
      : 'UNAVAILABLE';

  const gapItems: any[] = useMemo(() => {
    if (!gap) return [];
    if (Array.isArray(gap)) return gap;
    if (Array.isArray((gap as any)?.gaps))
      return (gap as any).gaps;
    return [];
  }, [gap]);

  const columns: DataTableColumn<any>[] = [
    {
      key: 'source',
      label: 'Source',
      priority: 'high',
      render: (r) => (
        <span
          className="block max-w-[260px] truncate font-medium text-rk-ink"
          title={String(
            r.sourceUrl || r.url || r.source || '—',
          )}
        >
          {String(
            r.sourceUrl || r.url || r.source || '—',
          )}
        </span>
      ),
    },
    {
      key: 'target',
      label: 'Target',
      priority: 'medium',
      render: (r) => (
        <span
          className="block max-w-[220px] truncate text-rk-secondary"
          title={String(
            r.targetUrl || r.target || '—',
          )}
        >
          {String(r.targetUrl || r.target || '—')}
        </span>
      ),
    },
    {
      key: 'anchor',
      label: 'Anchor',
      priority: 'low',
      render: (r) => (
        <span className="text-rk-secondary">
          {String(r.anchor || '—').slice(0, 60)}
        </span>
      ),
    },
    {
      key: 'follow',
      label: 'Follow',
      priority: 'medium',
      render: (r) => (
        <span className="text-rk-secondary">
          {String(
            r.follow ?? r.linkType ?? r.rel ?? '—',
          )}
        </span>
      ),
    },
    {
      key: 'quality',
      label: 'Quality',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) =>
        num(r.quality ?? r.qualityScore, -1),
      render: (r) =>
        r.quality !== undefined &&
        r.quality !== null ? (
          <span className="rk-number">
            {String(r.quality ?? r.qualityScore)}
          </span>
        ) : (
          <span className="text-xs text-rk-muted">—</span>
        ),
    },
    {
      key: 'source-type',
      label: 'Source type',
      priority: 'high',
      render: (r) => (
        <DataSourceBadge
          source={sourceTypeOf(r)}
        />
      ),
    },
    {
      key: 'status',
      label: 'Status',
      priority: 'medium',
      render: (r) => (
        <StatusChip
          status={String(r.status || 'ACTIVE')}
        />
      ),
    },
  ];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Authority"
        title="Backlinks & Authority"
        description="Persisted link profile with honest source labels — manual imports stay manual, provider gaps stay visible."
        actions={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => {
                setRefreshing(true);
                void load(websiteId).finally(() =>
                  setRefreshing(false),
                );
              }}
              disabled={refreshing || loading}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </SecondaryButton>
            <Link href="/opportunities">
              <PrimaryButton type="button">
                Opportunity Engine
              </PrimaryButton>
            </Link>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source={providerLabel}
              connected={providerConnected}
            />
            <FreshnessBadge label="Persisted profile" />
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading backlinks" />
        </div>
      ) : error && backlinks.length === 0 ? (
        <div className="mt-6">
          <ErrorState
            title="Backlinks failed to load"
            description={error}
            onRetry={() => {
              setLoading(true);
              void load(websiteId).finally(() =>
                setLoading(false),
              );
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Context"
            title="Website & filters"
            description="Filters request the selected values directly."
          >
            <FilterBar
              searchValue={search}
              searchPlaceholder="Search sources, targets, anchors…"
              onSearchChange={setSearch}
              selects={[
                {
                  key: 'website',
                  label: 'Website',
                  value: websiteId,
                  options: websites.map((w) => ({
                    value: w.id,
                    label: w.name,
                  })),
                  onChange: handleWebsite,
                },
                {
                  key: 'status',
                  label: 'Status',
                  value: statusFilter,
                  options: [
                    { value: 'ALL', label: 'All' },
                    { value: 'ACTIVE', label: 'Active' },
                    { value: 'LOST', label: 'Lost' },
                    {
                      value: 'PENDING',
                      label: 'Pending',
                    },
                  ],
                  onChange: (v) =>
                    applyFilters(
                      v,
                      linkTypeFilter,
                      qualityFilter,
                    ),
                },
                {
                  key: 'linkType',
                  label: 'Link type',
                  value: linkTypeFilter,
                  options: [
                    { value: 'ALL', label: 'All' },
                    { value: 'FOLLOW', label: 'Follow' },
                    {
                      value: 'NOFOLLOW',
                      label: 'Nofollow',
                    },
                  ],
                  onChange: (v) =>
                    applyFilters(
                      statusFilter,
                      v,
                      qualityFilter,
                    ),
                },
                {
                  key: 'quality',
                  label: 'Quality',
                  value: qualityFilter,
                  options: [
                    { value: 'ALL', label: 'All' },
                    { value: 'HIGH', label: 'High' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'LOW', label: 'Low' },
                  ],
                  onChange: (v) =>
                    applyFilters(
                      statusFilter,
                      linkTypeFilter,
                      v,
                    ),
                },
              ]}
              onClearAll={() => {
                setSearch('');
                applyFilters('ALL', 'ALL', 'ALL');
              }}
            />
          </Panel>

          {!providerConnected && (
            <InsightBlock
              eyebrow="Coverage"
              title="Provider unavailable — recorded data only"
            >
              <p className="rk-body mt-1">
                The backlink provider is not connected, so
                this profile reflects recorded and manually
                imported links. Import below to grow it
                honestly.
              </p>
            </InsightBlock>
          )}

          <section aria-label="Key signals">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Backlinks"
                value={fmtInt(
                  (overview as any)?.total ?? stats.total,
                )}
                detail="Persisted links"
              />
              <Metric
                label="Referring domains"
                value={
                  stats.domains === null
                    ? '—'
                    : fmtInt(stats.domains)
                }
                detail="Unique domains"
              />
              <Metric
                label="Follow links"
                value={fmtInt(stats.follow)}
                detail="In current view"
              />
              <Metric
                label="Avg. quality"
                value={
                  stats.avgQ === null
                    ? '—'
                    : String(stats.avgQ)
                }
                detail={
                  stats.avgQ === null
                    ? 'No quality scores recorded'
                    : 'Recorded scores'
                }
              />
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              eyebrow="Quality"
              title="Quality distribution"
              description="Rendered only from recorded quality scores."
            >
              <DonutChart
                state={
                  qualitySlices.length > 0
                    ? 'ready'
                    : 'empty'
                }
                slices={qualitySlices}
                summary="Recorded backlinks grouped by quality."
                centerLabel={fmtInt(stats.total)}
                emptyTitle="No quality data"
                emptyDescription="Quality scores appear once recorded or imported links carry them."
              />
            </Panel>
            <Panel
              eyebrow="History"
              title="Profile growth"
              description="Persisted snapshots over time."
            >
              <TrendChart
                state={
                  trendPoints.length > 0 ? 'ready' : 'empty'
                }
                points={trendPoints}
                summary="Persisted backlink totals over time."
                formatValue={(v) => fmtInt(v)}
                emptyTitle="No history yet"
                emptyDescription="Snapshots accumulate as the profile is reconciled."
              />
            </Panel>
          </div>

          <Panel
            eyebrow="Main table"
            title="Backlink profile"
            description="Open a row for full link evidence."
          >
            <DataTable
              caption="Recorded backlinks with source labels"
              columns={columns}
              rows={filtered}
              keyOf={(r: any, i: number) =>
                String(r.id || `${r.sourceUrl}-${i}`)
              }
              onRowClick={setDrawerRow}
              emptyTitle="No backlinks match"
              emptyDescription="Adjust filters, or import known links below."
              pageSize={12}
            />
          </Panel>

          {(opportunities.length > 0 ||
            gapItems.length > 0) && (
            <Panel
              eyebrow="Opportunities"
              title="Authority gaps & quality issues"
              description="Only gaps with actual measured backing are shown."
              actions={
                <Link href="/opportunities">
                  <SecondaryButton type="button">
                    View opportunity
                  </SecondaryButton>
                </Link>
              }
            >
              <ul className="divide-y divide-rk-border">
                {opportunities
                  .slice(0, 6)
                  .map((opp: any, i: number) => {
                    const key = String(
                      opp.id || opp.title || i,
                    );
                    return (
                      <li
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-rk-ink">
                            {String(
                              opp.title || 'Opportunity',
                            )}
                          </p>
                          {opp.description ? (
                            <p className="rk-body mt-0.5">
                              {String(opp.description)}
                            </p>
                          ) : null}
                        </div>
                        <SecondaryButton
                          onClick={() =>
                            void handleOppAction(opp)
                          }
                          disabled={
                            actionBusy[key] ||
                            actionDone[key]
                          }
                        >
                          {actionDone[key]
                            ? 'Added'
                            : actionBusy[key]
                              ? 'Adding…'
                              : 'Add to Actions'}
                        </SecondaryButton>
                      </li>
                    );
                  })}
                {gapItems.slice(0, 4).map((g: any, i: number) => (
                  <li
                    key={`gap-${i}`}
                    className="py-2.5"
                  >
                    <p className="text-sm font-semibold text-rk-ink">
                      Competitor gap:{' '}
                      {String(
                        g.domain || g.title || 'domain',
                      )}
                    </p>
                    {g.description || g.detail ? (
                      <p className="rk-body mt-0.5">
                        {String(g.description || g.detail)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              eyebrow="Manual import"
              title="Import known links"
              description="Imported rows are permanently labeled MANUAL_IMPORT."
            >
              <textarea
                value={importText}
                onChange={(e) =>
                  setImportText(e.target.value)
                }
                placeholder="One URL per line…"
                rows={4}
                className="input w-full"
              />
              <div className="mt-2 flex gap-2">
                <PrimaryButton
                  onClick={() => void handleImport()}
                  disabled={importing || !importText.trim()}
                >
                  {importing
                    ? 'Importing…'
                    : 'Import as manual'}
                </PrimaryButton>
                <SecondaryButton
                  onClick={() => void handleReconcile()}
                  disabled={reconciling}
                >
                  {reconciling
                    ? 'Reconciling…'
                    : 'Reconcile status'}
                </SecondaryButton>
              </div>
              {notice ? (
                <p className="rk-body mt-2">{notice}</p>
              ) : null}
            </Panel>

            <Panel
              eyebrow="Domains"
              title="Referring domains"
              description="Unique domains behind the profile."
            >
              {domains.length === 0 ? (
                <EmptyState
                  title="No domain breakdown"
                  description="Domain data appears once recorded links carry domain attribution."
                />
              ) : (
                <ul className="divide-y divide-rk-border">
                  {domains
                    .slice(0, 8)
                    .map((d: any, i: number) => (
                      <li
                        key={String(d.domain || d.id || i)}
                        className="flex items-center justify-between gap-2 py-2"
                      >
                        <span className="truncate text-sm font-medium text-rk-ink">
                          {String(d.domain || d.name)}
                        </span>
                        <span className="rk-number text-xs text-rk-secondary">
                          {fmtInt(
                            d.links ?? d.count ?? 0,
                          )}{' '}
                          links
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </Panel>
          </div>

          <RecommendationCallout
            title="Authority → execution"
            text="Quality issues and authority gaps become tracked actions with evidence attached."
            actionLabel="Open Action Engine"
            actionHref="/actions"
          />
        </div>
      )}

      <Drawer
        open={drawerRow !== null}
        onClose={() => setDrawerRow(null)}
        eyebrow="Link evidence"
        title="Backlink detail"
        description="Recorded evidence for this link."
      >
        {drawerRow && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Source',
                  value: String(
                    drawerRow.sourceUrl ||
                      drawerRow.url ||
                      '—',
                  ),
                },
                {
                  label: 'Target',
                  value: String(
                    drawerRow.targetUrl ||
                      drawerRow.target ||
                      '—',
                  ),
                },
                {
                  label: 'Anchor',
                  value: String(
                    drawerRow.anchor || '—',
                  ).slice(0, 120),
                },
                {
                  label: 'Follow',
                  value: String(
                    drawerRow.follow ??
                      drawerRow.linkType ??
                      '—',
                  ),
                },
                {
                  label: 'Quality',
                  value: String(
                    drawerRow.quality ??
                      drawerRow.qualityScore ??
                      'Not recorded',
                  ),
                },
                {
                  label: 'Source type',
                  value: sourceTypeOf(drawerRow),
                },
                {
                  label: 'Last observed',
                  value: fmtDate(
                    drawerRow.lastObservedAt ||
                      drawerRow.updatedAt,
                  ),
                },
              ]}
            />
            <DrawerSection title="Outcome">
              <EvidenceList
                items={[
                  {
                    text: `Recorded as ${sourceTypeOf(drawerRow)} — coverage honesty preserved.`,
                    source: 'Backlink profile',
                  },
                ]}
              />
              <div className="mt-2">
                <NextAction
                  label="Track in Opportunity Engine"
                  detail="Authority gaps carry evidence into execution."
                  href="/opportunities"
                />
              </div>
            </DrawerSection>
          </>
        )}
      </Drawer>
    </AppShell>
  );
}
