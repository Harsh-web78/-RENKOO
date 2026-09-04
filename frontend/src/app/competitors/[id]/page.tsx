'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  Globe2,
  Layers,
  Loader2,
  Menu,
  Minus,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';

import Sidebar from '@/components/Sidebar';
import {
  getCompetitorComparison,
  crawlCompetitor,
  createAction,
  type CompetitorComparisonResponse,
  type ComparisonOpportunity,
  type MetricComparison,
  type PageGap,
} from '@/lib/api';

type Tab = 'opportunities' | 'metrics' | 'pages';
type PriorityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

function formatDate(isoString?: string | null) {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function formatPercent(value: number) {
  return `${(Number(value) || 0).toFixed(1)}%`;
}

function getPriorityBadgeClass(priority: string) {
  switch (priority?.toUpperCase()) {
    case 'CRITICAL':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'HIGH':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'MEDIUM':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'LOW':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function getEffortBadgeClass(effort: string) {
  switch (effort?.toUpperCase()) {
    case 'LOW':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'MEDIUM':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'HIGH':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    default:
      return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function getStatusBadge(status: 'STRONGER' | 'WEAKER' | 'EQUAL') {
  if (status === 'STRONGER') {
    return {
      label: 'Advantage: You are Leading',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: TrendingUp,
      iconClass: 'text-emerald-600',
    };
  }
  if (status === 'WEAKER') {
    return {
      label: 'Deficit: Competitor Leading',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
      icon: TrendingDown,
      iconClass: 'text-amber-600',
    };
  }
  return {
    label: 'Equilibrium: Performance Matched',
    className: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: Minus,
    iconClass: 'text-blue-600',
  };
}

export default function CompetitorComparisonPage() {
  const params = useParams();
  const router = useRouter();
  const competitorId = String(params?.id || '');

  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<CompetitorComparisonResponse | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('opportunities');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL');

  const [actionLoadingMap, setActionLoadingMap] = useState<Record<string, boolean>>({});
  const [actionSuccessMap, setActionSuccessMap] = useState<Record<string, boolean>>({});

  const loadComparison = useCallback(async (isRefresh = false) => {
    if (!competitorId) return;

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');

      const result = await getCompetitorComparison(competitorId);
      setData(result);
    } catch (err: any) {
      console.error('[RENKOO] Competitor comparison error:', err);
      setError(
        err?.message ||
          'Unable to generate competitor comparison. Ensure both your website and competitor have completed crawls.',
      );
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [competitorId]);

  useEffect(() => {
    loadComparison();
  }, [loadComparison]);

  const handleCrawlCompetitor = async () => {
    if (!competitorId || crawling) return;

    try {
      setCrawling(true);
      setError('');
      await crawlCompetitor(competitorId);

      const pollInterval = setInterval(async () => {
        try {
          const freshData = await getCompetitorComparison(competitorId);
          setData(freshData);
          setCrawling(false);
          clearInterval(pollInterval);
        } catch {
          // Still crawling
        }
      }, 3000);

      setTimeout(() => {
        clearInterval(pollInterval);
        setCrawling(false);
      }, 60000);
    } catch (err: any) {
      setError(err?.message || 'Failed to start competitor crawl.');
      setCrawling(false);
    }
  };

  const handleCreateAction = async (opportunity: ComparisonOpportunity) => {
    const oppId = opportunity.id;
    if (actionLoadingMap[oppId] || actionSuccessMap[oppId]) return;

    try {
      setActionLoadingMap((prev) => ({ ...prev, [oppId]: true }));
      await createAction({
        websiteId: data?.comparison?.renkoo?.websiteId,
        type: 'COMPETITOR_GAP',
        title: opportunity.title,
        description: `${opportunity.description} — Recommendation: ${opportunity.recommendation}`,
        priority: opportunity.priority === 'CRITICAL' ? 'HIGH' : opportunity.priority,
        metadata: {
          competitorId,
          competitorName: data?.comparison?.competitor?.name,
          impactScore: opportunity.impactScore,
          effort: opportunity.effort,
          opportunityType: opportunity.type,
        },
      });

      setActionSuccessMap((prev) => ({ ...prev, [oppId]: true }));
    } catch (err: any) {
      console.error('[RENKOO] Failed to add action:', err);
      alert(err?.message || 'Unable to add action to workspace.');
    } finally {
      setActionLoadingMap((prev) => ({ ...prev, [oppId]: false }));
    }
  };

  const filteredOpportunities = useMemo(() => {
    if (!data?.opportunities) return [];
    if (priorityFilter === 'ALL') return data.opportunities;
    return data.opportunities.filter(
      (opp) => opp.priority.toUpperCase() === priorityFilter,
    );
  }, [data?.opportunities, priorityFilter]);

  const statusInfo = data?.comparison?.status
    ? getStatusBadge(data.comparison.status)
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <main className="lg:pl-[270px]">
        <header className="flex h-[72px] items-center justify-between border-b border-slate-100 bg-white px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="mr-1 lg:hidden text-slate-600"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              type="button"
            >
              <Menu size={22} />
            </button>

            <Link
              href="/competitors"
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
            >
              <ArrowLeft size={15} />
              <span>Competitors</span>
            </Link>

            <span className="text-slate-300">/</span>

            <div className="truncate text-xs font-semibold text-slate-700">
              {data?.comparison?.competitor?.name
                ? `${data.comparison.competitor.name} vs ${data.comparison.renkoo.websiteName}`
                : 'Competitor Intelligence'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadComparison(true)}
              disabled={loading || refreshing || crawling}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={14}
                className={refreshing || loading ? 'animate-spin' : ''}
              />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleCrawlCompetitor}
              disabled={crawling || loading}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {crawling ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Crawling...</span>
                </>
              ) : (
                <>
                  <Play size={14} />
                  <span>Crawl Competitor</span>
                </>
              )}
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] p-5 lg:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Competitor Comparison
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Detailed side-by-side gap analysis of technical health, content depth, structured data, and high-impact SEO opportunities.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-600" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-red-800">
                    Comparison Analysis Error
                  </div>
                  <div className="mt-1 text-sm text-red-700">{error}</div>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => loadComparison(true)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Retry Analysis
                    </button>
                    <button
                      onClick={handleCrawlCompetitor}
                      className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Run Competitor Crawl
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading && !data && (
            <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-16 text-center shadow-sm">
              <Loader2 size={36} className="mx-auto animate-spin text-blue-600" />
              <h3 className="mt-4 text-base font-bold text-slate-900">
                Analyzing Competitor Signals...
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Synthesizing crawl pages, computing technical SEO gaps, and generating prioritized opportunities.
              </p>
            </div>
          )}

          {data && (
            <>
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                        Your Website
                      </span>
                      <span className="text-xs text-slate-400">
                        Crawled {formatDate(data.comparison.renkoo.crawlDate)}
                      </span>
                    </div>
                    <div className="mt-2 text-xl font-bold text-slate-900 truncate">
                      {data.comparison.renkoo.websiteName}
                    </div>
                    <a
                      href={data.comparison.renkoo.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition truncate max-w-sm"
                    >
                      <span className="truncate">{data.comparison.renkoo.websiteUrl}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </a>
                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <Layers size={14} className="text-slate-400" />
                      <span>{data.comparison.renkoo.pages} pages analyzed</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center border-y border-slate-100 py-4 lg:border-x lg:border-y-0 lg:px-8">
                    {statusInfo && (
                      <div
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusInfo.className}`}
                      >
                        <statusInfo.icon size={15} className={statusInfo.iconClass} />
                        <span>{statusInfo.label}</span>
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-6 text-center">
                      <div>
                        <div className="text-3xl font-black text-blue-600">
                          {data.summary.renkooWins}
                        </div>
                        <div className="text-[11px] font-medium text-slate-400">Wins</div>
                      </div>
                      <div className="text-sm font-bold text-slate-300">vs</div>
                      <div>
                        <div className="text-3xl font-black text-slate-700">
                          {data.summary.competitorWins}
                        </div>
                        <div className="text-[11px] font-medium text-slate-400">Deficits</div>
                      </div>
                    </div>

                    <div className="mt-2 text-[11px] text-slate-400">
                      {data.summary.equal} metrics tied
                    </div>
                  </div>

                  <div className="flex-1 lg:text-right">
                    <div className="flex items-center gap-2 lg:justify-end">
                      <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-purple-700">
                        Competitor
                      </span>
                      <span className="text-xs text-slate-400">
                        Crawled {formatDate(data.comparison.competitor.crawlDate)}
                      </span>
                    </div>
                    <div className="mt-2 text-xl font-bold text-slate-900 truncate">
                      {data.comparison.competitor.name}
                    </div>
                    <a
                      href={data.comparison.competitor.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex items-center gap-1 text-xs text-slate-500 hover:text-purple-600 transition truncate max-w-sm lg:ml-auto"
                    >
                      <span className="truncate">{data.comparison.competitor.domain || data.comparison.competitor.url}</span>
                      <ExternalLink size={12} className="shrink-0" />
                    </a>
                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600 lg:justify-end">
                      <Layers size={14} className="text-slate-400" />
                      <span>{data.comparison.competitor.pages} pages analyzed</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200">
                <nav className="-mb-px flex space-x-6">
                  <button
                    type="button"
                    onClick={() => setActiveTab('opportunities')}
                    className={`flex items-center gap-2 border-b-2 py-3.5 text-sm font-semibold transition ${
                      activeTab === 'opportunities'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    <Target size={16} />
                    <span>Strategic Opportunities</span>
                    <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      {data.opportunities.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('metrics')}
                    className={`flex items-center gap-2 border-b-2 py-3.5 text-sm font-semibold transition ${
                      activeTab === 'metrics'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    <BarChart3 size={16} />
                    <span>Technical & Content Metrics</span>
                    <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {data.metrics.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('pages')}
                    className={`flex items-center gap-2 border-b-2 py-3.5 text-sm font-semibold transition ${
                      activeTab === 'pages'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    <FileText size={16} />
                    <span>Page-Level Gaps</span>
                    <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {data.pageGaps.length}
                    </span>
                  </button>
                </nav>

                {activeTab === 'opportunities' && (
                  <div className="flex items-center gap-2 pb-2">
                    <Filter size={14} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500">Priority:</span>
                    {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as PriorityFilter[]).map(
                      (p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriorityFilter(p)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                            priorityFilter === p
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {p === 'ALL' ? 'All' : p}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>

              {activeTab === 'opportunities' && (
                <div className="mt-6 space-y-4">
                  {filteredOpportunities.length === 0 ? (
                    <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                      <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                      <h3 className="mt-3 text-base font-bold text-slate-900">
                        No gaps detected matching this priority
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Your website matches or exceeds this competitor in the selected criteria.
                      </p>
                    </div>
                  ) : (
                    filteredOpportunities.map((opp) => {
                      const isAdded = actionSuccessMap[opp.id];
                      const isAdding = actionLoadingMap[opp.id];

                      return (
                        <div
                          key={opp.id}
                          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300"
                        >
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-md border px-2.5 py-0.5 text-xs font-bold ${getPriorityBadgeClass(
                                    opp.priority,
                                  )}`}
                                >
                                  {opp.priority}
                                </span>

                                <span
                                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${getEffortBadgeClass(
                                    opp.effort,
                                  )}`}
                                >
                                  {opp.effort} Effort
                                </span>

                                <span className="text-xs font-medium text-slate-400">
                                  Impact Score: <b className="text-slate-800">{opp.impactScore}</b>/100
                                </span>

                                {opp.affectedPages > 0 && (
                                  <span className="text-xs text-slate-500">
                                    • {opp.affectedPages} page{opp.affectedPages === 1 ? '' : 's'} affected
                                  </span>
                                )}
                              </div>

                              <h3 className="mt-2 text-base font-bold text-slate-900">
                                {opp.title}
                              </h3>

                              <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                                {opp.description}
                              </p>

                              {opp.recommendation && (
                                <div className="mt-3 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-700 leading-relaxed border border-slate-100 flex items-start gap-2">
                                  <Zap size={14} className="shrink-0 text-blue-600 mt-0.5" />
                                  <div>
                                    <span className="font-bold text-slate-900">Recommendation: </span>
                                    {opp.recommendation}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="shrink-0 sm:self-center">
                              <button
                                type="button"
                                onClick={() => handleCreateAction(opp)}
                                disabled={isAdded || isAdding}
                                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                                  isAdded
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                                }`}
                              >
                                {isAdding ? (
                                  <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>Adding...</span>
                                  </>
                                ) : isAdded ? (
                                  <>
                                    <Check size={14} />
                                    <span>Added to Actions</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus size={14} />
                                    <span>Add to Action Plan</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {activeTab === 'metrics' && (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="py-3.5 pl-6 pr-4">SEO Signal / Metric</th>
                          <th className="px-4 py-3.5 text-right">
                            {data.comparison.renkoo.websiteName} (You)
                          </th>
                          <th className="px-4 py-3.5 text-right">
                            {data.comparison.competitor.name}
                          </th>
                          <th className="px-4 py-3.5 text-right">Performance Gap</th>
                          <th className="py-3.5 pl-4 pr-6 text-center">Winner</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {data.metrics.map((metric, idx) => {
                          const isRenkooWinner = metric.winner === 'RENKOO';
                          const isCompetitorWinner = metric.winner === 'COMPETITOR';

                          return (
                            <tr key={idx} className="hover:bg-slate-50/75 transition">
                              <td className="py-4 pl-6 pr-4 font-semibold text-slate-900">
                                {metric.metric}
                              </td>

                              <td className="px-4 py-4 text-right">
                                <span
                                  className={
                                    isRenkooWinner
                                      ? 'font-bold text-blue-600'
                                      : 'text-slate-600'
                                  }
                                >
                                  {formatPercent(metric.renkoo)}
                                </span>
                              </td>

                              <td className="px-4 py-4 text-right">
                                <span
                                  className={
                                    isCompetitorWinner
                                      ? 'font-bold text-purple-600'
                                      : 'text-slate-600'
                                  }
                                >
                                  {formatPercent(metric.competitor)}
                                </span>
                              </td>

                              <td className="px-4 py-4 text-right">
                                <span
                                  className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                                    isRenkooWinner
                                      ? 'text-emerald-600'
                                      : isCompetitorWinner
                                        ? 'text-red-600'
                                        : 'text-slate-500'
                                  }`}
                                >
                                  {metric.gap > 0 ? `+${metric.gap.toFixed(1)}%` : `${metric.gap.toFixed(1)}%`}
                                </span>
                              </td>

                              <td className="py-4 pl-4 pr-6 text-center">
                                {isRenkooWinner ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                                    <CheckCircle2 size={12} />
                                    <span>You</span>
                                  </span>
                                ) : isCompetitorWinner ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700">
                                    <span>Competitor</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                    <span>Tied</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'pages' && (
                <div className="mt-6 space-y-4">
                  {data.pageGaps.length === 0 ? (
                    <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                      <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                      <h3 className="mt-3 text-base font-bold text-slate-900">
                        No direct page-level deficits detected
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Every compared page has equivalent or superior technical and content coverage.
                      </p>
                    </div>
                  ) : (
                    data.pageGaps.map((page, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
                          <div className="min-w-0">
                            <span
                              className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${getPriorityBadgeClass(
                                page.priority,
                              )}`}
                            >
                              {page.priority} PRIORITY
                            </span>
                            <div className="mt-1 text-sm font-semibold text-slate-900 truncate">
                              {page.url}
                            </div>
                          </div>

                          <div className="text-xs text-slate-500">
                            {page.gaps.length} issue{page.gaps.length === 1 ? '' : 's'} identified
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {page.gaps.map((gapText, gIdx) => (
                            <span
                              key={gIdx}
                              className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 border border-amber-200/60"
                            >
                              {gapText}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-3">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                              Your Page
                            </div>
                            <div className="mt-1 text-xs text-slate-600 truncate">
                              {page.renkoo.title || 'No Title Tag'}
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                              <div>Word count: <b className="text-slate-800">{page.renkoo.wordCount}</b></div>
                              <div>Schema: <b className="text-slate-800">{page.renkoo.structuredDataCount}</b></div>
                              <div>Internal links: <b className="text-slate-800">{page.renkoo.internalLinks}</b></div>
                              <div>Images without alt: <b className="text-slate-800">{page.renkoo.imagesWithoutAlt}</b></div>
                            </div>
                          </div>

                          <div className="rounded-xl bg-purple-50/50 border border-purple-100 p-3">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                              Competitor Page
                            </div>
                            <div className="mt-1 text-xs text-slate-600 truncate">
                              {page.competitor.title || 'No Title Tag'}
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                              <div>Word count: <b className="text-slate-800">{page.competitor.wordCount}</b></div>
                              <div>Schema: <b className="text-slate-800">{page.competitor.structuredDataCount}</b></div>
                              <div>Internal links: <b className="text-slate-800">{page.competitor.internalLinks}</b></div>
                              <div>Images without alt: <b className="text-slate-800">{page.competitor.imagesWithoutAlt}</b></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
