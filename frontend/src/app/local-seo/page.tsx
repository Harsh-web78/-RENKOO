'use client';

/*
 * RENKOO V2 — Local Growth workspace (Phase 5H).
 * Real Local SEO APIs only: business locations, local
 * health, tracked local queries, citations, competitors
 * and opportunities. Configured vs not-connected vs manual
 * vs provider-unavailable states stay explicit. GBP data is
 * never claimed when GBP is unavailable. Location detail
 * opens in a Drawer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getWebsites,
  getLocalSeoSummary,
  getLocalSeoAudits,
  getLocalSeoOpportunities,
  listBusinessLocations,
  createBusinessLocation,
  deleteBusinessLocation,
  getLocalHealth,
  listTrackedLocalQueries,
  createTrackedLocalQuery,
  deleteTrackedLocalQuery,
  listLocalCitations,
  createLocalCitation,
  listLocalCompetitors,
  createActionFromRecommendation,
  getGbpStatus,
  type Website,
  type BusinessLocation,
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
  DangerButton,
  ConfirmDialog,
  DataSourceBadge,
  FreshnessBadge,
  StatusChip,
  LoadingBlock,
  ErrorState,
  EmptyState,
  NotConnectedState,
  InsightBlock,
  EvidenceList,
  RecommendationCallout,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';

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

export default function LocalSeoPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [locations, setLocations] = useState<
    BusinessLocation[]
  >([]);
  const [locationId, setLocationId] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formMsg, setFormMsg] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [tracked, setTracked] = useState<any[]>([]);
  const [citations, setCitations] = useState<any[]>([]);
  const [localCompetitors, setLocalCompetitors] =
    useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>(
    [],
  );
  const [audits, setAudits] = useState<any[]>([]);
  const [gbp, setGbp] = useState<any>(null);
  const [drawerLoc, setDrawerLoc] =
    useState<BusinessLocation | null>(null);
  const [showLocForm, setShowLocForm] = useState(false);
  const [locForm, setLocForm] = useState({
    name: '',
    city: '',
    phone: '',
  });
  const [savingLoc, setSavingLoc] = useState(false);
  const [deleteLoc, setDeleteLoc] =
    useState<BusinessLocation | null>(null);
  const [deletingLoc, setDeletingLoc] = useState(false);
  const [newQuery, setNewQuery] = useState('');
  const [savingQuery, setSavingQuery] = useState(false);
  const [newCitation, setNewCitation] = useState({
    source: '',
    sourceUrl: '',
  });
  const [savingCitation, setSavingCitation] =
    useState(false);
  const [actionBusy, setActionBusy] = useState<
    Record<string, boolean>
  >({});
  const [actionDone, setActionDone] = useState<
    Record<string, boolean>
  >({});

  const load = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setError('');
      const [
        locRes,
        sum,
        hlth,
        tq,
        cit,
        comp,
        opps,
        aud,
        gbpRes,
      ] = await Promise.all([
        listBusinessLocations(id).catch(() => null),
        getLocalSeoSummary(id).catch(() => null),
        getLocalHealth(id).catch(() => null),
        listTrackedLocalQueries(id).catch(() => null),
        listLocalCitations(id).catch(() => null),
        listLocalCompetitors(id).catch(() => null),
        getLocalSeoOpportunities(id).catch(() => null),
        getLocalSeoAudits(id).catch(() => null),
        getGbpStatus().catch(() => null),
      ]);
      const locs = Array.isArray(locRes)
        ? locRes
        : Array.isArray((locRes as any)?.locations)
          ? (locRes as any).locations
          : [];
      setLocations(locs);
      setSummary(sum);
      setHealth(hlth);
      setTracked(
        Array.isArray(tq)
          ? tq
          : Array.isArray((tq as any)?.queries)
            ? (tq as any).queries
            : [],
      );
      setCitations(
        Array.isArray(cit)
          ? cit
          : Array.isArray((cit as any)?.citations)
            ? (cit as any).citations
            : [],
      );
      setLocalCompetitors(
        Array.isArray(comp)
          ? comp
          : Array.isArray((comp as any)?.competitors)
            ? (comp as any).competitors
            : [],
      );
      setOpportunities(
        Array.isArray(opps)
          ? opps
          : Array.isArray((opps as any)?.opportunities)
            ? (opps as any).opportunities
            : [],
      );
      setAudits(
        Array.isArray(aud)
          ? aud
          : Array.isArray((aud as any)?.audits)
            ? (aud as any).audits
            : [],
      );
      setGbp(gbpRes);
    } catch (err: any) {
      setError(
        err?.message || 'Failed to load local SEO data.',
      );
    }
  }, []);

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
        if (valid) await load(valid);
        else if (list.length === 0) {
          // Fix: clear loading on the no-website path.
          setError(
            'No website found. Add a website first.',
          );
        }
      } catch (err: any) {
        if (!cancelled)
          setError(
            err?.message || 'Failed to load websites.',
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [load]);

  function handleWebsite(id: string) {
    setWebsiteId(id);
    setLocationId('ALL');
    setDrawerLoc(null);
    if (typeof window !== 'undefined')
      localStorage.setItem('renkoo_website_id', id);
    setLoading(true);
    void load(id).finally(() => setLoading(false));
  }

  async function handleCreateLocation() {
    if (
      !websiteId ||
      savingLoc ||
      !locForm.name.trim()
    )
      return;
    try {
      setSavingLoc(true);
      setFormMsg('');
      await createBusinessLocation({
        websiteId,
        name: locForm.name.trim(),
        city: locForm.city.trim() || undefined,
        phone: locForm.phone.trim() || undefined,
      });
      setLocForm({ name: '', city: '', phone: '' });
      setShowLocForm(false);
      await load(websiteId);
    } catch (err: any) {
      setFormMsg(
        err?.message || 'Could not save location.',
      );
    } finally {
      setSavingLoc(false);
    }
  }

  async function handleDeleteLocation() {
    if (!deleteLoc || deletingLoc) return;
    try {
      setDeletingLoc(true);
      await deleteBusinessLocation(deleteLoc.id);
      setDeleteLoc(null);
      setDrawerLoc(null);
      if (websiteId) await load(websiteId);
    } catch (err: any) {
      setFormMsg(
        err?.message || 'Could not delete location.',
      );
      setDeleteLoc(null);
    } finally {
      setDeletingLoc(false);
    }
  }

  async function handleCreateQuery() {
    const q = newQuery.trim();
    if (!websiteId || savingQuery || !q) return;
    try {
      setSavingQuery(true);
      setFormMsg('');
      await createTrackedLocalQuery(websiteId, {
        locationId:
          locationId !== 'ALL' ? locationId : undefined,
        query: q,
      } as any);
      setNewQuery('');
      await load(websiteId);
    } catch (err: any) {
      setFormMsg(
        err?.message || 'Could not track query.',
      );
    } finally {
      setSavingQuery(false);
    }
  }

  async function handleDeleteQuery(id: string) {
    try {
      await deleteTrackedLocalQuery(id);
      if (websiteId) await load(websiteId);
    } catch (err: any) {
      setFormMsg(
        err?.message || 'Could not remove query.',
      );
    }
  }

  async function handleCreateCitation() {
    if (
      !websiteId ||
      savingCitation ||
      !newCitation.source.trim()
    )
      return;
    try {
      setSavingCitation(true);
      setFormMsg('');
      await createLocalCitation({
        websiteId,
        locationId:
          locationId !== 'ALL' ? locationId : undefined,
        source: newCitation.source.trim(),
        sourceUrl:
          newCitation.sourceUrl.trim() || undefined,
      });
      setNewCitation({ source: '', sourceUrl: '' });
      await load(websiteId);
    } catch (err: any) {
      setFormMsg(
        err?.message || 'Could not save citation.',
      );
    } finally {
      setSavingCitation(false);
    }
  }

  async function handleOppAction(opp: any) {
    const key = String(opp.id || opp.title);
    if (actionBusy[key] || actionDone[key] || !opp.id)
      return;
    try {
      setActionBusy((p) => ({ ...p, [key]: true }));
      await createActionFromRecommendation(String(opp.id));
      setActionDone((p) => ({ ...p, [key]: true }));
    } catch {
      /* stays usable */
    } finally {
      setActionBusy((p) => ({ ...p, [key]: false }));
    }
  }

  const healthAreas: any[] = useMemo(() => {
    const list =
      (health as any)?.areas ||
      (health as any)?.checks ||
      [];
    return Array.isArray(list) ? list : [];
  }, [health]);

  const overall =
    (health as any)?.overall ??
    (health as any)?.score ??
    (summary as any)?.score ??
    null;

  const gbpConnected = Boolean(
    (gbp as any)?.connected ?? (gbp as any)?.available,
  );

  const latestAuditDate: string | null = useMemo(() => {
    let latest: string | null = null;
    for (const a of audits) {
      const v = (a as any)?.createdAt || (a as any)?.date;
      if (v && (!latest || String(v) > latest))
        latest = String(v);
    }
    return latest;
  }, [audits]);

  const locationColumns: DataTableColumn<BusinessLocation>[] =
    [
      {
        key: 'name',
        label: 'Location',
        priority: 'high',
        render: (r) => (
          <div className="min-w-0">
            <p className="font-semibold text-rk-ink">
              {r.name}
            </p>
            {(r as any).city || (r as any).address ? (
              <p className="rk-metadata">
                {String(
                  (r as any).city || (r as any).address,
                )}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        priority: 'medium',
        render: (r) => (
          <StatusChip
            status={String(
              (r as any).status ||
                ((r as any).isPrimary
                  ? 'PRIMARY'
                  : 'CONFIGURED'),
            )}
          />
        ),
      },
      {
        key: 'nap',
        label: 'NAP',
        priority: 'low',
        render: (r) => (
          <span className="text-xs text-rk-secondary">
            {(r as any).phone
              ? String((r as any).phone)
              : 'No phone recorded'}
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
        eyebrow="Market"
        title="Local SEO"
        description="Local growth workspace — locations, health, queries, citations and opportunities with honest availability."
        actions={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => {
                setLoading(true);
                void load(websiteId).finally(() =>
                  setLoading(false),
                );
              }}
              disabled={loading}
            >
              Refresh
            </SecondaryButton>
            <Link href="/actions">
              <PrimaryButton type="button">
                Action Engine
              </PrimaryButton>
            </Link>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="Business Profile"
              connected={gbpConnected}
            />
            <FreshnessBadge
              label={
                latestAuditDate
                  ? `Audited ${fmtDate(latestAuditDate)}`
                  : gbpConnected
                    ? 'Provider data'
                    : 'Configured + manual data'
              }
            />
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading local SEO" />
        </div>
      ) : error && locations.length === 0 && !summary ? (
        <div className="mt-6">
          <ErrorState
            title="Local SEO failed to load"
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
            title="Website & location"
            description="Queries, citations and health scope to the selected location."
          >
            <FilterBar
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
                  key: 'location',
                  label: 'Location',
                  value: locationId,
                  options: [
                    {
                      value: 'ALL',
                      label: 'All locations',
                    },
                    ...locations.map((l) => ({
                      value: l.id,
                      label: l.name,
                    })),
                  ],
                  onChange: setLocationId,
                },
              ]}
            />
            {formMsg ? (
              <p className="rk-body mt-2">{formMsg}</p>
            ) : null}
          </Panel>

          {error ? (
            <ErrorState
              title="Partial load failure"
              description={error}
              onRetry={() => void load(websiteId)}
            />
          ) : null}

          {!gbpConnected && (
            <NotConnectedState
              title="Google Business Profile is not connected"
              description="Location data below is configured and manual. Rankings, reviews and live GBP fields are unavailable — RENKOO does not claim them."
              connectLabel="Open integrations"
              connectHref="/integrations"
            />
          )}

          <section aria-label="Local health">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Local health"
                value={
                  overall === null || overall === undefined
                    ? '—'
                    : String(overall)
                }
                detail="Measured areas"
              />
              <Metric
                label="Locations"
                value={fmtInt(locations.length)}
                detail="Configured"
              />
              <Metric
                label="Tracked queries"
                value={fmtInt(tracked.length)}
                detail="Local coverage"
              />
              <Metric
                label="Citations"
                value={fmtInt(citations.length)}
                detail="Recorded"
              />
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              eyebrow="Locations"
              title="Business locations"
              description="Open a row for NAP, coverage and opportunities."
              actions={
                <SecondaryButton
                  onClick={() =>
                    setShowLocForm((s) => !s)
                  }
                >
                  Add location
                </SecondaryButton>
              }
            >
              {showLocForm && (
                <div className="mb-3 flex flex-col gap-2">
                  <input
                    value={locForm.name}
                    onChange={(e) =>
                      setLocForm((f) => ({
                        ...f,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Location name"
                    maxLength={120}
                    className="input w-full"
                  />
                  <div className="flex gap-2">
                    <input
                      value={locForm.city}
                      onChange={(e) =>
                        setLocForm((f) => ({
                          ...f,
                          city: e.target.value,
                        }))
                      }
                      placeholder="City (optional)"
                      maxLength={120}
                      className="input flex-1"
                    />
                    <input
                      value={locForm.phone}
                      onChange={(e) =>
                        setLocForm((f) => ({
                          ...f,
                          phone: e.target.value,
                        }))
                      }
                      placeholder="Phone (optional)"
                      maxLength={40}
                      className="input flex-1"
                    />
                    <PrimaryButton
                      onClick={() =>
                        void handleCreateLocation()
                      }
                      disabled={
                        savingLoc ||
                        !locForm.name.trim()
                      }
                    >
                      {savingLoc ? 'Saving…' : 'Save'}
                    </PrimaryButton>
                  </div>
                </div>
              )}
              {locations.length === 0 ? (
                <EmptyState
                  title="No locations configured"
                  description="Add the business locations you want RENKOO to track."
                />
              ) : (
                <DataTable
                  caption="Configured business locations"
                  columns={locationColumns}
                  rows={locations}
                  keyOf={(r) => r.id}
                  onRowClick={setDrawerLoc}
                />
              )}
            </Panel>

            <Panel
              eyebrow="Health detail"
              title="Local health areas"
              description="Measured areas behind the score."
            >
              {healthAreas.length === 0 ? (
                <EmptyState
                  title="No health breakdown"
                  description="Health areas appear once locations and queries are configured."
                />
              ) : (
                <ul className="divide-y divide-rk-border">
                  {healthAreas.map((a: any, i: number) => (
                    <li
                      key={String(a.area || a.name || i)}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <span className="text-sm font-medium text-rk-ink">
                        {String(
                          a.area || a.name || 'Area',
                        ).replace(/_/g, ' ')}
                      </span>
                      <StatusChip
                        status={String(
                          a.status ||
                            a.state ||
                            'UNKNOWN',
                        )}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel
              eyebrow="Queries"
              title="Tracked local searches"
              description="Queries measured per location."
            >
              <div className="mb-3 flex gap-2">
                <input
                  value={newQuery}
                  onChange={(e) =>
                    setNewQuery(e.target.value)
                  }
                  placeholder="Track a local query…"
                  maxLength={200}
                  className="input flex-1"
                />
                <PrimaryButton
                  onClick={() => void handleCreateQuery()}
                  disabled={savingQuery || !newQuery.trim()}
                >
                  {savingQuery ? 'Adding…' : 'Track'}
                </PrimaryButton>
              </div>
              {tracked.length === 0 ? (
                <EmptyState
                  title="No tracked queries"
                  description="Track the '[service] near me' queries buyers use."
                />
              ) : (
                <ul className="divide-y divide-rk-border">
                  {tracked
                    .slice(0, 10)
                    .map((q: any) => (
                      <li
                        key={String(q.id || q.query)}
                        className="flex items-center justify-between gap-2 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-rk-ink">
                          {String(q.query)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteQuery(
                              String(q.id),
                            )
                          }
                          className="rk-focusable text-xs font-semibold text-rk-danger underline underline-offset-2"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </Panel>

            <Panel
              eyebrow="Citations"
              title="Citation status"
              description="Recorded citations — manual entries stay manual."
            >
              <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                <input
                  value={newCitation.source}
                  onChange={(e) =>
                    setNewCitation((f) => ({
                      ...f,
                      source: e.target.value,
                    }))
                  }
                  placeholder="Directory (e.g. Yelp)"
                  maxLength={120}
                  className="input flex-1"
                />
                <input
                  value={newCitation.sourceUrl}
                  onChange={(e) =>
                    setNewCitation((f) => ({
                      ...f,
                      sourceUrl: e.target.value,
                    }))
                  }
                  placeholder="Listing URL (optional)"
                  maxLength={300}
                  className="input flex-1"
                />
                <PrimaryButton
                  onClick={() =>
                    void handleCreateCitation()
                  }
                  disabled={
                    savingCitation ||
                    !newCitation.source.trim()
                  }
                >
                  {savingCitation ? 'Saving…' : 'Add'}
                </PrimaryButton>
              </div>
              {citations.length === 0 ? (
                <EmptyState
                  title="No citations recorded"
                  description="Record the directories where this business is listed."
                />
              ) : (
                <ul className="divide-y divide-rk-border">
                  {citations
                    .slice(0, 8)
                    .map((c: any, i: number) => (
                      <li
                        key={String(c.id || i)}
                        className="flex items-center justify-between gap-2 py-2"
                      >
                        <span className="text-sm font-medium text-rk-ink">
                          {String(
                            c.source || c.directory,
                          )}
                        </span>
                        <StatusChip
                          status={String(
                            c.status || 'RECORDED',
                          )}
                        />
                      </li>
                    ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            eyebrow="Unavailable, honestly"
            title="Reviews & rankings"
            description="These need provider connections RENKOO does not currently have."
          >
            <InsightBlock
              eyebrow="Provider unavailable"
              title="Reviews and live rankings are not available"
            >
              <p className="rk-body mt-1">
                No review provider or rank tracker is
                connected. Tracked queries above measure
                what you configure; nothing here is
                presented as live ranking or review data.
              </p>
            </InsightBlock>
          </Panel>

          {localCompetitors.length > 0 && (
            <Panel
              eyebrow="Local market"
              title="Attached local competitors"
            >
              <ul className="divide-y divide-rk-border">
                {localCompetitors
                  .slice(0, 6)
                  .map((c: any, i: number) => (
                    <li
                      key={String(c.id || i)}
                      className="py-2 text-sm font-medium text-rk-ink"
                    >
                      {String(c.name || 'Competitor')}
                    </li>
                  ))}
              </ul>
            </Panel>
          )}

          {opportunities.length > 0 && (
            <Panel
              eyebrow="Local opportunities"
              title="What should I do?"
              description="Each opportunity becomes a tracked action."
              actions={
                <Link href="/actions">
                  <SecondaryButton type="button">
                    Open Actions
                  </SecondaryButton>
                </Link>
              }
            >
              <ul className="divide-y divide-rk-border">
                {opportunities
                  .slice(0, 8)
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
                        {opp.id ? (
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
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </Panel>
          )}

          {audits.length > 0 && (
            <Panel
              eyebrow="History"
              title="Recent local audits"
            >
              <DataTable
                caption="Recent local SEO audits"
                columns={[
                  {
                    key: 'date',
                    label: 'Date',
                    priority: 'high',
                    render: (r: any) => (
                      <span className="rk-number">
                        {fmtDate(r.createdAt || r.date)}
                      </span>
                    ),
                  },
                  {
                    key: 'score',
                    label: 'Score',
                    align: 'right',
                    priority: 'high',
                    render: (r: any) => (
                      <span className="rk-number">
                        {r.score ?? '—'}
                      </span>
                    ),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    priority: 'medium',
                    render: (r: any) => (
                      <StatusChip
                        status={String(
                          r.status || 'COMPLETED',
                        )}
                      />
                    ),
                  },
                ]}
                rows={audits.slice(0, 8)}
                keyOf={(r: any, i: number) =>
                  String(r.id || i)
                }
              />
            </Panel>
          )}

          <RecommendationCallout
            title="Local → execution"
            text="Local opportunities become tracked actions. Monitoring measures the outcome."
            actionLabel="Open Opportunity Engine"
            actionHref="/opportunities"
          />
        </div>
      )}

      <Drawer
        open={drawerLoc !== null}
        onClose={() => setDrawerLoc(null)}
        eyebrow="Location detail"
        title={String(drawerLoc?.name || 'Location')}
        description="NAP, coverage, citation status and opportunities for this location."
      >
        {drawerLoc && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Status',
                  value: String(
                    (drawerLoc as any).status ||
                      ((drawerLoc as any).isPrimary
                        ? 'Primary location'
                        : 'Configured'),
                  ).replace(/_/g, ' '),
                },
                {
                  label: 'Phone',
                  value: String(
                    (drawerLoc as any).phone ||
                      'Not recorded',
                  ),
                },
                {
                  label: 'City',
                  value: String(
                    (drawerLoc as any).city ||
                      (drawerLoc as any).address ||
                      'Not recorded',
                  ),
                },
                {
                  label: 'Query coverage',
                  value: `${tracked.length} tracked quer${tracked.length === 1 ? 'y' : 'ies'}`,
                },
                {
                  label: 'Citations',
                  value: `${citations.length} recorded`,
                },
                {
                  label: 'Reviews',
                  value:
                    'Unavailable — no review provider connected',
                },
              ]}
            />
            <DrawerSection title="Opportunities here">
              {opportunities.length === 0 ? (
                <p className="rk-body">
                  No location opportunities measured right
                  now.
                </p>
              ) : (
                <EvidenceList
                  items={opportunities
                    .slice(0, 5)
                    .map((o: any) => ({
                      text: String(o.title),
                      source: 'Local SEO',
                    }))}
                />
              )}
            </DrawerSection>
            <DrawerSection title="Danger zone">
              <DangerButton
                onClick={() =>
                  setDeleteLoc(drawerLoc)
                }
              >
                Remove location
              </DangerButton>
            </DrawerSection>
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={deleteLoc !== null}
        title="Remove location?"
        description={`"${deleteLoc?.name || ''}" will stop being tracked. This cannot be undone.`}
        confirmLabel="Remove"
        cancelLabel="Keep"
        tone="danger"
        confirming={deletingLoc}
        onConfirm={() => void handleDeleteLocation()}
        onCancel={() => setDeleteLoc(null)}
      />
    </AppShell>
  );
}
