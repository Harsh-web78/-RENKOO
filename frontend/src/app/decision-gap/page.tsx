'use client';

/*
 * RENKOO — Search & AI Decision Gap Intelligence 1.0 (Phase 38).
 * WHY ARE WE NOT WINNING THIS SEARCH / AI DECISION?
 * Observed gaps only: no scores, no invented authority,
 * no inferred recommendations. Unknowns stay unknown.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getDecisionGapTargets,
  getDecisionGapQuery,
  getDecisionGapAi,
  getWebsites,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import {
  PageHeader,
  Panel,
  DataTable,
  SecondaryButton,
  PrimaryButton,
  LoadingBlock,
  ErrorState,
  EmptyState,
  InsightBlock,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';

const STORAGE_KEY = 'renkoo_website_id';

type Mode = 'query' | 'ai';

function GapList({ gaps }: { gaps: any[] }) {
  if (gaps.length === 0) {
    return (
      <p className="text-sm text-rk-muted">
        No observed gaps with supporting evidence at this time.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {gaps.map((g: any) => (
        <li key={g.fingerprint} className="rounded-rk-md border border-rk-border p-3">
          <p className="text-sm font-semibold text-rk-ink">
            {String(g.kind).replace(/_/g, ' ')} — {String(g.title)}
          </p>
          <ul className="mt-1 space-y-1 text-sm text-rk-muted">
            {(g.evidence ?? []).map((e: string, i: number) => (
              <li key={i}>· {e}</li>
            ))}
          </ul>
          <p className="rk-metadata mt-1">
            Evidence: {String(g.evidenceState)} · Next: {String(g.nextDecision)}
          </p>
          {(g.unknown ?? []).length > 0 ? (
            <p className="rk-metadata mt-1">
              Unknown: {(g.unknown as string[]).join(' ')}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default function DecisionGapPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Array<{ id: string; name?: string; url?: string }>>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [mode, setMode] = useState<Mode>('query');
  const [targets, setTargets] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
          stored && list.some((s: any) => s.id === stored)
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

  const loadTargets = useCallback(async (siteId: string) => {
    if (!siteId) return;
    try {
      const t = await getDecisionGapTargets(siteId);
      setTargets(Array.isArray(t?.targets) ? t.targets : []);
    } catch {
      setTargets([]);
    }
  }, []);

  useEffect(() => {
    void loadTargets(websiteId);
  }, [websiteId, loadTargets]);

  async function analyze(target?: string) {
    const value = (target ?? input).trim();
    if (!websiteId || !value) return;
    setLoading(true);
    setError('');
    setAnalysis(null);
    try {
      if (mode === 'query') {
        setAnalysis(await getDecisionGapQuery(websiteId, value));
      } else {
        setAnalysis(await getDecisionGapAi(websiteId, value));
      }
    } catch (e: any) {
      setError(e?.message || 'Gap analysis failed to load.');
    } finally {
      setLoading(false);
    }
  }

  const targetColumns: DataTableColumn<any>[] = [
    {
      key: 'target',
      label: 'Target',
      priority: 'high',
      render: (r) => (
        <span className="font-semibold text-rk-ink">{String(r.target)}</span>
      ),
    },
    {
      key: 'position',
      label: 'Position',
      align: 'right',
      render: (r) => (r.position === null ? '—' : `#${r.position}`),
    },
    {
      key: 'page',
      label: 'Page',
      render: (r) =>
        r.page ? (
          <span className="block max-w-[220px] truncate" title={String(r.page)}>
            {String(r.page)}
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'country', label: 'Country' },
  ];

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Decision gaps"
        title="Why are we not winning?"
        description="Strongest observed reason, evidence, unknowns, existing work, safest next decision. Never a score."
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
            <Link href="/growth-plan">
              <PrimaryButton type="button">Growth plan</PrimaryButton>
            </Link>
          </div>
        }
      />

      <div className="mb-4 mt-6 flex gap-2">
        {(['query', 'ai'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`rk-focusable rounded-rk-md border border-rk-border px-3 py-1.5 text-sm font-semibold ${mode === m ? 'bg-rk-ink text-white' : ''}`}
            onClick={() => {
              setMode(m);
              setAnalysis(null);
              setInput('');
            }}
          >
            {m === 'query' ? 'Google query' : 'AI prompt'}
          </button>
        ))}
      </div>

      <Panel
        eyebrow="Target"
        title={mode === 'query' ? 'Analyze a query' : 'Analyze a prompt'}
        description={
          mode === 'query'
            ? 'Uses cached SERP snapshots, crawl data, and rank observations. No fresh provider calls.'
            : 'Uses observed AI checks. Recommendation stays unknown unless a source provides it.'
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label={mode === 'query' ? 'Query' : 'Prompt'}
            className="input min-w-0 flex-1"
            placeholder={mode === 'query' ? 'best CRM for agencies' : 'best CRM for a 20-person agency'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void analyze();
            }}
          />
          <SecondaryButton type="button" onClick={() => void analyze()}>
            Analyze why
          </SecondaryButton>
        </div>
      </Panel>

      {loading ? (
        <div className="mt-4">
          <LoadingBlock title="Composing gap evidence" />
        </div>
      ) : error ? (
        <div className="mt-4">
          <ErrorState title="Gap analysis failed" description={error} onRetry={() => void analyze()} />
        </div>
      ) : null}

      {analysis ? (
        <div className="mt-4 space-y-4">
          <Panel
            eyebrow={mode === 'query' ? 'Google target view' : 'AI target view'}
            title={String(analysis.target)}
            description={
              mode === 'query'
                ? `Position ${analysis.position ?? 'unknown'} (${analysis.positionSource}) · Intent ${analysis.intent} · Dominant SERP format ${analysis.dominantFormat}`
                : `AI state ${analysis.state} · Recommendation ${analysis.recommendation} · ${analysis.checksObserved} checks observed`
            }
          >
            <p className="text-sm font-medium">{String(analysis.summary?.primary ?? '')}</p>
            <ul className="mt-1 space-y-1 text-sm text-rk-muted">
              {(analysis.summary?.supporting ?? []).map((s: string, i: number) => (
                <li key={i}>· {s}</li>
              ))}
            </ul>
            {(analysis.summary?.unknown ?? []).length > 0 ? (
              <p className="rk-metadata mt-1">{(analysis.summary.unknown as string[]).join(' ')}</p>
            ) : null}
            <p className="mt-2 text-sm font-medium">
              Next investigation: {String(analysis.summary?.nextInvestigation ?? analysis.nextDecision)}
            </p>
          </Panel>

          <Panel
            eyebrow={analysis.gapCount > 5 ? `Top ${analysis.gaps?.length ?? 0} of ${analysis.gapCount} observed gaps` : 'Top observed gaps'}
            title="Why we are not winning"
            description="Ordered by evidence strength. Maximum 5 — never 17 reasons."
          >
            <GapList gaps={analysis.gaps ?? []} />
          </Panel>

          {mode === 'query' && (analysis.competitors ?? []).length > 0 ? (
            <Panel
              eyebrow="Competitor comparison"
              title="Observed SERP competitors"
              description="Our result vs observed competitor pages. Observed signals only."
            >
              <DataTable
                caption="Observed competitors"
                columns={[
                  { key: 'domain', label: 'Domain', priority: 'high' },
                  { key: 'position', label: 'Pos', align: 'right', render: (r: any) => (r.position === null ? '—' : `#${r.position}`) },
                  { key: 'title', label: 'Title', render: (r: any) => <span className="block max-w-[280px] truncate" title={String(r.title)}>{String(r.title)}</span> },
                  { key: 'resultType', label: 'Type', render: (r: any) => String(r.resultType ?? '—') },
                ]}
                rows={analysis.competitors}
                keyOf={(r: any, i: number) => `${r.domain}-${i}`}
                emptyTitle="No competitors observed"
                emptyDescription="No cached SERP snapshot."
                pageSize={10}
              />
            </Panel>
          ) : null}

          {mode === 'ai' ? (
            <Panel
              eyebrow="AI search"
              title="Mentions, citations, recommendation"
              description="Citation is never recommendation. Source counts observed only."
            >
              <p className="text-sm text-rk-muted">
                Cited pages: {(analysis.citedUrls ?? []).length} · Competitors observed:{' '}
                {(analysis.competitorNames ?? []).join(', ') || 'none recorded'} · Buyer criteria:{' '}
                {(analysis.buyerCriteria ?? []).join(', ') || 'none observed'}
              </p>
              {(analysis.citedUrls ?? []).length > 0 ? (
                <ul className="mt-1 space-y-1 text-sm">
                  {(analysis.citedUrls as string[]).map((u) => (
                    <li key={u} className="truncate" title={u}>{u}</li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          ) : null}

          {(analysis.unknowns ?? []).length > 0 ? (
            <Panel eyebrow="Unknown" title="What remains unknown" description="Valid outputs — never filled with assumptions.">
              <ul className="space-y-1 text-sm text-rk-muted">
                {(analysis.unknowns as string[]).map((u, i) => (
                  <li key={i}>· {u}</li>
                ))}
              </ul>
              {(analysis.conflicts ?? []).length > 0 ? (
                <div className="mt-2 space-y-1">
                  {(analysis.conflicts as string[]).map((c, i) => (
                    <InsightBlock key={i} eyebrow="Conflict" title="Conflicting evidence">
                      {c}
                    </InsightBlock>
                  ))}
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel
            eyebrow="Next step"
            title={`Next decision: ${analysis.nextDecision}`}
            description="Routes through the existing decision engine. Nothing auto-created."
          >
            {analysis.linked?.action ? (
              <div>
                <p className="text-sm">
                  Existing {String(analysis.linked.action.status)} action: {String(analysis.linked.action.title)}
                  {analysis.linked.work ? ` (${String((analysis.linked.work as any).section)})` : ''}
                  {analysis.linked.outcome ? ` — outcome ${String((analysis.linked.outcome as any).signal)}` : ''}
                </p>
                <div className="mt-2">
                  <NextAction
                    label="Continue the existing work through approval → execution → verification → measurement"
                    detail={String(analysis.linked.note)}
                    href="/growth-work"
                  />
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-rk-muted">{String(analysis.linked?.note ?? '')}</p>
                <div className="mt-2">
                  <NextAction
                    label="Investigate with existing diagnosis, then propose through the governed flow"
                    detail="No duplicate actions created."
                    href="/why-not-number-one"
                  />
                </div>
              </div>
            )}
            <p className="rk-metadata mt-2">{String(analysis.evidenceNote ?? '')}</p>
          </Panel>
        </div>
      ) : null}

      {!analysis && !loading ? (
        <div className="mt-4">
          <Panel
            eyebrow="Tracked targets"
            title={`Targets — ${targets.length}`}
            description="Important queries with positions. Open one to analyze why it is not winning."
          >
            {targets.length === 0 ? (
              <EmptyState
                title="No tracked targets"
                description="Track keywords first — gap analysis composes over tracked queries, cached SERPs, and crawl data."
              />
            ) : (
              <DataTable
                caption="Tracked gap targets"
                columns={targetColumns}
                rows={targets}
                keyOf={(r: any) => String(r.fingerprint)}
                onRowClick={(r) => {
                  setMode('query');
                  setInput(String((r as any).target));
                  void analyze(String((r as any).target));
                }}
                emptyTitle="No targets"
                emptyDescription="Track keywords to populate targets."
                pageSize={15}
              />
            )}
          </Panel>
        </div>
      ) : null}
    </AppShell>
  );
}
