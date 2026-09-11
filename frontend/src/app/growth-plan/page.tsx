'use client';

/*
 * RENKOO — Unified Growth Plan 1.0 (Phase 34).
 * WHAT SHOULD I DO FIRST? Composed from existing
 * evidence only: no scores, no new engines, no
 * auto-execution. NOW (3) → NEXT (≤10) → WAIT →
 * BLOCKED → COMPLETED/LEARNING.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getGrowthPlan,
  getGrowthDecision,
  refreshGrowthPlan,
  getGoalRoadmap,
  getGoalProgress,
  getGrowthExecutive,
  getWebsites,
  type GrowthDecision,
  type GrowthPlan,
  type GoalRoadmap,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import {
  PageHeader,
  Panel,
  DataTable,
  Drawer,
  DrawerSection,
  DrawerMeta,
  PrimaryButton,
  SecondaryButton,
  LoadingBlock,
  ErrorState,
  EmptyState,
  InsightBlock,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';

const STORAGE_KEY = 'renkoo_website_id';

function TypeChip({ value }: { value: string }) {
  return (
    <span className="rk-focusable inline-block rounded-rk-md border border-rk-border px-2 py-0.5 text-xs font-bold text-rk-ink">
      {value}
    </span>
  );
}

function EvidenceLine({ decision }: { decision: GrowthDecision }) {
  return (
    <p className="rk-metadata">
      {decision.primaryEvidence} · Evidence: {decision.evidenceState}
      {decision.existingActionId
        ? ` · Action ${decision.existingActionId.slice(0, 8)}… (${decision.existingActionStatus ?? 'linked'})`
        : ' · No existing action'}
    </p>
  );
}

export default function GrowthPlanPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Array<{ id: string; name?: string; url?: string }>>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState('');
  const [detail, setDetail] = useState<(GrowthDecision & { reuse?: string; clientWording?: string }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /* Phase 35 — goal-aligned roadmap, progress, executive. */
  const [roadmap, setRoadmap] = useState<GoalRoadmap | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [executive, setExecutive] = useState<any>(null);

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

  const load = useCallback(async (siteId: string) => {
    if (!siteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setPlan(await getGrowthPlan(siteId));
    } catch (e: any) {
      setError(e?.message || 'Growth plan failed to load.');
    } finally {
      setLoading(false);
    }
    /* Phase 35 composition — best-effort, never blocks
     * the Phase 34 plan when unavailable. */
    try {
      const [rm, pr, ex] = await Promise.all([
        getGoalRoadmap(siteId).catch(() => null),
        getGoalProgress(siteId).catch(() => null),
        getGrowthExecutive(siteId).catch(() => null),
      ]);
      setRoadmap(rm);
      setProgress(pr);
      setExecutive(ex);
    } catch {
      /* roadmap panels show empty states honestly */
    }
  }, []);

  useEffect(() => {
    void load(websiteId);
  }, [websiteId, load]);

  /* Phase 41 — deep links preserve context:
   * ?fingerprint= opens the decision drawer once the
   * website resolves. Read from window (no Suspense
   * boundary needed); the param is dropped so reloads
   * never replay it. */
  useEffect(() => {
    if (!websiteId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const fingerprint = params.get('fingerprint');
    if (!fingerprint) return;
    params.delete('fingerprint');
    const clean =
      `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState(null, '', clean);
    void openDetail(fingerprint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteId]);

  async function handleRefresh() {
    if (!websiteId || refreshing) return;
    setRefreshing(true);
    setRefreshNote('');
    try {
      const r = await refreshGrowthPlan(websiteId);
      setRefreshNote(
        `${r.decisions} decisions recomputed in the open evidence set. ${r.note}`,
      );
      void load(websiteId);
    } catch (e: any) {
      setRefreshNote(e?.message || 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function openDetail(fingerprint: string) {
    if (!websiteId) return;
    setDetailLoading(true);
    try {
      setDetail(await getGrowthDecision(websiteId, fingerprint));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const nextColumns: DataTableColumn<any>[] = [
    {
      key: 'title',
      label: 'Decision',
      priority: 'high',
      render: (r) => (
        <span>
          <TypeChip value={String(r.decisionType)} />{' '}
          <span className="font-semibold text-rk-ink">{String(r.title)}</span>
        </span>
      ),
    },
    { key: 'priorityBand', label: 'Band' },
    {
      key: 'status',
      label: 'Status',
      render: (r) => String(r.status).replace(/_/g, ' '),
    },
    {
      key: 'nextAction',
      label: 'Next step',
      render: (r) => (
        <span className="block max-w-[320px] truncate" title={String(r.nextAction)}>
          {String(r.nextAction)}
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
        eyebrow="Growth plan"
        title="What should I do first?"
        description="Three next decisions from everything RENKOO already knows — ordered by evidence, never scored."
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
            <SecondaryButton type="button" onClick={() => void handleRefresh()}>
              {refreshing ? 'Recomputing…' : 'Recompute'}
            </SecondaryButton>
            <Link href="/command-center">
              <PrimaryButton type="button">Command Center</PrimaryButton>
            </Link>
          </div>
        }
      />

      {refreshNote ? (
        <div className="mt-4">
          <InsightBlock eyebrow="Refresh" title="Plan recomputed">
            {refreshNote}
          </InsightBlock>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Composing growth plan" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Growth plan failed to load"
            description={error}
            onRetry={() => void load(websiteId)}
          />
        </div>
      ) : plan ? (
        <>
          {plan.material ? (
            <div className="mt-6">
              <EmptyState
                title="No material decision right now"
                description={`${plan.material.unavailableReason} No recommendations manufactured.`}
              />
            </div>
          ) : null}

          <section aria-label="Business goal" className="mt-6">
            <Panel
              eyebrow="Business goal"
              title={roadmap?.goal?.goalLabel ?? 'What are we trying to improve?'}
              description={
                roadmap?.goal
                  ? `${roadmap.goal.goalSource} · ${roadmap.goal.status === 'TARGET_UNSET' ? 'TARGET NOT SET' : roadmap.goal.status} · ${roadmap.goal.targetNote}`
                  : 'Goal evidence loading — directional content below still applies.'
              }
            >
              {roadmap?.conflicts && roadmap.conflicts.length > 0 ? (
                <div className="space-y-2">
                  {roadmap.conflicts.map((c, i) => (
                    <InsightBlock key={i} eyebrow="Goal conflict" title={c.tradeoff}>
                      Goals: {c.goals.join(' vs ')} · Evidence: {c.evidence}{' '}
                      {c.safeChoice ? `Safe choice: ${c.safeChoice}` : 'Unresolved — no forced fit.'}
                    </InsightBlock>
                  ))}
                </div>
              ) : null}
              {executive ? (
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <div>
                    <p className="rk-metadata">CURRENT STATE</p>
                    <p className="text-sm">{executive.currentState}</p>
                  </div>
                  <div>
                    <p className="rk-metadata">NEXT 3 PRIORITIES</p>
                    <ul className="space-y-1 text-sm">
                      {executive.nextThree.map((n: string, i: number) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="rk-metadata">BLOCKED / MEASURING</p>
                    <ul className="space-y-1 text-sm">
                      {executive.blocked.map((b: string, i: number) => (
                        <li key={`b${i}`}>Blocked: {b}</li>
                      ))}
                      {executive.measuring.map((m: string, i: number) => (
                        <li key={`m${i}`}>Measuring: {m}</li>
                      ))}
                      {executive.blocked.length === 0 && executive.measuring.length === 0 ? (
                        <li>Nothing blocked; nothing in measurement.</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
              ) : null}
            </Panel>
          </section>

          {roadmap?.websiteFound === false ? (
            <div className="mt-4">
              <EmptyState
                title="Roadmap unavailable"
                description="Website not found for this organization."
              />
            </div>
          ) : null}

          {roadmap && roadmap.websiteFound !== false ? (
            <section aria-label="30 60 90 roadmap" className="mt-4 space-y-4">
              {(
                [
                  ['days30', '30 days', 'Foundation + highest-value actions'],
                  ['days60', '60 days', 'Follow-on opportunities and dependent work'],
                  ['days90', '90 days', 'Longer-term bets + measurement and learning'],
                ] as const
              ).map(([key, title, desc]) => {
                const items = (roadmap as any)[key] ?? [];
                if (items.length === 0) return null;
                return (
                  <Panel key={key} eyebrow="Horizon" title={`${title} — ${items.length}`} description={desc}>
                    <ul className="space-y-2">
                      {items.map((it: any) => (
                        <li key={it.id} className="rounded-rk-md border border-rk-border p-3">
                          <p className="text-sm">
                            <TypeChip value={it.decision.decisionType} />{' '}
                            <button
                              type="button"
                              className="rk-focusable font-semibold text-rk-ink underline underline-offset-2"
                              onClick={() => void openDetail(it.decision.fingerprint)}
                            >
                              {it.decision.title}
                            </button>{' '}
                            <span className="rk-metadata">[{it.workClass} · {it.state}]</span>
                          </p>
                          <p className="rk-metadata mt-1">{it.goalExplanation}</p>
                          <p className="mt-1 text-sm text-rk-muted">{it.whyNow}</p>
                          {it.dependencyNotes.length > 0 ? (
                            <p className="rk-metadata mt-1">{it.dependencyNotes.join(' ')}</p>
                          ) : null}
                          <p className="rk-metadata mt-1">
                            Verify: {it.verification ?? '—'} · Measure: {it.measurement.baseline ?? it.measurement.status} ({it.measurement.window})
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                );
              })}
              {(roadmap.later ?? []).length > 0 || (roadmap.wait ?? []).length > 0 || (roadmap.blocked ?? []).length > 0 ? (
                <Panel
                  eyebrow="Deferred"
                  title={`Later (${roadmap.later.length}) · Wait (${roadmap.wait.length}) · Blocked (${roadmap.blocked.length})`}
                  description="Valid work intentionally placed outside 90 days, with reasons. No duplicates across sections."
                >
                  <p className="rk-metadata">{roadmap.dependencyHealth.note}</p>
                  <p className="rk-metadata mt-1">{roadmap.stability.note}</p>
                </Panel>
              ) : null}
              {progress ? (
                <Panel
                  eyebrow="Measurement loop"
                  title={`Progress: ${progress.progress}`}
                  description={progress.progressNote ?? progress.note ?? ''}
                >
                  <p className="rk-metadata">
                    Replan: {progress.replan?.note ?? '—'} · Resources: {progress.resources ?? '—'}
                  </p>
                  {progress.horizons ? (
                    <p className="rk-metadata mt-1">
                      NOW {progress.horizons.now} · 30d {progress.horizons.days30} · 60d{' '}
                      {progress.horizons.days60} · 90d {progress.horizons.days90} · Later{' '}
                      {progress.horizons.later} · Wait {progress.horizons.wait} · Blocked{' '}
                      {progress.horizons.blocked}
                    </p>
                  ) : null}
                </Panel>
              ) : null}
            </section>
          ) : null}

          <section aria-label="Do now" className="mt-6">
            <div className="grid gap-3 lg:grid-cols-3">
              {(plan.now ?? []).map((d) => (
                <Panel
                  key={d.fingerprint}
                  eyebrow={`NOW · ${d.decisionType}`}
                  title={d.title}
                  description={d.summary}
                >
                  <p className="text-sm text-rk-muted">{d.whyFirst}</p>
                  <div className="mt-2">
                    <EvidenceLine decision={d} />
                  </div>
                  {d.page || d.keyword ? (
                    <p className="rk-metadata mt-1">
                      {[d.page, d.keyword].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm font-medium">{d.nextAction}</p>
                  {/* Phase 41 — plan routes through the
                   * work queue (approval/blocker/verify
                   * gates). Execution stays secondary. */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <SecondaryButton type="button" onClick={() => void openDetail(d.fingerprint)}>
                      View evidence
                    </SecondaryButton>
                    <Link
                      href={
                        d.existingActionId
                          ? `/growth-work?actionId=${encodeURIComponent(d.existingActionId)}`
                          : '/growth-work'
                      }
                    >
                      <PrimaryButton type="button">
                        Open in work queue
                      </PrimaryButton>
                    </Link>
                    {d.existingActionId ? (
                      <Link href="/execution">
                        <SecondaryButton type="button">Open action</SecondaryButton>
                      </Link>
                    ) : (
                      <Link href="/roadmap">
                        <SecondaryButton type="button">Open roadmap</SecondaryButton>
                      </Link>
                    )}
                  </div>
                </Panel>
              ))}
            </div>
            {(plan.now ?? []).length === 0 && !plan.material ? (
              <EmptyState
                title="Nothing due now"
                description="No unblocked material decision. See NEXT, WAIT and BLOCKED below."
              />
            ) : null}
          </section>

          {(plan.next ?? []).length > 0 ? (
            <div className="mt-4">
              <Panel
                eyebrow="Up next"
                title={`Next — ${plan.next.length} ordered decisions`}
                description="Deterministic evidence ordering. No score anywhere."
              >
                <DataTable
                  caption="Next growth decisions"
                  columns={nextColumns}
                  rows={plan.next}
                  keyOf={(r: any) => String(r.fingerprint)}
                  onRowClick={(r) => void openDetail(String((r as any).fingerprint))}
                  emptyTitle="Nothing next"
                  emptyDescription="No further ordered decisions."
                  pageSize={10}
                />
              </Panel>
            </div>
          ) : null}

          {(plan.wait ?? []).length > 0 ? (
            <div className="mt-4">
              <Panel
                eyebrow="Waiting"
                title={`Wait — ${plan.wait.length} deferred`}
                description="Valid opportunities intentionally deferred, with reasons."
              >
                <ul className="space-y-2">
                  {plan.wait.map((d) => (
                    <li key={d.fingerprint} className="rounded-rk-md border border-rk-border p-3">
                      <p className="text-sm">
                        <TypeChip value={d.decisionType} />{' '}
                        <button
                          type="button"
                          className="rk-focusable font-semibold text-rk-ink underline underline-offset-2"
                          onClick={() => void openDetail(d.fingerprint)}
                        >
                          {d.title}
                        </button>
                      </p>
                      <p className="rk-metadata mt-1">{d.summary}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}

          {(plan.blocked ?? []).length > 0 ? (
            <div className="mt-4">
              <Panel
                eyebrow="Blocked"
                title={`Blocked — ${plan.blocked.length} waiting on evidence`}
                description="Missing connection, data, or verification dependency. Nothing fabricated to fill the gap."
              >
                <ul className="space-y-2">
                  {plan.blocked.map((d) => (
                    <li key={d.fingerprint} className="rounded-rk-md border border-rk-border p-3">
                      <p className="text-sm">
                        <TypeChip value={d.decisionType} />{' '}
                        <button
                          type="button"
                          className="rk-focusable font-semibold text-rk-ink underline underline-offset-2"
                          onClick={() => void openDetail(d.fingerprint)}
                        >
                          {d.title}
                        </button>
                      </p>
                      <p className="mt-1 text-sm text-rk-muted">{d.blockedReason}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}

          {(plan.completed ?? []).length > 0 ? (
            <div className="mt-4">
              <Panel
                eyebrow="Learning"
                title={`Completed — ${plan.completed.length} with verification status`}
                description="Finished work and what it taught us."
              >
                <ul className="space-y-2">
                  {plan.completed.map((c) => (
                    <li key={c.actionId} className="rounded-rk-md border border-rk-border p-3">
                      <p className="text-sm font-semibold">{c.title}</p>
                      <p className="rk-metadata mt-1">
                        Verification {c.verificationState} · Measurement {c.measurementState}
                      </p>
                      <p className="mt-1 text-sm text-rk-muted">{c.learning}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}
        </>
      ) : null}

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        eyebrow="Why this decision"
        title={String(detail?.title ?? 'Decision evidence')}
        description="Primary reason, supporting evidence, unknowns, and the next step."
      >
        {detailLoading && !detail ? (
          <LoadingBlock title="Loading decision" />
        ) : detail ? (
          <>
            <p className="text-sm text-rk-muted">{detail.whyFirst}</p>
            <div className="mt-2">
              <DrawerMeta
                items={[
                  { label: 'Type', value: detail.decisionType },
                  { label: 'Band', value: detail.priorityBand },
                  { label: 'Status', value: String(detail.status).replace(/_/g, ' ') },
                  { label: 'Customer need', value: detail.customerNeed ?? 'Not established' },
                  { label: 'Keyword', value: detail.keyword ?? '—' },
                  { label: 'Page', value: detail.page ?? '—' },
                  { label: 'Evidence', value: detail.evidenceState },
                  { label: 'Recommendation', value: detail.existingRecommendationId ?? 'None' },
                  { label: 'Action', value: detail.existingActionId ?? 'None' },
                  { label: 'Action reuse', value: detail.actionReuse },
                  { label: 'Verification', value: detail.verificationState ?? '—' },
                  { label: 'Measurement', value: detail.measurementState ?? '—' },
                ]}
              />
            </div>
            <DrawerSection title="Primary reason">
              <p className="text-sm">{detail.primaryEvidence}</p>
              {detail.supportingEvidence.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-rk-muted">
                  {detail.supportingEvidence.map((e, i) => (
                    <li key={i}>· {e}</li>
                  ))}
                </ul>
              ) : null}
            </DrawerSection>
            {detail.conflict ? (
              <DrawerSection title="Signal conflict">
                <InsightBlock eyebrow="Conflict" title={detail.conflict.what}>
                  Known: {detail.conflict.known} Unknown: {detail.conflict.unknown} Safe
                  next step: {detail.conflict.safeNextStep}
                </InsightBlock>
              </DrawerSection>
            ) : null}
            <DrawerSection title="Decision trace">
              <ol className="space-y-1 text-sm text-rk-muted">
                {detail.trace.map((t, i) => (
                  <li key={i}>
                    {i + 1}. {t}
                  </li>
                ))}
              </ol>
              {detail.blockedReason ? (
                <p className="mt-2 text-sm text-rk-muted">{detail.blockedReason}</p>
              ) : null}
              {detail.unavailableReason ? (
                <p className="mt-1 text-sm text-rk-muted">{detail.unavailableReason}</p>
              ) : null}
            </DrawerSection>
            <DrawerSection title="Next step">
              <div className="mt-1">
                {/* Phase 41 — the queue owns approval /
                 * blockers / verify; execution is reached
                 * through it, never around it. */}
                <NextAction
                  label={detail.nextAction}
                  detail={detail.reuse ?? 'Existing work reused where it exists.'}
                  href={
                    detail.existingActionId
                      ? `/growth-work?actionId=${encodeURIComponent(detail.existingActionId)}`
                      : '/growth-work'
                  }
                />
              </div>
              <div className="mt-2">
                <Link
                  href={detail.existingActionId ? '/execution' : '/roadmap'}
                >
                  <span className="text-xs font-semibold text-rk-secondary underline underline-offset-2">
                    {detail.existingActionId
                      ? 'Open execution detail'
                      : 'Open roadmap detail'}
                  </span>
                </Link>
              </div>
              {detail.clientWording ? (
                <p className="mt-2 text-sm text-rk-muted">{detail.clientWording}</p>
              ) : null}
            </DrawerSection>
          </>
        ) : null}
      </Drawer>
    </AppShell>
  );
}
