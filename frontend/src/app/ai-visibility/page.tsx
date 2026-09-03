'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import {
  AiVisibilityDashboard,
  AiVisibilityHistory,
  Website,
  createAiVisibilitySnapshot,
  getAiVisibilityDashboard,
  getAiVisibilityHistory,
  getWebsites,
} from '../../lib/api';

import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Globe2,
  MessageSquareText,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';

function scoreLabel(score: number | null) {
  if (score === null) return '—';
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Good';
  if (score >= 45) return 'Needs Work';
  return 'Low';
}

function scoreClass(score: number | null) {
  if (score === null) {
    return 'bg-slate-50 text-slate-400 border-slate-200';
  }

  if (score >= 80) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }

  if (score >= 65) {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }

  if (score >= 45) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }

  return 'bg-red-50 text-red-700 border-red-200';
}

function trendClass(value: number) {
  return value >= 0
    ? 'text-emerald-600'
    : 'text-red-600';
}

type QueryStat = {
  item: { id: string; query: string; category?: string | null };
  checks: Array<{ query: string; status: string; mentioned: boolean; citationFound: boolean; position?: number | null; checkedAt?: string | null; updatedAt: string; createdAt: string }>;
  mentioned: number;
  cited: number;
  visibility: number | null;
  averagePosition: number | null;
};

