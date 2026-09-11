'use client';

/*
 * RENKOO — Search-to-Revenue Attribution 2.0 (Phase 33).
 * Evidence-first outcome attribution:
 * SEARCH DEMAND → TRAFFIC → KEY EVENTS → LEADS →
 * QUALIFIED → REVENUE, with AI outcomes separate.
 *
 * Every edge: OBSERVED / ATTRIBUTED / INFERRED /
 * ESTIMATED / UNAVAILABLE. GSC query → revenue stays
 * CONTEXTUAL. Temporal association only — never
 * causal. No ROI score. Unavailable is never zero.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import AppShell from '@/components/AppShell';
import PageHeader from '@/components/ui/PageHeader';
import Panel from '@/components/ui/Panel';
import Metric from '@/components/ui/Metric';
import DataTable, {
  type DataTableColumn,
} from '@/components/ui/DataTable';
import {
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/buttons';
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
  InsightBlock,
} from '@/components/ui';
import {
  getAttributionOverview,
  getAttributionPages,
  getAttributionNeeds,
  getAttributionActions,
  getAttributionModel,
  getAttributionAi,
  getAttributionSignals,
  getAttributionClientReport,
  getWebsites,
  type AttributionOverview,
  type Website,
} from '@/lib/api';

const STORAGE_KEY = 'renkoo_website_id';

type Tab = 'overview' | 'pages' | 'needs' | 'actions' | 'attribution';

const WINDOWS = [
  { value: 7, label: '7d' },
  { value: 28, label: '28d' },
  { value: 90, label: '90d' },
];

const HERO_LABELS: Record<string, string> = {
  organicSessions: 'Organic attributed traffic',
  organicKeyEvents: 'Organic key events',
  leads: 'Organic leads',
  qualified: 'Qualified leads',
  revenue: 'Attributed revenue',
};

const AI_LABELS: Record<string, string> = {
  aiSessions: 'AI Assistant traffic',
  aiKeyEvents: 'AI key events',
  aiRevenue: 'AI revenue',
};

export default function SearchRevenuePage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [days, setDays] = useState(28);
  const [tab, setTab] = useState<Tab>('overview');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [overview, setOverview] = useState<AttributionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pages, setPages] = useState<any>(null);
  const [needs, setNeeds] = useState<any>(null);
  const [actions, setActions] = useState<any>(null);
  const [model, setModel] = useState<any>(null);
  const [ai, setAi] = useState<any>(null);
  const [signals, setSignals] = useState<any[]>([]);
  const [report, setReport] = useState<any>(null);
  const [tabLoading, setTabLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWebsites()
      .then((sites) => {
        if (cancelled) return;
        const list = Array.isArray(sites) ? sites : [];
        setWebsites(list);
        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem(STORAGE_KEY)
            : null;
        const valid =
          stored && list.some((s) => s.id === stored)
            ? stored
            : list[0]?.id || '';
        setWebsiteId(valid);
      })
      .catch(() => {
        if (!cancelled) setWebsites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!websiteId) return;
    setLoading(true);
    setError('');
    try {
      const [ov, sig, rep] = await Promise.all([
        getAttributionOverview(websiteId, days),
        getAttributionSignals(websiteId).catch(() => ({ signals: [] })),
        getAttributionClientReport(websiteId).catch(() => null),
      ]);
      setOverview(ov);
      setSignals(sig.signals ?? []);
      setReport(rep);
    } catch (e: any) {
      setError(e?.message || 'Attribution failed to load.');
    } finally {
      setLoading(false);
    }
  }, [websiteId, days]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!websiteId) return;
    setTabLoading(true);
    const done = () => setTabLoading(false);
    if (tab === 'pages') {
      getAttributionPages(websiteId, days)
        .then(setPages)
        .catch(() => setPages(null))
        .finally(done);
    } else if (tab === 'needs') {
      getAttributionNeeds(websiteId, days)
        .then(setNeeds)
        .catch(() => setNeeds(null))
        .finally(done);
    } else if (tab === 'actions') {
      getAttributionActions(websiteId, days)
        .then(setActions)
        .catch(() => setActions(null))
        .finally(done);
    } else if (tab === 'attribution') {
      Promise.all([
        getAttributionModel(websiteId, days).catch(() => null),
        getAttributionAi(websiteId, days).catch(() => null),
      ])
        .then(([m, a]) => {
          setModel(m);
          setAi(a);
        })
        .finally(done);
    } else {
      done();
    }
  }, [tab, websiteId, days]);

  const pageColumns: DataTableColumn<any>[] = [
    { key: 'page', label: 'Page', priority: 'high' },
    { key: 'organicSessions', label: 'Organic sessions', align: 'right', sortable: true, sortValue: (r) => Number(r.organicSessions ?? 0) },
    { key: 'keyEvents', label: 'Key events', align: 'right', sortable: true, sortValue: (r) => Number(r.keyEvents ?? 0) },
    { key: 'leads', label: 'Leads', align: 'right' },
    {
      key: 'revenue',
      label: 'Revenue',
      align: 'right',
      render: (r) => (r.revenue === null ? '—' : String(r.revenue)),
    },
    { key: 'revenueState', label: 'Revenue state' },
  ];

  return (
    <AppShell mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} onMenu={() => setMobileOpen(true)}>
      <PageHeader
        tourAnchor="discover-revenue"
        eyebrow="Business outcomes"
        title="Search-to-Revenue"
        description="What search actually did for the business — observed, attributed, or unavailable. Never causal, never zero-filled."
        actions={
          <div className="flex gap-2">
            <select
              aria-label="Website"
              className="rk-focusable min-w-0 rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-sm"
              value={websiteId}
              onChange={(e) => {
                setWebsiteId(e.target.value);
                if (typeof window !== 'undefined' && e.target.value) {
                  localStorage.setItem(STORAGE_KEY, e.target.value);
                }
              }}
            >
              <option value="">Select website</option>
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || w.url || w.id}
                </option>
              ))}
            </select>
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                type="button"
                className={`rk-focusable rounded-rk-md border border-rk-border px-2 py-1 text-xs ${days === w.value ? 'bg-rk-ink text-white' : ''}`}
                onClick={() => setDays(w.value)}
              >
                {w.label}
              </button>
            ))}
            <Link href="/roi">
              <SecondaryButton type="button">ROI detail</SecondaryButton>
            </Link>
          </div>
        }
      />

      {signals.length > 0 ? (
        <section aria-label="Outcome signals" className="mt-4 grid gap-3 md:grid-cols-3">
          {signals.map((s, i) => (
            <InsightBlock key={i} eyebrow="Signal" title={String(s.what)}>
              <p className="rk-metadata">Source: {String(s.source)} · Window: {String(s.window)} · {String(s.attribution)}</p>
              <p className="mt-1 text-sm font-medium">Next: {String(s.next)}</p>
            </InsightBlock>
          ))}
        </section>
      ) : null}

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading attribution" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState title="Attribution failed to load" description={error} onRetry={() => void refresh()} />
        </div>
      ) : overview ? (
        <>
          <p className="rk-metadata mt-4">{overview.hierarchy}</p>
          <section aria-label="Outcome hero" className="mt-2">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {overview.hero.map((h) => (
                <Metric
                  key={h.key}
                  label={HERO_LABELS[h.key] ?? h.key}
                  value={String(h.value ?? '—')}
                  detail={String(h.evidence)}
                />
              ))}
            </div>
            {overview.hero.length === 0 ? (
              <EmptyState
                title="No outcome evidence yet"
                description="Connect GA4 and record leads to populate this hierarchy. Unavailable stays unavailable."
              />
            ) : null}
          </section>

          <section aria-label="AI outcomes" className="mt-4">
            <Panel
              eyebrow="AI outcomes — separate"
              title="AI Assistant & visibility"
              description={overview.aiNote}
            >
              {overview.aiHero.length === 0 ? (
                <p className="text-sm text-rk-muted">AI revenue attribution unavailable.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {overview.aiHero.map((h) => (
                    <Metric
                      key={h.key}
                      label={AI_LABELS[h.key] ?? h.key}
                      value={String(h.value ?? '—')}
                      detail={String(h.evidence)}
                    />
                  ))}
                </div>
              )}
            </Panel>
          </section>

          {overview.prompts.length > 0 ? (
            <div className="mt-4">
              <InsightBlock eyebrow="Connections" title="Unlock more of the chain">
                <ul className="mt-1 space-y-1 text-sm">
                  {overview.prompts.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </InsightBlock>
            </div>
          ) : null}

          <div className="mb-4 mt-6 flex gap-2 border-b border-rk-border">
            {(['overview', 'pages', 'needs', 'actions', 'attribution'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`rk-focusable px-3 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-rk-ink text-rk-ink' : 'text-rk-muted'}`}
                onClick={() => setTab(t)}
              >
                {t === 'overview' ? 'Chain & ROI' : t === 'pages' ? 'Page economics' : t === 'needs' ? 'Need economics' : t === 'actions' ? 'Action economics' : 'Model & AI'}
              </button>
            ))}
          </div>

          {tabLoading ? (
            <LoadingBlock title="Loading section" />
          ) : null}

          {tab === 'overview' && !tabLoading ? (
            <>
              <Panel
                eyebrow="Revenue"
                title="Attributed revenue & ROI"
                description={overview.revenue.currencyNote}
              >
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric label="Recognized revenue rows" value={String(overview.revenue.recognized)} detail="Recorded source" />
                  <Metric
                    label="Amount"
                    value={overview.revenue.amount === null ? 'Unavailable' : String(overview.revenue.amount)}
                    detail={overview.revenue.currencies.join(', ') || 'No currency'}
                  />
                  <Metric label="Spend" value={overview.roi.spend === null ? 'Unavailable' : String(overview.roi.spend)} detail={overview.roi.spendNote} />
                  <Metric
                    label="ROI"
                    value={overview.roi.roi === null ? 'Unavailable' : `${(overview.roi.roi * 100).toFixed(1)}%`}
                    detail={overview.roi.label}
                  />
                </div>
                {overview.revenue.explanation ? (
                  <p className="rk-metadata mt-2">
                    {overview.revenue.explanation.where} · Model {overview.revenue.explanation.attribution} · Channel {overview.revenue.explanation.channel} · Window {overview.revenue.explanation.window} · {overview.revenue.explanation.status}
                  </p>
                ) : null}
                <p className="rk-metadata mt-1">Gap: {overview.gap} — {overview.gapNote}</p>
                <p className="rk-metadata mt-1">{overview.freshness}</p>
                <p className="mt-2 text-sm">{overview.causality}</p>
              </Panel>

              <div className="mt-4">
                <Panel eyebrow="Client summary" title="What to tell the business" description={report?.attribution ?? 'Plain language, no jargon.'}>
                  <ul className="space-y-1 text-sm">
                    {(report?.lines ?? []).map((line: string, i: number) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </>
          ) : null}

          {tab === 'pages' && pages && !tabLoading ? (
            <Panel
              eyebrow="Page economics"
              title="Top pages by organic outcomes"
              description={pages.note}
            >
              {!pages.channelAvailable ? (
                <p className="mb-2 text-sm text-rk-muted">GA4 channel data unavailable — recorded lead/revenue linkage only.</p>
              ) : null}
              <DataTable
                caption="Pages by organic outcomes"
                columns={pageColumns}
                rows={pages.pages ?? []}
                keyOf={(r: any, i: number) => `${r.page}-${i}`}
                emptyTitle="No page outcomes"
                emptyDescription="Pages appear once GA4 or recorded leads provide evidence."
                pageSize={15}
              />
            </Panel>
          ) : null}

          {tab === 'needs' && needs && !tabLoading ? (
            <Panel
              eyebrow="Need economics"
              title="Customer needs → demand"
              description={needs.association}
            >
              {!needs.gscAvailable ? (
                <EmptyState title="No demand evidence" description="Connect Search Console for query demand." />
              ) : (
                <ul className="space-y-2">
                  {(needs.needs ?? []).map((n: any, i: number) => (
                    <li key={i} className="rounded-rk-md border border-rk-border p-3">
                      <p className="text-sm font-semibold">{String(n.query)}</p>
                      <p className="rk-metadata">
                        GSC POSITION {n.gscPosition ?? '—'} · {n.gscClicks ?? '—'} clicks · {n.gscImpressions ?? '—'} impressions · {String(n.quality)}
                      </p>
                      <p className="mt-1 text-sm">{String(n.relation?.statement ?? '')}</p>
                      {n.leadHint ? <p className="mt-1 text-sm text-rk-muted">{String(n.leadHint)}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'actions' && actions && !tabLoading ? (
            <Panel
              eyebrow="Action economics"
              title="Verified actions → observed outcomes"
              description={actions.sequence}
            >
              {(actions.actions ?? []).length === 0 ? (
                <EmptyState title="No measured actions" description="Execute and verify actions to build before/after evidence." />
              ) : (
                <ul className="space-y-2">
                  {(actions.actions ?? []).map((a: any) => (
                    <li key={a.id} className="rounded-rk-md border border-rk-border p-3">
                      <p className="text-sm font-semibold">{String(a.title)}</p>
                      <p className="rk-metadata">
                        {String(a.status ?? 'recorded')} · Keyword {String(a.keyword ?? '—')} · Leads {a.leadsBefore} → {a.leadsAfter}
                      </p>
                      <p className="mt-1 text-sm">{String(a.statement)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {tab === 'attribution' && !tabLoading ? (
            <>
              <Panel
                eyebrow="Attribution model"
                title={`How credit is assigned — ${model?.model ?? 'UNKNOWN'}`}
                description={model?.modelNote ?? ''}
              >
                <DataTable
                  caption="Channel attribution"
                  columns={[
                    { key: 'channel', label: 'Channel', priority: 'high' },
                    { key: 'sessions', label: 'Sessions', align: 'right' },
                    { key: 'conversions', label: 'Key events', align: 'right' },
                    { key: 'revenue', label: 'Revenue', align: 'right' },
                    { key: 'quality', label: 'Quality' },
                  ]}
                  rows={model?.channels ?? []}
                  keyOf={(r: any) => String(r.channel)}
                  emptyTitle="No channel rows"
                  emptyDescription="Connect GA4 for channel attribution."
                  pageSize={15}
                />
                <p className="rk-metadata mt-2">{model?.unattributedNote}</p>
                <p className="rk-metadata mt-1">Credit example: {model?.creditExample}</p>
                <p className="rk-metadata mt-1">{model?.lookback} · Modeled: {model?.modeled}</p>
                <p className="rk-metadata mt-1">{model?.freshness}</p>
              </Panel>
              <div className="mt-4">
                <Panel
                  eyebrow="AI attribution"
                  title="AI Assistant → key events → revenue"
                  description={ai?.visibility?.note ?? ''}
                >
                  <p className="text-sm">{ai?.statement}</p>
                  <p className="rk-metadata mt-1">
                    Granularity: {ai?.granularity} · Citations {ai?.visibility?.citations ?? '—'} · Mentions {ai?.visibility?.mentions ?? '—'}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {(ai?.bySource ?? []).map((s: any) => (
                      <li key={s.source} className="flex justify-between gap-2">
                        <span>{String(s.source)}</span>
                        <span className="rk-number">{s.sessions} sessions · {s.conversions} events · {s.revenue} revenue</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </AppShell>
  );
}
