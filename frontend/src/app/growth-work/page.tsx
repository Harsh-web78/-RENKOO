'use client';

/*
 * RENKOO — Governed Growth Work Queue 1.0 (Phase 36).
 * WHAT WORK SHOULD THE TEAM PICK UP NOW? Operational
 * composition over existing actions: TODAY / READY /
 * APPROVAL / IN PROGRESS / BLOCKED / VERIFY / MEASURE /
 * COMPLETED. Planning is not execution — nothing here
 * auto-executes, auto-publishes, or invents owners.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getGrowthQueue,
  getGrowthWorkItem,
  refreshGrowthQueue,
  getRecentOutcomes,
  getPendingOutcomes,
  getActionOutcome,
  getWebsites,
  type GrowthQueue,
  type GrowthWorkItem,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import {
  PageHeader,
  Panel,
  Drawer,
  DrawerSection,
  DrawerMeta,
  SecondaryButton,
  PrimaryButton,
  LoadingBlock,
  ErrorState,
  EmptyState,
  InsightBlock,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';
import DataTable from '@/components/ui/DataTable';

const STORAGE_KEY = 'renkoo_website_id';

const SECTION_ORDER = [
  'READY',
  'AWAITING_APPROVAL',
  'IN_PROGRESS',
  'BLOCKED',
  'VERIFY',
  'MEASURE',
  'COMPLETED',
] as const;

const SECTION_TITLES: Record<string, { title: string; desc: string }> = {
  READY: { title: 'Ready', desc: 'Prerequisites satisfied — pick up through the governed flow.' },
  AWAITING_APPROVAL: { title: 'Awaiting approval', desc: 'Proposals gated on human review. No execution until approved.' },
  IN_PROGRESS: { title: 'In progress', desc: 'Work underway. EXECUTED items await DONE marking, never assumed verified.' },
  BLOCKED: { title: 'Blocked', desc: 'Explicit blockers. Never presented as ready.' },
  VERIFY: { title: 'Verify', desc: 'EXECUTED ≠ VERIFIED. Confirm the live change.' },
  MEASURE: { title: 'Measure', desc: 'Verified work awaiting outcome. Execution alone is not success.' },
  COMPLETED: { title: 'Completed', desc: 'Verified work with measurement state — learning input.' },
};

function StatusChip({ value }: { value: string }) {
  return (
    <span className="inline-block rounded-rk-md border border-rk-border px-2 py-0.5 text-xs font-bold text-rk-ink">
      {String(value).replace(/_/g, ' ')}
    </span>
  );
}

export default function GrowthWorkPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Array<{ id: string; name?: string; url?: string }>>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [queue, setQueue] = useState<GrowthQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshNote, setRefreshNote] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /* Phase 37 — outcome loop: recent headlines + pending. */
  const [recent, setRecent] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [outcome, setOutcome] = useState<any>(null);
  const [outcomeLoading, setOutcomeLoading] = useState(false);

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
      setQueue(await getGrowthQueue(siteId));
    } catch (e: any) {
      setError(e?.message || 'Work queue failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(websiteId);
  }, [websiteId, load]);

  /* Phase 41 — deep links preserve context:
   * ?actionId= opens the work-item drawer once the
   * website resolves (Growth Plan routes through here
   * so approval/blocker/verify gates are never
   * bypassed). Param is dropped, never replayed. */
  useEffect(() => {
    if (!websiteId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const actionId = params.get('actionId');
    if (!actionId) return;
    params.delete('actionId');
    const clean =
      `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState(null, '', clean);
    void openDetail(actionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [websiteId]);

  useEffect(() => {
    if (!websiteId) return;
    let cancelled = false;
    Promise.all([
      getRecentOutcomes(websiteId).catch(() => null),
      getPendingOutcomes(websiteId).catch(() => null),
    ]).then(([r, p]) => {
      if (cancelled) return;
      setRecent(Array.isArray((r as any)?.items) ? (r as any).items : []);
      setPending(Array.isArray((p as any)?.items) ? (p as any).items : []);
    });
    return () => {
      cancelled = true;
    };
  }, [websiteId]);

  async function openOutcome(actionId: string) {
    if (!websiteId) return;
    setOutcomeLoading(true);
    try {
      setOutcome(await getActionOutcome(websiteId, actionId));
    } catch {
      setOutcome(null);
    } finally {
      setOutcomeLoading(false);
    }
  }

  async function openDetail(actionId: string) {
    if (!websiteId) return;
    setDetailLoading(true);
    try {
      setDetail(await getGrowthWorkItem(websiteId, actionId));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const columns: DataTableColumn<any>[] = [
    {
      key: 'title',
      label: 'Work',
      priority: 'high',
      render: (r) => (
        <span>
          <span className="font-semibold text-rk-ink">{String(r.title)}</span>
          <span className="rk-metadata block">
            {String(r.workType).replace(/_/g, ' ')} · {String(r.horizon ?? 'unscheduled')} ·{' '}
            {String(r.goalAlignment ?? 'alignment unknown')}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (r) => <StatusChip value={String(r.status)} />,
    },
    {
      key: 'owner',
      label: 'Owner',
      render: (r) => String(r.owner),
    },
    {
      key: 'nextStep',
      label: 'Next step',
      render: (r) => (
        <span className="block max-w-[300px] truncate" title={String(r.nextStep)}>
          {String(r.nextStep)}
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
        eyebrow="Work queue"
        title="Growth work"
        description="What the team picks up today — ready, approval, blocked, verify, measure. Governed, never automatic."
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
            <SecondaryButton
              type="button"
              onClick={() =>
                void refreshGrowthQueue(websiteId)
                  .then((r) => {
                    setRefreshNote(r.note);
                    void load(websiteId);
                  })
                  .catch((e: any) => setRefreshNote(e?.message || 'Refresh failed.'))
              }
            >
              Recompute
            </SecondaryButton>
            <Link href="/growth-plan">
              <PrimaryButton type="button">Growth plan</PrimaryButton>
            </Link>
          </div>
        }
      />

      {refreshNote ? (
        <div className="mt-4">
          <InsightBlock eyebrow="Refresh" title="Queue recomputed">
            {refreshNote}
          </InsightBlock>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Composing work queue" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Work queue failed to load"
            description={error}
            onRetry={() => void load(websiteId)}
          />
        </div>
      ) : queue ? (
        <>
          <section aria-label="Today" className="mt-6">
            <Panel
              eyebrow="Today — maximum 5"
              title="What to pick up now"
              description="Queue ordering over NOW decisions and READY actions. Planning is not execution."
            >
              {(queue.today ?? []).length === 0 ? (
                <EmptyState
                  title="Nothing queued for today"
                  description="No READY work with satisfied prerequisites. Check READY and BLOCKED below."
                />
              ) : (
                <ol className="space-y-2">
                  {(queue.today ?? []).map((t: any, i: number) => (
                    <li key={t.fingerprint} className="rounded-rk-md border border-rk-border p-3">
                      <p className="text-sm">
                        <span className="rk-number mr-2 text-rk-muted">{String(i + 1).padStart(2, '0')}</span>
                        <button
                          type="button"
                          className="rk-focusable font-semibold text-rk-ink underline underline-offset-2"
                          onClick={() => void openDetail(t.actionId)}
                        >
                          {String(t.title)}
                        </button>
                      </p>
                      <p className="rk-metadata mt-1">
                        <StatusChip value={String(t.status)} /> Owner {String(t.owner)} ·{' '}
                        {String(t.todayReason ?? '')}
                      </p>
                      <p className="mt-1 text-sm font-medium">{String(t.nextStep)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </section>

          <section aria-label="Outcomes" className="mt-4">
            <Panel
              eyebrow="Outcome loop"
              title="After the work — what actually changed"
              description="Observed outcomes with evidence states. Execution is never confused with outcome."
            >
              {recent.length === 0 && pending.length === 0 ? (
                <EmptyState
                  title="No outcomes yet"
                  description="Outcomes appear after verified work passes its measurement window. Withheld judgment is not failure."
                />
              ) : (
                <>
                  {recent.length > 0 ? (
                    <ul className="space-y-2">
                      {recent.map((r: any) => (
                        <li key={r.actionId} className="rounded-rk-md border border-rk-border p-3">
                          <p className="text-sm">
                            <button
                              type="button"
                              className="rk-focusable font-semibold text-rk-ink underline underline-offset-2"
                              onClick={() => void openOutcome(r.actionId)}
                            >
                              {String(r.title)}
                            </button>{' '}
                            <StatusChip value={String(r.signal)} />
                          </p>
                          <p className="rk-metadata mt-1">{String(r.interpretation)}</p>
                          <p className="mt-1 text-sm">Next: {String(r.nextDecision)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {pending.length > 0 ? (
                    <div className="mt-2">
                      <p className="rk-metadata mb-1">OUTCOME PENDING / UNAVAILABLE</p>
                      <ul className="space-y-1 text-sm text-rk-muted">
                        {pending.map((p: any) => (
                          <li key={p.actionId}>
                            {String(p.title)} — {String(p.readiness).replace(/_/g, ' ')}: {String(p.note)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {outcomeLoading ? (
                    <div className="mt-2">
                      <LoadingBlock title="Loading outcome" />
                    </div>
                  ) : outcome ? (
                    <div className="mt-3 rounded-rk-md border border-rk-border p-3">
                      <p className="text-sm font-semibold">{String(outcome.title)} — {String(outcome.signal).replace(/_/g, ' ')}</p>
                      <p className="rk-metadata mt-1">{String(outcome.interpretation)}</p>
                      <p className="mt-1 text-sm">{String(outcome.search.statement)}</p>
                      <p className="rk-metadata mt-1">{(outcome.ai.layers as string[]).join(' · ')}</p>
                      <p className="rk-metadata mt-1">AI presence: {String(outcome.ai.presence)} (citation never upgraded to recommendation).</p>
                      <p className="rk-metadata mt-1">{String(outcome.business.statement)}</p>
                      <p className="mt-1 text-sm font-medium">Next decision: {String(outcome.nextDecision)} — {String(outcome.nextNote)}</p>
                      <p className="rk-metadata mt-1">{String(outcome.causality)}</p>
                      <p className="rk-metadata mt-1">Hierarchy: {(outcome.hierarchy as string[]).join(' → ')}</p>
                    </div>
                  ) : null}
                </>
              )}
            </Panel>
          </section>

          {SECTION_ORDER.map((section) => {            const rows = (queue.sections as any)?.[section] ?? [];
            if (rows.length === 0) return null;
            const meta = SECTION_TITLES[section];
            return (
              <div className="mt-4" key={section}>
                <Panel
                  eyebrow={section.replace(/_/g, ' ')}
                  title={`${meta.title} — ${rows.length}`}
                  description={meta.desc}
                >
                  <DataTable
                    caption={`${meta.title} work items`}
                    columns={columns}
                    rows={rows}
                    keyOf={(r: any) => String(r.fingerprint)}
                    onRowClick={(r) => void openDetail(String((r as any).actionId))}
                    emptyTitle={`Nothing ${meta.title.toLowerCase()}`}
                    emptyDescription="This section is clear."
                    pageSize={10}
                  />
                </Panel>
              </div>
            );
          })}

          {(queue.dismissed ?? []).length > 0 ? (            <div className="mt-4">
              <Panel
                eyebrow="Dismissed"
                title={`Dismissed — ${queue.dismissed!.length} kept out of the queue`}
                description="Dismissed work never auto-resurrects. Reconsideration only with material evidence change."
              >
                <ul className="space-y-1 text-sm">
                  {queue.dismissed!.map((d) => (
                    <li key={d.actionId} className="flex justify-between gap-2">
                      <span className="truncate">{d.title}</span>
                      <span className="rk-metadata shrink-0">{d.reconsideration}</span>
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
        eyebrow="Work item"
        title={String(detail?.title ?? 'Work detail')}
        description="Full traceability: goal → decision → roadmap → action → execution → verification → measurement."
      >
        {detailLoading && !detail ? (
          <LoadingBlock title="Loading work item" />
        ) : detail ? (
          <>
            <DrawerMeta
              items={[
                { label: 'Type', value: String(detail.workType).replace(/_/g, ' ') },
                { label: 'Status', value: String(detail.status).replace(/_/g, ' ') },
                { label: 'Priority', value: detail.priorityBand },
                { label: 'Owner', value: detail.owner },
                { label: 'Approval', value: String(detail.approval).replace(/_/g, ' ') },
                { label: 'Client view', value: String(detail.clientApproval).replace(/_/g, ' ') },
                { label: 'Execution', value: detail.execution ?? 'Not started' },
                { label: 'Verification', value: detail.verification ?? 'Not started' },
                { label: 'Measurement', value: detail.measurement ?? 'Pending' },
                { label: 'Goal', value: detail.goal || 'Unset' },
                { label: 'Horizon', value: detail.horizon ?? 'Unscheduled' },
                { label: 'Evidence', value: detail.evidenceState },
              ]}
            />
            <DrawerSection title="Why this work">
              <ul className="space-y-1 text-sm text-rk-muted">
                {detail.evidence.map((e: string, i: number) => (
                  <li key={i}>· {e}</li>
                ))}
              </ul>
              {detail.stale ? (
                <p className="mt-2 text-sm text-rk-muted">
                  STALE_EVIDENCE — review before executing. Queue never silently executes stale work.
                </p>
              ) : null}
            </DrawerSection>
            {detail.approvalPack ? (
              <DrawerSection title="Approval pack">
                <ul className="space-y-1 text-sm">
                  {detail.approvalPack.map((line: string, i: number) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
                <p className="rk-metadata mt-1">
                  Approve or reject in Actions → proposal review. No automatic approval exists.
                </p>
              </DrawerSection>
            ) : null}
            {detail.blocker ? (
              <DrawerSection title="Blocker">
                <InsightBlock eyebrow="Blocked" title={String(detail.blocker).replace(/_/g, ' ')}>
                  {String(detail.blockerNote ?? '')}
                </InsightBlock>
              </DrawerSection>
            ) : null}
            {detail.dependencies.length > 0 ? (
              <DrawerSection title="Dependencies">
                <ul className="space-y-1 text-sm text-rk-muted">
                  {detail.dependencies.map((d: string, i: number) => (
                    <li key={i}>· {d}</li>
                  ))}
                </ul>
              </DrawerSection>
            ) : null}
            <DrawerSection title="Trace">
              <ol className="space-y-1 text-sm text-rk-muted">
                {detail.trace.map((t: string, i: number) => (
                  <li key={i}>
                    {i + 1}. {t}
                  </li>
                ))}
              </ol>
            </DrawerSection>
            <DrawerSection title="Next step">
              <div className="mt-1">
                <NextAction
                  label={detail.nextStep}
                  detail="Governed flow: proposal → approval → execution → verification → measurement."
                  href="/execution"
                />
              </div>
              <p className="rk-metadata mt-2">{detail.capacity}</p>
            </DrawerSection>
          </>
        ) : null}
      </Drawer>
    </AppShell>
  );
}
