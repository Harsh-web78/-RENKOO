'use client';

/*
 * RENKOO V2 — Traffic & Analytics Intelligence (Phase 5I).
 * Real GA4 report data only, answering "is traffic helping
 * growth?". TRAFFIC → LEADS → CONVERSIONS → REVENUE stages
 * render only where actual data supports the relationship —
 * revenue is never inferred from traffic. Source and
 * availability labels stay explicit throughout.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getGoogleAnalyticsReport,
  getGoogleAnalyticsProperties,
  getGoogleConnectionStatus,
  selectGoogleAnalyticsProperty,
  getWebsites,
  getLeadsSummary,
  getRevenueSummary,
  getRoiSummary,
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
  LoadingBlock,
  ErrorState,
  EmptyState,
  NotConnectedState,
  InsightBlock,
  RecommendationCallout,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';
import {
  TrendChart,
  BarList,
  FunnelStages,
  type TrendPoint,
} from '@/components/charts';

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(value: unknown) {
  return num(value).toLocaleString('en-US');
}

const moneyFormatters = new Map<
  string,
  Intl.NumberFormat
>();

function moneyFormatter(currency: string) {
  let formatter = moneyFormatters.get(currency);

  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });

    moneyFormatters.set(currency, formatter);
  }

  return formatter;
}

function fmtMoney(value: unknown, currency?: string) {
  const n = num(value, NaN);
  if (!Number.isFinite(n)) return '—';
  try {
    return moneyFormatter(currency || 'USD').format(n);
  } catch {
    return String(Math.round(n));
  }
}

function fmtDate(value: unknown) {
  if (!value) return '—';
  try {
    return new Date(String(value)).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric' },
    );
  } catch {
    return String(value);
  }
}

function rangeFor(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

export default function AnalyticsPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [period, setPeriod] = useState('28');
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [properties, setProperties] = useState<any[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(
    null,
  );
  const [hasSelection, setHasSelection] = useState(false);
  const [draftPropertyId, setDraftPropertyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [propertyError, setPropertyError] = useState('');
  const [report, setReport] = useState<any>(null);
  const [leads, setLeads] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [roi, setRoi] = useState<any>(null);
  const [drawerRow, setDrawerRow] = useState<any>(null);

  const { startDate, endDate } = useMemo(
    () => rangeFor(num(period, 28)),
    [period],
  );

  const loadReport = useCallback(
    async (from: string, to: string) => {
      try {
        setPropertyError('');
        const res = await getGoogleAnalyticsReport(
          from,
          to,
        );
        setReport(res);
      } catch (err: any) {
        setReport(null);
        setPropertyError(
          err?.message || 'Analytics report unavailable.',
        );
      }
    },
    [],
  );

  const loadGrowth = useCallback(async (siteId: string) => {
    if (!siteId) return;
    const [l, r, roiRes] = await Promise.all([
      getLeadsSummary(siteId).catch(() => null),
      getRevenueSummary(siteId).catch(() => null),
      getRoiSummary(siteId).catch(() => null),
    ]);
    setLeads(l);
    setRevenue(r);
    setRoi(roiRes);
  }, []);

  const init = useCallback(async () => {
    try {
      setError('');
      const [status, props, sites] = await Promise.all([
        getGoogleConnectionStatus().catch(() => null),
        getGoogleAnalyticsProperties().catch(() => []),
        getWebsites().catch(() => []),
      ]);
      const list = Array.isArray(sites) ? sites : [];
      setWebsites(list);
      const stored =
        typeof window !== 'undefined'
          ? localStorage.getItem('renkoo_website_id')
          : null;
      const valid =
        stored && list.some((s: any) => s.id === stored)
          ? stored
          : list[0]?.id || '';
      setWebsiteId(valid);
      if (valid) void loadGrowth(valid);
      const plist = Array.isArray(props) ? props : [];
      setProperties(plist);
      const persisted =
        (status as any)?.selectedAnalyticsProperty ||
        (status as any)?.analyticsProperty ||
        '';
      const validSelection = Boolean(
        persisted &&
          plist.some(
            (p: any) =>
              String(p.propertyId || p.id) ===
              persisted,
          ),
      );
      setHasSelection(validSelection);
      const active = validSelection
        ? persisted
        : '';
      setPropertyId(active);
      if (!validSelection) {
        setDraftPropertyId(
          plist[0]
            ? String(
                (plist[0] as any).propertyId ||
                  (plist[0] as any).id,
              )
            : '',
        );
      }
      const gaConnected = Boolean(
        (status as any)?.connected,
      );
      setConnected(gaConnected);
      if (active) await loadReport(startDate, endDate);
    } catch (err: any) {
      setError(
        err?.message || 'Failed to load analytics.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // Period is applied through explicit reloads below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    void init();
  }, [init]);

  function handlePeriod(next: string) {
    setPeriod(next);
    const r = rangeFor(num(next, 28));
    void loadReport(r.startDate, r.endDate);
  }

  function handleWebsite(id: string) {
    setWebsiteId(id);
    if (typeof window !== 'undefined')
      localStorage.setItem('renkoo_website_id', id);
    void loadGrowth(id);
  }

  async function handleSelectProperty(id: string) {
    if (!id || selecting) return;
    try {
      setSelecting(true);
      setPropertyError('');
      await selectGoogleAnalyticsProperty(id);
      setPropertyId(id);
      setHasSelection(true);
      // Reload the report for the newly selected property.
      await loadReport(startDate, endDate);
    } catch (err: any) {
      setPropertyError(
        err?.message || 'Could not select property.',
      );
    } finally {
      setSelecting(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await init();
  }

  const daily: any[] = useMemo(() => {
    const r = report as any;
    const list = Array.isArray(r)
      ? r
      : Array.isArray(r?.rows)
        ? r.rows
        : Array.isArray(r?.daily)
          ? r.daily
          : [];
    return list;
  }, [report]);

  const trendPoints: TrendPoint[] = useMemo(
    () =>
      daily
        .map((d: any) => ({
          x: String(d.date || d.day || d.label || ''),
          y: num(
            d.users ?? d.sessions ?? d.visits ?? 0,
          ),
        }))
        .filter((p: TrendPoint) => p.x),
    [daily],
  );

  const channels = useMemo(() => {
    const r = report as any;
    const list = Array.isArray(r?.channels)
      ? r.channels
      : Array.isArray(r?.sources)
        ? r.sources
        : Array.isArray(r?.byChannel)
          ? r.byChannel
          : [];
    return list
      .map((c: any) => ({
        label: String(
          c.channel || c.source || c.label || '—',
        ),
        value: num(c.users ?? c.sessions ?? c.value ?? 0),
      }))
      .filter((b: { label: string; value: number }) => b.value > 0)
      .sort((a: { value: number }, b: { value: number }) => b.value - a.value)
      .slice(0, 8);
  }, [report]);

  const landingPages: any[] = useMemo(() => {
    const r = report as any;
    const list = Array.isArray(r?.landingPages)
      ? r.landingPages
      : Array.isArray(r?.pages)
        ? r.pages
        : [];
    return list;
  }, [report]);

  const totals = useMemo(() => {
    const r = report as any;
    const t = r?.totals || r?.summary || {};
    return {
      users: t.users ?? r?.users ?? null,
      sessions: t.sessions ?? r?.sessions ?? null,
      engagement:
        t.engagementRate ??
        t.engagement ??
        r?.engagementRate ??
        null,
      conversions:
        t.conversions ?? r?.conversions ?? null,
      lastActivity:
        r?.lastActivity ||
        r?.dateRange?.endDate ||
        t.lastActivity ||
        null,
      coverage:
        r?.coverage ||
        r?.dataFreshness ||
        t.coverage ||
        null,
    };
  }, [report]);

  const leadTotal =
    (leads as any)?.total ?? (leads as any)?.count ?? null;
  const revenueTotal =
    (revenue as any)?.total ??
    (revenue as any)?.totalRevenue ??
    null;
  const revenueCurrency =
    (revenue as any)?.currency ||
    (roi as any)?.currency ||
    undefined;

  const funnelStages = useMemo(() => {
    const stages: Array<{
      label: string;
      value: number;
      href?: string;
    }> = [];
    const users = num(totals.users, NaN);
    if (Number.isFinite(users))
      stages.push({ label: 'Traffic', value: users });
    if (typeof leadTotal === 'number')
      stages.push({
        label: 'Leads',
        value: leadTotal,
        href: '/leads',
      });
    const conv = num(totals.conversions, NaN);
    if (Number.isFinite(conv))
      stages.push({ label: 'Conversions', value: conv });
    if (typeof revenueTotal === 'number')
      stages.push({
        label: 'Revenue',
        value: revenueTotal,
        href: '/roi',
      });
    return stages;
  }, [totals, leadTotal, revenueTotal]);

  const landingColumns: DataTableColumn<any>[] = [
    {
      key: 'page',
      label: 'Landing page',
      priority: 'high',
      render: (r) => (
        <span
          className="block max-w-[300px] truncate font-medium text-rk-ink"
          title={String(
            r.page || r.path || r.url || r.label || '—',
          )}
        >
          {String(
            r.page || r.path || r.url || r.label || '—',
          )}
        </span>
      ),
    },
    {
      key: 'users',
      label: 'Users',
      align: 'right',
      priority: 'high',
      sortable: true,
      sortValue: (r) => num(r.users ?? r.sessions ?? 0),
      render: (r) => (
        <span className="rk-number">
          {fmtInt(r.users ?? r.sessions ?? 0)}
        </span>
      ),
    },
    {
      key: 'conversions',
      label: 'Conversions',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) => num(r.conversions ?? 0),
      render: (r) => (
        <span className="rk-number">
          {r.conversions !== undefined
            ? fmtInt(r.conversions)
            : '—'}
        </span>
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
        eyebrow="Money"
        title="Traffic & Analytics"
        description="Is traffic helping growth? Measured GA4 performance linked to leads and revenue where the data exists."
        actions={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => void handleRefresh()}
              disabled={refreshing || loading}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </SecondaryButton>
            <Link href="/roi">
              <PrimaryButton type="button">
                ROI & Outcomes
              </PrimaryButton>
            </Link>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="Google Analytics"
              connected={connected === true}
            />
            {!loading && connected ? (
              <FreshnessBadge
                label={
                  totals.lastActivity
                    ? `Updated ${fmtDate(totals.lastActivity)} · ${startDate} → ${endDate}`
                    : `${startDate} → ${endDate}`
                }
              />
            ) : null}
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading analytics" />
        </div>
      ) : error && !report ? (
        <div className="mt-6">
          <ErrorState
            title="Analytics failed to load"
            description={error}
            onRetry={() => {
              setLoading(true);
              void init();
            }}
          />
        </div>
      ) : connected === false ? (
        <div className="mt-6">
          <NotConnectedState
            title="Google Analytics is not connected"
            description="Traffic intelligence needs a connected GA4 property. RENKOO shows nothing here until the connection exists."
            connectLabel="Open integrations"
            connectHref="/integrations"
          />
        </div>
      ) : properties.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No GA4 properties found"
            description="The connected Google account has no Google Analytics 4 properties RENKOO can read. Create or get access to a GA4 property, then refresh."
            actionLabel="Refresh"
            onAction={() => {
              setLoading(true);
              void init();
            }}
          />
        </div>
      ) : !hasSelection ? (
        <div className="mt-6">
          <Panel
            eyebrow="Action required"
            title="Google Analytics is connected, but no GA4 property is selected"
            description="Select your GA4 property to start importing traffic data. This is not a billing issue — RENKOO only reads real data for the property you choose."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                aria-label="GA4 property"
                value={draftPropertyId}
                onChange={(event) =>
                  setDraftPropertyId(
                    event.target.value,
                  )
                }
                className="rk-focusable min-w-0 flex-1 rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-sm"
              >
                {properties.map((p: any) => {
                  const value = String(
                    p.propertyId || p.id,
                  );
                  return (
                    <option
                      key={value}
                      value={value}
                    >
                      {String(
                        p.displayName ||
                          value,
                      )}
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                disabled={
                  selecting || !draftPropertyId
                }
                onClick={() =>
                  void handleSelectProperty(
                    draftPropertyId,
                  )
                }
                className="rk-focusable shrink-0 rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {selecting
                  ? 'Selecting…'
                  : 'Select property'}
              </button>
            </div>

            {propertyError ? (
              <p className="rk-body mt-2">
                {propertyError}
              </p>
            ) : null}
          </Panel>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Context"
            title="Property, website & period"
            description="Traffic comes from GA4; growth context comes from the selected website."
          >
            <FilterBar
              selects={[
                {
                  key: 'property',
                  label: 'GA4 property',
                  value: propertyId,
                  options: properties.map((p: any) => ({
                    value: String(
                      p.propertyId || p.id,
                    ),
                    label: String(
                      p.displayName ||
                        p.name ||
                        p.propertyId ||
                        p.id,
                    ),
                  })),
                  onChange: (v) =>
                    void handleSelectProperty(v),
                },
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
                  key: 'period',
                  label: 'Period',
                  value: period,
                  options: [
                    { value: '7', label: 'Last 7 days' },
                    { value: '28', label: 'Last 28 days' },
                    { value: '90', label: 'Last 90 days' },
                  ],
                  onChange: handlePeriod,
                },
              ]}
              meta={
                selecting ? (
                  <span className="text-xs text-rk-muted">
                    Switching property…
                  </span>
                ) : undefined
              }
            />
          </Panel>

          {error ? (
            <ErrorState
              title="Partial load failure"
              description={error}
              onRetry={() => void init()}
            />
          ) : null}
          {propertyError ? (
            <ErrorState
              title="Report unavailable"
              description={propertyError}
              onRetry={() =>
                void loadReport(startDate, endDate)
              }
            />
          ) : null}

          {!report || daily.length === 0 ? (
            <EmptyState
              title="No traffic data in this period"
              description="GA4 returned no rows for the selected property and period. Try a longer period."
            />
          ) : (
            <>
              <Panel
                eyebrow="Data context"
                title="Coverage & freshness"
                description="What this report actually covers."
              >
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-rk-secondary">
                  <span>
                    Last activity:{' '}
                    <strong className="text-rk-ink">
                      {totals.lastActivity
                        ? fmtDate(totals.lastActivity)
                        : 'Not reported'}
                    </strong>
                  </span>
                  <span>
                    Coverage:{' '}
                    <strong className="text-rk-ink">
                      {totals.coverage
                        ? String(totals.coverage)
                        : 'As returned by GA4'}
                    </strong>
                  </span>
                  <span>
                    Identity:{' '}
                    <strong className="text-rk-ink">
                      Not verified by RENKOO
                    </strong>
                  </span>
                </div>
              </Panel>

              <section aria-label="Key signals">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Users"
                    value={
                      totals.users === null
                        ? '—'
                        : fmtInt(totals.users)
                    }
                    detail="Measured in period"
                  />
                  <Metric
                    label="Sessions"
                    value={
                      totals.sessions === null
                        ? '—'
                        : fmtInt(totals.sessions)
                    }
                    detail="Measured visits"
                  />
                  <Metric
                    label="Engagement"
                    value={
                      totals.engagement === null
                        ? '—'
                        : typeof totals.engagement ===
                            'number'
                          ? `${(totals.engagement <= 1 ? totals.engagement * 100 : totals.engagement).toFixed(1)}%`
                          : String(totals.engagement)
                    }
                    detail="As reported"
                  />
                  <Metric
                    label="Conversions"
                    value={
                      totals.conversions === null
                        ? '—'
                        : fmtInt(totals.conversions)
                    }
                    detail={
                      totals.conversions === null
                        ? 'Not reported for this property'
                        : 'GA4 events'
                    }
                  />
                </div>
              </section>

              <Panel
                eyebrow="Primary visual"
                title="Traffic trend"
                description="Measured users across the period."
              >
                <TrendChart
                  state={
                    trendPoints.length > 0
                      ? 'ready'
                      : 'empty'
                  }
                  points={trendPoints}
                  summary={`Measured users from ${startDate} to ${endDate}.`}
                  formatValue={(v) => fmtInt(v)}
                  emptyTitle="No daily rows"
                  emptyDescription="Totals exist but GA4 returned no daily breakdown."
                />
              </Panel>

              <div className="grid gap-3 lg:grid-cols-2">
                <Panel
                  eyebrow="Acquisition"
                  title="Source / channel"
                  description="Where measured users came from."
                >
                  <BarList
                    state={
                      channels.length > 0
                        ? 'ready'
                        : 'empty'
                    }
                    bars={channels}
                    summary="Measured users by acquisition channel."
                    formatValue={(v) => fmtInt(v)}
                    emptyTitle="No channel breakdown"
                    emptyDescription="GA4 did not return channel attribution for this period."
                  />
                </Panel>

                <Panel
                  eyebrow="Growth link"
                  title="Traffic → leads → revenue"
                  description="Stages appear only where real data supports them. Revenue is never inferred from traffic."
                >
                  {funnelStages.length < 2 ? (
                    <EmptyState
                      title="Growth linkage unavailable"
                      description="Lead and revenue data are not recorded for this website yet. Record leads and revenue to connect traffic to growth."
                      actionLabel="Open leads"
                      actionHref="/leads"
                    />
                  ) : (
                    <FunnelStages
                      stages={funnelStages}
                      summary="Measured funnel from traffic to revenue."
                    />
                  )}
                  {typeof revenueTotal === 'number' && (
                    <p className="rk-number mt-2 text-sm text-rk-secondary">
                      Recorded revenue:{' '}
                      {fmtMoney(
                        revenueTotal,
                        revenueCurrency,
                      )}
                    </p>
                  )}
                </Panel>
              </div>

              {landingPages.length > 0 && (
                <Panel
                  eyebrow="Detail"
                  title="Landing page performance"
                  description="Which pages turn visits into outcomes."
                >
                  <DataTable
                    caption="Landing pages with measured performance"
                    columns={landingColumns}
                    rows={landingPages}
                    keyOf={(r: any, i: number) =>
                      String(r.page || r.path || i)
                    }
                    onRowClick={setDrawerRow}
                    pageSize={12}
                  />
                </Panel>
              )}
            </>
          )}

          <RecommendationCallout
            title="Traffic → growth"
            text="Traffic alone is vanity. Connect it to recorded leads and revenue — then the ROI view tells you what the traffic is worth."
            actionLabel="Open ROI & Outcomes"
            actionHref="/roi"
          />
        </div>
      )}

      <Drawer
        open={drawerRow !== null}
        onClose={() => setDrawerRow(null)}
        eyebrow="Landing page"
        title={String(
          drawerRow?.page ||
            drawerRow?.path ||
            'Landing page',
        )}
        description="Measured performance for this page in the selected period."
      >
        {drawerRow && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Users',
                  value: fmtInt(
                    drawerRow.users ??
                      drawerRow.sessions ??
                      0,
                  ),
                },
                {
                  label: 'Sessions',
                  value: fmtInt(
                    drawerRow.sessions ?? 0,
                  ),
                },
                {
                  label: 'Conversions',
                  value:
                    drawerRow.conversions !==
                    undefined
                      ? fmtInt(drawerRow.conversions)
                      : 'Not reported',
                },
                {
                  label: 'Source',
                  value: 'Google Analytics',
                },
              ]}
            />
            <DrawerSection title="Outcome">
              <InsightBlock
                eyebrow="Growth question"
                title="Did this page help growth?"
              >
                <p className="rk-body mt-1">
                  {drawerRow.conversions !== undefined
                    ? 'Compare its conversions against its traffic share — then decide whether it needs content work, a stronger offer, or more qualified traffic.'
                    : 'No conversion data is reported for this page, so growth impact cannot be assessed from traffic alone.'}
                </p>
              </InsightBlock>
              <div className="mt-2">
                <NextAction
                  label="Review leads & revenue"
                  detail="Recorded outcomes behind the traffic."
                  href="/leads"
                />
              </div>
            </DrawerSection>
          </>
        )}
      </Drawer>
    </AppShell>
  );
}
