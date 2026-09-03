'use client';

import { useEffect, useState } from 'react';
import {
  MapPin,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Target,
  ExternalLink,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';
import {
  getWebsites,
  getLocalSeoSummary,
  getLocalSeoAudits,
  getLocalSeoQueries,
  getLocalSeoOpportunities,
  Website,
  LocalSeoSummary,
} from '../../lib/api';

export default function LocalSeoPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [summary, setSummary] =
    useState<LocalSeoSummary | null>(null);
  const [audits, setAudits] = useState<any[]>([]);
  const [queries, setQueries] = useState<any[]>([]);
  const [opportunities, setOpportunities] =
    useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadWebsites();
  }, []);

  useEffect(() => {
    if (websiteId) loadData();
  }, [websiteId]);

  async function loadWebsites() {
    try {
      const data = await getWebsites();
      setWebsites(data);

      if (data.length > 0) {
        setWebsiteId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load websites');
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      setError('');

      const [
        summaryData,
        auditsData,
        queriesData,
        opportunitiesData,
      ] = await Promise.all([
        getLocalSeoSummary(websiteId),
        getLocalSeoAudits(websiteId),
        getLocalSeoQueries(websiteId),
        getLocalSeoOpportunities(websiteId),
      ]);

      setSummary(summaryData);

      setAudits(
        Array.isArray(auditsData)
          ? auditsData
          : auditsData?.audits || [],
      );

      setQueries(
        Array.isArray(queriesData)
          ? queriesData
          : queriesData?.queries || [],
      );

      setOpportunities(
        Array.isArray(opportunitiesData)
          ? opportunitiesData
          : opportunitiesData?.opportunities || [],
      );
    } catch (err: any) {
      setError(
        err.message || 'Failed to load Local SEO data',
      );
    } finally {
      setLoading(false);
    }
  }

  const audit = summary?.audit;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        mobileOpen={false}
        onClose={() => {}}
      />

      <main className="lg:ml-64">
        <div className="mx-auto max-w-7xl p-5 lg:p-8">

          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MapPin
                  size={23}
                  className="text-blue-600"
                />

                <h1 className="text-2xl font-bold text-slate-900">
                  Local SEO
                </h1>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                Track local visibility, citations and
                location-based search performance.
              </p>
            </div>

            <div className="flex gap-2">
              <select
                value={websiteId}
                onChange={(e) =>
                  setWebsiteId(e.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium outline-none"
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
                onClick={loadData}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw
                  size={15}
                  className={
                    loading
                      ? 'animate-spin'
                      : ''
                  }
                />
                Refresh
              </button>
            </div>
          </header>

          {error && (
            <div className="mt-6 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertTriangle size={17} />
              {error}
            </div>
          )}

          {loading ? (
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10">
              <RefreshCw
                size={22}
                className="animate-spin text-blue-600"
              />
            </div>
          ) : (
            <>
              <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">

                <Metric
                  label="Overall Score"
                  value={
                    audit?.overallScore ?? 0
                  }
                />

                <Metric
                  label="Entity Score"
                  value={
                    audit?.entityScore ?? 0
                  }
                />

                <Metric
                  label="Citation Score"
                  value={
                    audit?.citationScore ?? 0
                  }
                />

                <Metric
                  label="Authority Score"
                  value={
                    audit?.authorityScore ?? 0
                  }
                />

                <Metric
                  label="Content Score"
                  value={
                    audit?.contentScore ?? 0
                  }
                />

              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-2">

                <Panel title="Local Search Visibility">
                  <div className="grid grid-cols-3 gap-3">

                    <MiniMetric
                      label="Queries"
                      value={
                        summary?.queries.total ?? 0
                      }
                    />

                    <MiniMetric
                      label="Mentioned"
                      value={
                        summary?.queries.mentioned ?? 0
                      }
                    />

                    <MiniMetric
                      label="Cited"
                      value={
                        summary?.queries.cited ?? 0
                      }
                    />

                  </div>

                  <div className="mt-5 space-y-3">

                    <Progress
                      label="Mention Rate"
                      value={
                        summary?.queries.mentionRate ?? 0
                      }
                    />

                    <Progress
                      label="Citation Rate"
                      value={
                        summary?.queries.citationRate ?? 0
                      }
                    />

                  </div>
                </Panel>

                <Panel title="Local SEO Health">
                  {audit ? (
                    <div className="space-y-3">

                      <HealthRow
                        label="Entity"
                        value={
                          audit.entityScore
                        }
                      />

                      <HealthRow
                        label="Citations"
                        value={
                          audit.citationScore
                        }
                      />

                      <HealthRow
                        label="Authority"
                        value={
                          audit.authorityScore
                        }
                      />

                      <HealthRow
                        label="Content"
                        value={
                          audit.contentScore
                        }
                      />

                    </div>
                  ) : (
                    <EmptyState
                      title="No local audit yet"
                      description="Local SEO audit data will appear here once available."
                    />
                  )}
                </Panel>

              </section>

              <section className="mt-5 grid gap-5 lg:grid-cols-2">

                <Panel title="Local Queries">
                  {queries.length === 0 ? (
                    <EmptyState
                      title="No queries found"
                      description="No local search queries have been recorded yet."
                    />
                  ) : (
                    <div className="space-y-2">
                      {queries
                        .slice(0, 10)
                        .map((query, index) => (
                          <div
                            key={
                              query.id ||
                              index
                            }
                            className="flex items-center justify-between rounded-xl bg-slate-50 p-3"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">
                                {query.query ||
                                  'Unnamed query'}
                              </div>

                              <div className="mt-1 text-xs text-slate-500">
                                {query.engine ||
                                  'Local search'}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              {query.mentioned && (
                                <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                                  Mentioned
                                </span>
                              )}

                              {query.cited && (
                                <span className="rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">
                                  Cited
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </Panel>

                <Panel title="Local Opportunities">
                  {opportunities.length === 0 ? (
                    <EmptyState
                      title="No opportunities yet"
                      description="Actionable local SEO opportunities will appear here."
                    />
                  ) : (
                    <div className="space-y-2">
                      {opportunities
                        .slice(0, 10)
                        .map((item, index) => (
                          <div
                            key={
                              item.id ||
                              index
                            }
                            className="rounded-xl border border-slate-100 p-4"
                          >
                            <div className="flex items-start gap-3">
                              <Target
                                size={17}
                                className="mt-0.5 text-blue-600"
                              />

                              <div>
                                <div className="text-sm font-semibold">
                                  {item.title ||
                                    item.query ||
                                    item.type ||
                                    'Local opportunity'}
                                </div>

                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {item.recommendation ||
                                    item.description ||
                                    'Review this opportunity to improve local visibility.'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </Panel>

              </section>

              <section className="mt-5">
                <Panel title="Recent Local Audits">
                  {audits.length === 0 ? (
                    <EmptyState
                      title="No audit history"
                      description="Completed local SEO audits will appear here."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-xs text-slate-500">
                            <th className="pb-3">
                              Date
                            </th>
                            <th className="pb-3">
                              Overall
                            </th>
                            <th className="pb-3">
                              Entity
                            </th>
                            <th className="pb-3">
                              Citation
                            </th>
                            <th className="pb-3">
                              Authority
                            </th>
                            <th className="pb-3">
                              Content
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {audits
                            .slice(0, 20)
                            .map(
                              (
                                item,
                                index,
                              ) => (
                                <tr
                                  key={
                                    item.id ||
                                    index
                                  }
                                  className="border-b border-slate-50"
                                >
                                  <td className="py-3">
                                    {item.createdAt
                                      ? new Date(
                                          item.createdAt,
                                        ).toLocaleDateString()
                                      : '—'}
                                  </td>

                                  <td className="py-3 font-bold">
                                    {item.overallScore ??
                                      0}
                                  </td>

                                  <td className="py-3">
                                    {item.entityScore ??
                                      0}
                                  </td>

                                  <td className="py-3">
                                    {item.citationScore ??
                                      0}
                                  </td>

                                  <td className="py-3">
                                    {item.authorityScore ??
                                      0}
                                  </td>

                                  <td className="py-3">
                                    {item.contentScore ??
                                      0}
                                  </td>
                                </tr>
                              ),
                            )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium text-slate-500">
        {label}
      </div>

      <div className="mt-3 text-3xl font-bold text-slate-900">
        {value}
      </div>

      <div className="mt-4 h-1.5 rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full bg-blue-600"
          style={{
            width: `${Math.min(
              Math.max(value, 0),
              100,
            )}%`,
          }}
        />
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="text-[10px] font-semibold text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-xl font-bold">
        {value}
      </div>
    </div>
  );
}

function Progress({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const safe = Math.min(
    Math.max(value, 0),
    100,
  );

  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-medium text-slate-600">
          {label}
        </span>

        <span className="font-bold">
          {safe.toFixed(1)}%
        </span>
      </div>

      <div className="mt-2 h-2 rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-blue-600"
          style={{
            width: `${safe}%`,
          }}
        />
      </div>
    </div>
  );
}

function HealthRow({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2
          size={15}
          className="text-emerald-600"
        />

        <span className="text-sm font-medium">
          {label}
        </span>
      </div>

      <span className="text-sm font-bold">
        {value}/100
      </span>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-5 text-center">
      <ExternalLink
        size={18}
        className="mx-auto text-slate-300"
      />

      <div className="mt-2 text-sm font-semibold text-slate-700">
        {title}
      </div>

      <div className="mt-1 text-xs text-slate-500">
        {description}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-5 text-sm font-bold">
        {title}
      </h2>

      {children}
    </section>
  );
}