export default function AiVisibilityPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState('');
  const [dashboard, setDashboard] =
    useState<AiVisibilityDashboard | null>(null);
  const [history, setHistory] =
    useState<AiVisibilityHistory | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showWebsiteMenu, setShowWebsiteMenu] =
    useState(false);
  const [open, setOpen] = useState(false);
  const overallScore = dashboard?.score ?? null;

  const queries = dashboard?.queries ?? [];
  const checks = dashboard?.checks ?? [];

  const completedChecks = checks.filter((check: any) => check.status === 'COMPLETED');

  const averagePosition =
    dashboard?.metrics.averagePosition ?? null;

  const platformStats = useMemo(() => {
    const stats = new Map<string, { completed: number; mentioned: number; cited: number }>();

    completedChecks.forEach((check: any) => {
      const current = stats.get(check.platform) ?? {
        completed: 0,
        mentioned: 0,
        cited: 0,
      };

      current.completed += 1;
      if (check.mentioned) current.mentioned += 1;
      if (check.citationFound) current.cited += 1;

      stats.set(check.platform, current);
    });

    return Array.from(stats.entries()).map(([platform, stats]) => ({
      platform,
      ...stats,
    }));
  }, [completedChecks]);

  const lastCheckedAt = useMemo(() => {
    const timestamps = completedChecks
      .map((check: any) => check.checkedAt ?? check.updatedAt ?? check.createdAt)
      .filter(Boolean)
      .map((value: string) => new Date(value).getTime())
      .filter((value: number) => Number.isFinite(value));

    if (!timestamps.length) return null;
    return new Date(Math.max(...timestamps));
  }, [completedChecks]);

  const queryStats = useMemo(() => {
    return queries.map((item: { id: string; query: string; category?: string | null }): QueryStat => {
      const itemChecks = completedChecks.filter(
        (check: any) => check.query === item.query,
      );
      const mentioned = itemChecks.filter((check: any) => check.mentioned).length;
      const cited = itemChecks.filter((check: any) => check.citationFound).length;
      const positions = itemChecks
        .map((check: any) => check.position)
        .filter((position: number | null | undefined): position is number => position != null);

      return {
        item,
        checks: itemChecks,
        mentioned,
        cited,
        visibility: itemChecks.length
          ? Math.round((mentioned / itemChecks.length) * 100)
          : null,
        averagePosition: positions.length
          ? positions.reduce((sum: number, position: number) => sum + position, 0) /
            positions.length
          : null,
      };
    });
  }, [queries, completedChecks]);

  const historyTrend = useMemo(() => {
    const summaries = history?.summaries ?? [];

    if (summaries.length < 2) return null;

    const previous = summaries[summaries.length - 2];
    const current = summaries[summaries.length - 1];

    return Math.round(
      current.visibilityScore - previous.visibilityScore,
    );
  }, [history]);


  async function loadData(websiteId: string) {
    if (!websiteId) return;

    try {
      setLoading(true);
      setError('');

      const [dashboardData, historyData] =
        await Promise.all([
          getAiVisibilityDashboard(websiteId),
          getAiVisibilityHistory(websiteId, 30),
        ]);

      setDashboard(dashboardData);
      setHistory(historyData);
    } catch (err) {
      console.error('AI Visibility load error:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load AI Visibility data.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadWebsites() {
    try {
      setLoading(true);
      setError('');

      const result = await getWebsites();

      const active = result.filter(
        (website) => website.isActive,
      );

      setWebsites(active);

      if (active.length > 0 && !selectedWebsiteId) {
        setSelectedWebsiteId(active[0].id);
      }

      if (!active.length) {
        setLoading(false);
      }
    } catch (err) {
      console.error('Website load error:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load websites.',
      );

      setLoading(false);
    }
  }

  async function handleRefresh() {
    if (!selectedWebsiteId) return;

    try {
      setRefreshing(true);
      setError('');

      await createAiVisibilitySnapshot(
        selectedWebsiteId,
      );

      await loadData(selectedWebsiteId);
    } catch (err) {
      console.error(
        'AI Visibility refresh error:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to refresh AI Visibility.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadWebsites();
  }, []);

  useEffect(() => {
    if (selectedWebsiteId) {
      loadData(selectedWebsiteId);
    }
  }, [selectedWebsiteId]);
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        mobileOpen={open}
        onClose={() => setOpen(false)}
      />

      <div className="lg:pl-[270px]">
        <main className="min-h-screen bg-slate-50">
      {/* TOP BAR */}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white">
              <Bot size={21} />
            </div>

            <div>
              <div className="text-sm font-semibold text-slate-500">
                RENKO / AI Visibility
              </div>

              <div className="text-xs text-slate-400">
                AEO & GEO intelligence across AI search engines
              </div>
            </div>
          </div>

          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={handleRefresh} disabled={refreshing || !selectedWebsiteId}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-[1500px] p-5 lg:p-8">
  {error && (
    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      AI Visibility Error: {error}
    </div>
  )}
        {/* HERO */}

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:p-7">
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                <Sparkles size={24} />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-900">
                    AI Visibility
                  </h1>

                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-700">
                    AEO / GEO
                  </span>
                </div>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                  Measure how often AI search engines discover,
                  mention and recommend your business for the
                  queries that matter.
                </p>
              </div>
            </div>

            {/* WEBSITE SELECTOR */}

            <button
              type="button"
              onClick={() => setShowWebsiteMenu((value) => !value)}
              disabled={websites.length === 0}
              className="flex min-w-[280px] items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <Globe2 size={18} />
                </div>

                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-400">
                    Active Website
                  </div>

                  <div className="truncate text-sm font-bold text-slate-900">
                    {dashboard?.website?.name ?? websites.find((w) => w.id === selectedWebsiteId)?.name ?? "Select Website"}
                  </div>
                </div>
              </div>

              <ChevronDown size={17} />
            </button>

            {showWebsiteMenu && websites.length > 0 && (
              <div className="absolute right-0 z-20 mt-2 w-[280px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                {websites.map((website) => (
                  <button
                    key={website.id}
                    type="button"
                    onClick={() => {
                      setSelectedWebsiteId(website.id);
                      setShowWebsiteMenu(false);
                    }}
                    className={`block w-full px-4 py-3 text-left transition hover:bg-slate-50 ${
                      website.id === selectedWebsiteId ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {website.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-400">
                      {website.url}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
              Website
            </div>

            <div className="mt-1 text-sm font-semibold text-slate-800">
              {dashboard?.website?.url ?? websites.find((w) => w.id === selectedWebsiteId)?.url ?? "No website selected"}
            </div>
          </div>
        </div>

        {/* SCORE CARDS */}

        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {/* AI VISIBILITY SCORE */}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500">
                AI Visibility Score
              </div>

              <div className="grid h-9 w-9 place-items-center rounded-lg bg-violet-50 text-violet-600">
                <Bot size={18} />
              </div>
            </div>

            <div className="mt-4 flex items-end gap-3">
              <div className="text-4xl font-bold text-slate-900">
                {overallScore ?? '—'}
              </div>

              <span
                className={`mb-1 rounded-full border px-2.5 py-1 text-xs font-bold ${scoreClass(
                  overallScore,
                )}`}
              >
                {scoreLabel(overallScore)}
              </span>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-violet-600"
                style={{
                  width: `${overallScore ?? 0}%`,
                }}
              />
            </div>

            <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-slate-400">
  {historyTrend != null
    ? `${historyTrend >= 0 ? "+" : ""}${historyTrend}% vs previous snapshot`
    : "No previous snapshot"}
</div>
          </div>

          {/* AI MENTIONS */}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500">
                AI Mentions
              </div>

              <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <MessageSquareText size={18} />
              </div>
            </div>

            <div className="mt-4 text-4xl font-bold text-slate-900">
              {dashboard?.metrics?.mentionedQueries ?? 0}
            </div>

            <div className="mt-2 text-xs text-slate-400">
              Mentions detected across tracked queries
            </div>

            <div className="mt-3 text-xs font-semibold text-slate-400">
  {dashboard?.metrics?.mentionedQueries ?? 0} currently mentioned
</div>
          </div>

          {/* QUERIES */}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500">
                Queries Tracked
              </div>

              <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                <Search size={18} />
              </div>
            </div>

            <div className="mt-4 text-4xl font-bold text-slate-900">
              {dashboard?.metrics?.totalQueries ?? 0}
            </div>

            <div className="mt-2 text-xs text-slate-400">
              Commercial, local and informational queries
            </div>

            <div className="mt-3 text-xs font-semibold text-slate-500">
              {completedChecks.length > 0 ? `${new Set(completedChecks.map((c: any) => c.platform)).size} platforms checked` : "No completed checks yet"}
            </div>
          </div>

          {/* AI POSITION */}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500">
                Avg. AI Position
              </div>

              <div className="grid h-9 w-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
                <Target size={18} />
              </div>
            </div>

            <div className="mt-4 text-4xl font-bold text-slate-900">
              {averagePosition != null ? `#${averagePosition.toFixed(1)}` : "—"}
            </div>

            <div className="mt-2 text-xs text-slate-400">
              Average position when your business is mentioned
            </div>

            <div className="mt-3 text-xs font-semibold text-slate-400">
  Based on completed AI checks
</div>
          </div>
        </div>

        {/* PLATFORM VISIBILITY */}

        <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                AI Platform Visibility
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Platforms returned by real AI visibility checks.
              </p>
            </div>

            <span className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Activity size={14} />
              {lastCheckedAt
                ? `Last checked ${lastCheckedAt.toLocaleString()}`
                : 'No completed checks yet'}
            </span>
          </div>

          {platformStats.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
              No completed AI platform checks are available for this website yet.
              Refresh after real AI visibility tracking has been configured.
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {platformStats.map((platform) => {
                const mentionRate = platform.completed
                  ? Math.round((platform.mentioned / platform.completed) * 100)
                  : 0;
                const citationRate = platform.completed
                  ? Math.round((platform.cited / platform.completed) * 100)
                  : 0;

                return (
                  <div
                    key={platform.platform}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-sm font-black text-slate-700">
                        {platform.platform.slice(0, 4).toUpperCase()}
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                        CHECKED
                      </span>
                    </div>

                    <div className="mt-4 text-sm font-bold text-slate-900">
                      {platform.platform}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <div className="text-slate-400">Mention</div>
                        <div className="mt-1 font-bold text-slate-800">
                          {mentionRate}%
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <div className="text-slate-400">Citation</div>
                        <div className="mt-1 font-bold text-slate-800">
                          {citationRate}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* QUERY PERFORMANCE */}

        <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                AI Query Performance
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Queries where RENKO is measuring AI visibility,
                mentions and position.
              </p>
            </div>

            <button
              type="button"
              disabled
              title="Query management UI is not connected to a CRUD route yet"
              className="flex cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-400"
            >
              Query Management Pending
              <ExternalLink size={15} />
            </button>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Query</th>
                  <th className="px-4 py-3">Intent</th>
                  <th className="px-4 py-3">Visibility</th>
                  <th className="px-4 py-3">Mentions</th>
                  <th className="px-4 py-3">AI Position</th>
                  <th className="px-4 py-3">Trend</th>
                </tr>
              </thead>

              <tbody>
                {queryStats.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-slate-400"
                    >
                      No AI visibility queries are configured for this website.
                    </td>
                  </tr>
                ) : (
                  queryStats.map(({ item, checks: itemChecks, mentioned, visibility, averagePosition }: QueryStat) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">
                          {item.query}
                        </div>
                      </td>

                      <td className="px-4 py-4">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {item.category ?? 'General'}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-violet-600"
                              style={{
                                width: `${visibility ?? 0}%`,
                              }}
                            />
                          </div>
                          <span className="font-bold">
                            {visibility != null ? `${visibility}%` : '—'}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-4 font-bold">
                        {mentioned}
                      </td>

                      <td className="px-4 py-4 font-bold">
                        {averagePosition != null
                          ? `#${averagePosition.toFixed(1)}`
                          : '—'}
                      </td>

                      <td className="px-4 py-4">
                        <span className="font-semibold text-slate-400">
                          —
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* AEO / GEO SIGNALS */}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* AEO */}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600">
                <MessageSquareText size={19} />
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  AEO Ã¢â‚¬” Answer Engine Optimization
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Optimize your content so AI systems can extract
                  clear, useful answers about your business.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <SignalRow
                title="Answer-focused content"
                score={typeof (dashboard?.aeo as any)?.score === 'number' ? (dashboard?.aeo as any).score : null}
              />

              <SignalRow
                title="Question coverage"
                score={typeof (dashboard?.aeo as any)?.questionCoverage === 'number' ? (dashboard?.aeo as any).questionCoverage : null}
              />

              <SignalRow
                title="Entity clarity"
                score={typeof (dashboard?.aeo as any)?.entityClarity === 'number' ? (dashboard?.aeo as any).entityClarity : null}
              />

              <SignalRow
                title="Structured information"
                score={typeof (dashboard?.aeo as any)?.structuredInformation === 'number' ? (dashboard?.aeo as any).structuredInformation : null}
              />
            </div>
          </div>

          {/* GEO */}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <Globe2 size={19} />
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  GEO Ã¢â‚¬” Generative Engine Optimization
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Improve the signals that help generative search
                  systems discover, understand and cite your brand.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <SignalRow
                title="Brand discoverability"
                score={typeof (dashboard?.geo as any)?.discoverability === 'number' ? (dashboard?.geo as any).discoverability : null}
              />

              <SignalRow
                title="Topical authority"
                score={typeof (dashboard?.geo as any)?.authority === 'number' ? (dashboard?.geo as any).authority : null}
              />

              <SignalRow
                title="Local relevance"
                score={typeof (dashboard?.geo as any)?.localRelevance === 'number' ? (dashboard?.geo as any).localRelevance : null}
              />

              <SignalRow
                title="Citation potential"
                score={
                  dashboard?.metrics.citedQueries != null &&
                  dashboard.metrics.totalQueries > 0
                    ? Math.round(
                        (dashboard.metrics.citedQueries /
                          dashboard.metrics.totalQueries) *
                          100,
                      )
                    : null
                }
              />
            </div>
          </div>
        </div>

        {/* RECOMMENDATIONS */}

        <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
              <Sparkles size={19} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                RENKO AI Visibility Recommendations
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Recommendations will be shown here when the backend analysis
                returns actionable AI visibility opportunities.
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5">
            <div className="text-sm font-semibold text-slate-800">
              {completedChecks.length
                ? 'No AI visibility recommendations returned yet'
                : 'Not enough AI visibility data yet'}
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              RENKO will not invent recommendations from preview data. Run real
              AI visibility checks first, then surface recommendations from the
              connected analysis layer.
            </p>
          </div>
        </div>

        {/* NEXT CHECK */}

        <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2
                size={21}
                className="mt-0.5 shrink-0 text-violet-600"
              />

              <div>
                <div className="text-sm font-bold text-violet-900">
                  AI Visibility tracking is ready
                </div>

                <p className="mt-1 text-sm leading-6 text-violet-700">
                  Connect real AI query checks to replace the
                  dashboard preview data with live AEO/GEO
                  intelligence.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled
              title="AI visibility provider configuration is not connected yet"
              className="flex shrink-0 cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-300 px-5 py-3 text-sm font-bold text-white"
            >
              Provider Setup Pending
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>

        {/* FOOTNOTE */}

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <AlertCircle
            size={17}
            className="mt-0.5 shrink-0 text-slate-400"
          />

          <p className="text-xs leading-5 text-slate-500">
            AI visibility metrics are based on tracked queries
            and platform responses. AEO focuses on answer
            extraction and clarity, while GEO focuses on
            discoverability, authority and generative search
            visibility.
          </p>
        </div>
        </section>
        </main>
      </div>
    </div>
  );
}

function SignalRow({
  title,
  score,
}: {
  title: string;
  score: number | null;
}) {
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-semibold text-slate-700">
          {title}
        </div>

        <div className="text-sm font-bold text-slate-900">
          {score ?? '—'}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-violet-500"
          style={{
            width: `${score ?? 0}%`,
          }}
        />
      </div>

      <div className="mt-2 text-xs text-slate-400">
        {scoreLabel(score)}
      </div>
    </div>
  );
}










