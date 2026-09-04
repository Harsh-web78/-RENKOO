'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Target,
  Zap,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';

import {
  createActionFromRecommendation,
  getWebsites,
  getBacklinksOverview,
  getBacklinks,
  getBacklinkDomains,
  getBacklinkOpportunities,
  Website,
} from '../../lib/api';

function number(value: unknown) {
  if (typeof value !== 'number') return '—';
  return new Intl.NumberFormat('en-US').format(value);
}

function priorityClass(priority: string) {
  if (priority === 'HIGH') {
    return 'border-red-200 bg-red-50 text-red-700';
  }

  if (priority === 'MEDIUM') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-slate-200 bg-slate-50 text-slate-600';
}

export default function BacklinksPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [overview, setOverview] = useState<any>(null);
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void loadWebsites();
  }, []);

  useEffect(() => {
    if (websiteId) void loadData();
  }, [websiteId]);

  async function loadWebsites() {
    try {
      setError('');
      const data = await getWebsites();
      setWebsites(data);

      if (data.length > 0) {
        setWebsiteId(data[0].id);
      } else {
        setLoading(false);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load websites');
      setLoading(false);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      setError('');
      setMessage('');

      const [
        overviewData,
        backlinkData,
        domainData,
        opportunityData,
      ] = await Promise.all([
        getBacklinksOverview(websiteId),
        getBacklinks(websiteId),
        getBacklinkDomains(websiteId),
        getBacklinkOpportunities(websiteId),
      ]);

      setOverview(overviewData);

      setBacklinks(
        Array.isArray(backlinkData)
          ? backlinkData
          : backlinkData?.backlinks || [],
      );

      setDomains(
        Array.isArray(domainData)
          ? domainData
          : domainData?.domains || [],
      );

      setOpportunities(
        Array.isArray(opportunityData)
          ? opportunityData
          : opportunityData?.opportunities || [],
      );
    } catch (e: any) {
      setError(e?.message || 'Failed to load backlink intelligence');
    } finally {
      setLoading(false);
    }
  }

  const highPriority = useMemo(
    () =>
      opportunities.filter(
        (item) =>
          String(item.priority || item.severity || '')
            .toUpperCase() === 'HIGH',
      ),
    [opportunities],
  );

  async function createAction(item: any) {
    const recommendationId =
      item.recommendationId ||
      item.recommendation?.id;

    if (!recommendationId) {
      setMessage(
        'This opportunity is not yet linked to an actionable recommendation.',
      );
      return;
    }

    try {
      setActionLoading(String(recommendationId));
      setMessage('');

      await createActionFromRecommendation(
        String(recommendationId),
      );

      setMessage(
        `Action created: ${
          item.title ||
          item.domain ||
          'Backlink opportunity'
        }`,
      );
    } catch (e: any) {
      setMessage(
        e?.message || 'Unable to create action.',
      );
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        mobileOpen={false}
        onClose={() => {}}
      />

      <main className="lg:ml-64">
        <div className="mx-auto max-w-7xl p-5 lg:p-8">

          <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Link2 size={19} />
                </div>

                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                    Backlink Intelligence
                  </h1>

                  <p className="mt-1 text-sm text-slate-500">
                    Turn your link profile into authority opportunities and actions.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={websiteId}
                onChange={(e) =>
                  setWebsiteId(e.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none"
              >
                {websites.map((website) => (
                  <option
                    key={website.id}
                    value={website.id}
                  >
                    {website.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading || !websiteId}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={loading ? 'animate-spin' : ''}
                />
                Refresh
              </button>
            </div>
          </header>

          {error && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertTriangle size={18} className="mt-0.5" />
              <div>
                <div className="font-bold">
                  Backlink data unavailable
                </div>
                <div className="mt-1 text-xs">
                  {error}
                </div>
              </div>
            </div>
          )}

          {!error && (
            <>
              {/* AUTHORITY SNAPSHOT */}

              <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-7">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
                      <ShieldCheck size={15} />
                      Authority snapshot
                    </div>

                    <h2 className="mt-2 text-2xl font-bold text-slate-950">
                      Understand the strength of your link profile
                    </h2>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                      RENKOO uses the backlink data available for this website.
                      No authority or toxicity score is invented when the underlying
                      provider has not supplied one.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 lg:min-w-64">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-blue-500">
                      Opportunities detected
                    </div>

                    <div className="mt-1 text-3xl font-bold text-blue-950">
                      {number(
                        overview?.opportunities ??
                        opportunities.length,
                      )}
                    </div>

                    <div className="mt-1 text-xs text-blue-700">
                      {highPriority.length} high-priority signals
                    </div>
                  </div>
                </div>
              </section>

              {/* CORE METRICS */}

              <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Total backlinks"
                  value={
                    overview?.totalBacklinks ??
                    overview?.total ??
                    backlinks.length
                  }
                  icon={<Link2 size={17} />}
                />

                <Metric
                  label="Referring domains"
                  value={
                    overview?.referringDomains ??
                    overview?.domains ??
                    domains.length
                  }
                  icon={<Target size={17} />}
                />

                <Metric
                  label="Toxic links"
                  value={
                    overview?.toxicBacklinks ??
                    overview?.toxic ??
                    '—'
                  }
                  icon={<ShieldCheck size={17} />}
                />

                <Metric
                  label="Link opportunities"
                  value={
                    overview?.opportunities ??
                    opportunities.length
                  }
                  icon={<Zap size={17} />}
                />
              </section>

              {/* OPPORTUNITY ENGINE */}

              <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Zap size={18} className="text-amber-500" />
                      <h2 className="text-sm font-bold text-slate-900">
                        Link opportunities
                      </h2>
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      Prioritised opportunities from the available backlink intelligence.
                    </p>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
                    {opportunities.length} detected
                  </span>
                </div>

                {loading ? (
                  <Loading />
                ) : opportunities.length === 0 ? (
                  <Empty text="No backlink opportunities are available yet." />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {opportunities.slice(0, 50).map(
                      (item, index) => {
                        const priority =
                          String(
                            item.priority ||
                            item.severity ||
                            'LOW',
                          ).toUpperCase();

                        const recommendationId =
                          item.recommendationId ||
                          item.recommendation?.id;

                        const busy =
                          recommendationId &&
                          actionLoading ===
                            String(recommendationId);

                        return (
                          <div
                            key={item.id || index}
                            className="p-5"
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold ${priorityClass(
                                      priority,
                                    )}`}
                                  >
                                    {priority}
                                  </span>

                                  {item.type && (
                                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                                      {item.type}
                                    </span>
                                  )}
                                </div>

                                <h3 className="mt-3 text-sm font-bold text-slate-900">
                                  {item.title ||
                                    item.domain ||
                                    item.sourceDomain ||
                                    'Link opportunity'}
                                </h3>

                                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                                  {item.description ||
                                    item.recommendation ||
                                    'Potential backlink opportunity detected from available data.'}
                                </p>

                                <div className="mt-3 flex flex-wrap gap-3">
                                  {item.domain && (
                                    <span className="text-[10px] font-semibold text-slate-500">
                                      Domain: {item.domain}
                                    </span>
                                  )}

                                  {item.score != null && (
                                    <span className="text-[10px] font-bold text-blue-600">
                                      Opportunity score: {item.score}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={
                                  !recommendationId ||
                                  Boolean(busy)
                                }
                                onClick={() =>
                                  void createAction(item)
                                }
                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {busy ? (
                                  <Loader2
                                    size={14}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Zap size={14} />
                                )}

                                {busy
                                  ? 'Creating...'
                                  : 'Create action'}
                              </button>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </section>

              {/* REFERRING DOMAINS */}

              <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-6">
                  <div className="flex items-center gap-2">
                    <Target size={18} className="text-blue-600" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Referring domain intelligence
                    </h2>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    Domains currently contributing links to the selected website.
                  </p>
                </div>

                {loading ? (
                  <Loading />
                ) : domains.length === 0 ? (
                  <Empty text="No referring domains available yet." />
                ) : (
                  <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-3">
                    {domains.slice(0, 30).map(
                      (domain, index) => (
                        <div
                          key={
                            domain.id ||
                            domain.domain ||
                            index
                          }
                          className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                        >
                          <div className="truncate text-sm font-bold text-slate-800">
                            {domain.domain ||
                              domain.sourceDomain ||
                              'Unknown domain'}
                          </div>

                          <div className="mt-3 flex items-end justify-between">
                            <div>
                              <div className="text-[10px] text-slate-400">
                                Backlinks
                              </div>

                              <div className="mt-1 text-lg font-bold text-slate-900">
                                {number(
                                  domain.backlinks ??
                                  domain.count ??
                                  0,
                                )}
                              </div>
                            </div>

                            {(domain.domainAuthority != null ||
                              domain.authority != null) && (
                              <div className="text-right">
                                <div className="text-[10px] text-slate-400">
                                  Authority
                                </div>

                                <div className="mt-1 text-sm font-bold text-slate-700">
                                  {domain.domainAuthority ??
                                    domain.authority}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </section>

              {/* BACKLINK PROFILE */}

              <section className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 p-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link2 size={18} className="text-blue-600" />
                      <h2 className="text-sm font-bold text-slate-900">
                        Backlink profile
                      </h2>
                    </div>

                    <p className="mt-1 text-xs text-slate-500">
                      Latest backlink records available to RENKOO.
                    </p>
                  </div>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
                    {number(backlinks.length)}
                  </span>
                </div>

                {loading ? (
                  <Loading />
                ) : backlinks.length === 0 ? (
                  <Empty text="No backlink records available yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="px-5 py-3">
                            Source
                          </th>
                          <th className="px-5 py-3">
                            Target
                          </th>
                          <th className="px-5 py-3">
                            Authority
                          </th>
                          <th className="px-5 py-3">
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {backlinks.slice(0, 100).map(
                          (item, index) => (
                            <tr
                              key={
                                item.id || index
                              }
                              className="hover:bg-slate-50"
                            >
                              <td className="max-w-xs px-5 py-4">
                                {item.sourceUrl ? (
                                  <a
                                    href={
                                      item.sourceUrl
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 truncate font-semibold text-blue-600"
                                  >
                                    {item.sourceDomain ||
                                      item.sourceUrl}

                                    <ExternalLink
                                      size={11}
                                    />
                                  </a>
                                ) : (
                                  <span className="font-semibold text-slate-700">
                                    {item.sourceDomain ||
                                      'Unknown'}
                                  </span>
                                )}

                                {item.anchorText && (
                                  <div className="mt-1 truncate text-xs text-slate-400">
                                    {item.anchorText}
                                  </div>
                                )}
                              </td>

                              <td className="max-w-xs truncate px-5 py-4 text-xs text-slate-500">
                                {item.targetUrl || '—'}
                              </td>

                              <td className="px-5 py-4 text-xs font-bold text-slate-700">
                                {item.domainAuthority ??
                                  item.pageAuthority ??
                                  '—'}
                              </td>

                              <td className="px-5 py-4">
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                                  {item.status ||
                                    'ACTIVE'}
                                </span>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* ACTION CTA */}

              {highPriority.length > 0 && (
                <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      size={19}
                      className="mt-0.5 text-blue-600"
                    />

                    <div>
                      <h2 className="text-sm font-bold text-blue-950">
                        {highPriority.length} high-priority backlink opportunities detected
                      </h2>

                      <p className="mt-1 text-xs leading-5 text-blue-800">
                        Prioritise the strongest opportunities and turn them into execution tasks instead of leaving them as reports.
                      </p>

                      <a
                        href="/actions"
                        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        Open Action Engine
                        <ArrowUpRight size={13} />
                      </a>
                    </div>
                  </div>
                </section>
              )}
            </>
          )}

          {message && (
            <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700 shadow-xl">
              {message}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <span className="text-blue-600">
          {icon}
        </span>
        {label}
      </div>

      <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
        {value}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center p-10">
      <Loader2
        size={20}
        className="animate-spin text-blue-600"
      />
    </div>
  );
}

function Empty({
  text,
}: {
  text: string;
}) {
  return (
    <div className="p-10 text-center">
      <div className="text-sm font-semibold text-slate-700">
        Nothing here yet
      </div>

      <p className="mt-1 text-xs text-slate-500">
        {text}
      </p>
    </div>
  );
}
