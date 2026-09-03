'use client';

import { useEffect, useState } from 'react';
import {
  Link2,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';

import {
  getWebsites,
  getBacklinksOverview,
  getBacklinks,
  getBacklinkDomains,
  getBacklinkOpportunities,
  Website,
} from '../../lib/api';

export default function BacklinksPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [overview, setOverview] = useState<any>(null);
  const [backlinks, setBacklinks] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
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

      if (data.length) {
        setWebsiteId(data[0].id);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load websites');
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      setError('');

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
      setError(e.message || 'Failed to load backlinks');
    } finally {
      setLoading(false);
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

          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Link2
                  size={23}
                  className="text-blue-600"
                />

                <h1 className="text-2xl font-bold">
                  Backlinks & Authority
                </h1>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                Monitor backlink profile, referring domains,
                authority and link opportunities.
              </p>
            </div>

            <div className="flex gap-2">
              <select
                value={websiteId}
                onChange={(e) =>
                  setWebsiteId(e.target.value)
                }
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium"
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
                disabled={loading || !websiteId}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
              >
                <RefreshCw
                  size={15}
                  className={
                    loading ? 'animate-spin' : ''
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

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <Metric
              label="Total Backlinks"
              value={
                overview?.totalBacklinks ??
                overview?.total ??
                backlinks.length
              }
            />

            <Metric
              label="Referring Domains"
              value={
                overview?.referringDomains ??
                overview?.domains ??
                domains.length
              }
            />

            <Metric
              label="Toxic Links"
              value={
                overview?.toxicBacklinks ??
                overview?.toxic ??
                0
              }
            />

            <Metric
              label="Opportunities"
              value={
                overview?.opportunities ??
                opportunities.length
              }
            />

          </div>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-100 p-5">
              <h2 className="text-sm font-bold">
                Backlink Profile
              </h2>
            </div>

            {loading ? (
              <div className="p-8">
                <RefreshCw
                  size={20}
                  className="animate-spin text-blue-600"
                />
              </div>
            ) : backlinks.length === 0 ? (
              <Empty
                text="No backlinks available yet."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
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
                            <a
                              href={
                                item.sourceUrl
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 truncate font-medium text-blue-600"
                            >
                              {item.sourceDomain ||
                                item.sourceUrl ||
                                'Unknown'}

                              <ExternalLink
                                size={11}
                              />
                            </a>

                            {item.anchorText && (
                              <div className="mt-1 text-xs text-slate-400">
                                {item.anchorText}
                              </div>
                            )}
                          </td>

                          <td className="max-w-xs truncate px-5 py-4 text-xs text-slate-500">
                            {item.targetUrl ||
                              '—'}
                          </td>

                          <td className="px-5 py-4 font-semibold">
                            {item.domainAuthority ??
                              item.pageAuthority ??
                              '—'}
                          </td>

                          <td className="px-5 py-4">
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
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

          <div className="mt-6 grid gap-6 lg:grid-cols-2">

            <Panel
              title="Referring Domains"
              count={domains.length}
            >
              {domains.length === 0 ? (
                <Empty text="No referring domains yet." />
              ) : (
                <div className="space-y-2">
                  {domains
                    .slice(0, 10)
                    .map((domain, index) => (
                      <div
                        key={
                          domain.id ||
                          domain.domain ||
                          index
                        }
                        className="flex items-center justify-between rounded-xl bg-slate-50 p-3"
                      >
                        <span className="text-sm font-medium">
                          {domain.domain ||
                            domain.sourceDomain ||
                            'Unknown'}
                        </span>

                        <span className="text-xs font-semibold text-slate-500">
                          {domain.backlinks ??
                            domain.count ??
                            0}{' '}
                          links
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Panel>

            <Panel
              title="Link Opportunities"
              count={opportunities.length}
            >
              {opportunities.length === 0 ? (
                <Empty text="No link opportunities found." />
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
                        <div className="text-sm font-semibold">
                          {item.title ||
                            item.domain ||
                            item.sourceDomain ||
                            'Link opportunity'}
                        </div>

                        <div className="mt-1 text-xs text-slate-500">
                          {item.description ||
                            item.recommendation ||
                            'Potential authority opportunity.'}
                        </div>

                        {item.score != null && (
                          <div className="mt-2 text-xs font-bold text-blue-600">
                            Score: {item.score}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </Panel>

          </div>

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
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium text-slate-500">
        {label}
      </div>

      <div className="mt-2 text-2xl font-bold">
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold">
          {title}
        </h2>

        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
          {count}
        </span>
      </div>

      {children}
    </section>
  );
}

function Empty({
  text,
}: {
  text: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-6 text-center text-xs text-slate-500">
      {text}
    </div>
  );
}
