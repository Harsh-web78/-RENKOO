'use client';

/*
 * RENKOO V2 â€” Technical health command center (Phase 5E).
 * Real crawl data only via getTechnicalSeoLatest + issue
 * lifecycle APIs. Issues group by severity; detail opens in
 * a Drawer with evidence, recommended fix and a tracked
 * action path. Monitoring alerts link where they exist.
 * Fix state is real backend state â€” never invented.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getTechnicalSeoLatest,
  getTechnicalSeoByCrawl,
  getWebsites,
  isLimitError,
  limitUsageText,
  startCrawl,
  resolveSeoIssue,
  ignoreSeoIssue,
  reopenSeoIssue,
  createAction,
  listMonitoringAlerts,
  type Website,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import { useElapsed } from '@/lib/useElapsed';
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
  DataSourceBadge,
  FreshnessBadge,
  SeverityChip,
  StatusChip,
  LoadingBlock,
  ErrorState,
  EmptyState,
  LimitReachedState,
  InsightBlock,
  EvidenceList,
  RecommendationCallout,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';
import { ProgressBar } from '@/components/charts';

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(value: unknown) {
  return num(value).toLocaleString('en-US');
}

function fmtDate(value: unknown) {
  if (!value) return 'â€”';
  try {
    return new Date(String(value)).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric', year: 'numeric' },
    );
  } catch {
    return String(value);
  }
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export default function TechnicalSeoPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const auditSeconds = useElapsed(running);
  const [runMsg, setRunMsg] = useState('');
  const [limitError, setLimitError] =
    useState<unknown>(null);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  const [alertCount, setAlertCount] = useState<number | null>(
    null,
  );
  const [drawerIssue, setDrawerIssue] = useState<any>(null);
  const [issueBusy, setIssueBusy] = useState<
    Record<string, boolean>
  >({});
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
      const [res, alerts] = await Promise.all([
        getTechnicalSeoLatest(id),
        listMonitoringAlerts({
          websiteId: id,
        }).catch(() => null),
      ]);
      setData(res);
      setAlertCount(
        Array.isArray((alerts as any)?.alerts)
          ? (alerts as any).alerts.length
          : null,
      );
    } catch (err: any) {
      setData(null);
      setError(
        err?.message || 'Failed to load technical data.',
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
        else if (list.length === 0)
          setError('No website found. Add a website first.');
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
    setDrawerIssue(null);
    setRunMsg('');
    if (typeof window !== 'undefined')
      localStorage.setItem('renkoo_website_id', id);
    setLoading(true);
    void load(id).finally(() => setLoading(false));
  }

  async function handleRunAudit() {
    if (!websiteId || running) return;

    try {
      setRunning(true);
      setRunMsg('');
      setLimitError(null);
      setError('');

      const result = await startCrawl(websiteId);
      const crawlId = result?.crawl?.id;

      if (!crawlId) {
        throw new Error(
          'Crawl completed but no crawl ID was returned. Please try again.',
        );
      }

      const [technicalSeo, alerts] = await Promise.all([
        getTechnicalSeoByCrawl(crawlId),
        listMonitoringAlerts({
          websiteId,
        }).catch(() => null),
      ]);

      setData(technicalSeo);

      setAlertCount(
        Array.isArray((alerts as any)?.alerts)
          ? (alerts as any).alerts.length
          : null,
      );

      setRunMsg(
        'Audit complete — results refreshed below.',
      );
    } catch (err: any) {
      if (isLimitError(err)) {
        setLimitError(err);
        setRunMsg('');
      } else {
        setRunMsg(
          err?.message || 'Audit failed to start.',
        );
      }
    } finally {
      setRunning(false);
    }
  }

  async function transitionIssue(
    issue: any,
    mode: 'resolve' | 'ignore' | 'reopen',
  ) {
    const key = String(issue.id);
    if (issueBusy[key]) return;
    try {
      setIssueBusy((p) => ({ ...p, [key]: true }));
      const updated =
        mode === 'resolve'
          ? await resolveSeoIssue(key)
          : mode === 'ignore'
            ? await ignoreSeoIssue(key)
            : await reopenSeoIssue(key);
      setData((prev: any) => {
        if (!prev) return prev;
        const issues = Array.isArray(prev.issues)
          ? prev.issues
          : [];
        return {
          ...prev,
          issues: issues.map((i: any) =>
            String(i.id) === key
              ? { ...i, ...(updated as any) }
              : i,
          ),
        };
      });
      setDrawerIssue((prev: any) =>
        prev && String(prev.id) === key
          ? { ...prev, ...(updated as any) }
          : prev,
      );
    } catch (err: any) {
      setError(
        err?.message || 'Could not update issue status.',
      );
    } finally {
      setIssueBusy((p) => ({ ...p, [key]: false }));
    }
  }

  async function handleCreateAction(issue: any) {
    const key = String(issue.id);
    if (actionBusy[key] || actionDone[key]) return;
    try {
      setActionBusy((p) => ({ ...p, [key]: true }));
      await createAction({
        websiteId,
        type: 'TECHNICAL_SEO',
        title: `Fix: ${String(issue.title || issue.code || 'technical issue')}`.slice(
          0,
          140,
        ),
        description: String(
          issue.description ||
            issue.recommendation ||
            'Technical SEO issue from latest crawl',
        ).slice(0, 500),
        priority: String(
          issue.severity || 'MEDIUM',
        ).toUpperCase(),
        metadata: {
          source: 'TECHNICAL_SEO',
          issueId: issue.id,
          code: issue.code,
          severity: issue.severity,
        },
      });
      setActionDone((p) => ({ ...p, [key]: true }));
    } catch {
      /* stays usable */
    } finally {
      setActionBusy((p) => ({ ...p, [key]: false }));
    }
  }

  const issues: any[] = useMemo(() => {
    const list = Array.isArray((data as any)?.issues)
      ? (data as any).issues
      : [];
    return list;
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((i: any) => {
      if (
        severityFilter !== 'ALL' &&
        String(i.severity || '').toUpperCase() !==
          severityFilter
      )
        return false;
      if (
        statusFilter !== 'ALL' &&
        String(i.status || 'OPEN').toUpperCase() !==
          statusFilter
      )
        return false;
      if (!q) return true;
      return (
        `${i.title || ''} ${i.code || ''} ${i.description || ''}`
          .toLowerCase()
          .includes(q)
      );
    });
  }, [issues, search, severityFilter, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {
      CRITICAL: [],
      HIGH: [],
      MEDIUM: [],
      LOW: [],
    };
    for (const i of filtered) {
      const key = String(i.severity || '')
        .toUpperCase()
        .trim();
      if (groups[key]) groups[key].push(i);
      else groups.LOW.push(i);
    }
    return SEVERITY_ORDER.filter(
      (k) => groups[k].length > 0,
    ).map((k) => ({ severity: k, items: groups[k] }));
  }, [filtered]);

  const score = (data as any)?.score;
  const crawl = (data as any)?.crawl;
  const openCount = issues.filter(
    (i: any) =>
      String(i.status || 'OPEN').toUpperCase() === 'OPEN',
  ).length;
  const criticalCount = issues.filter(
    (i: any) =>
      String(i.severity || '').toUpperCase() ===
        'CRITICAL' &&
      String(i.status || 'OPEN').toUpperCase() === 'OPEN',
  ).length;

  const columns: DataTableColumn<any>[] = [
    {
      key: 'issue',
      label: 'Issue',
      priority: 'high',
      render: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-rk-ink">
            {String(r.title || r.code || 'Issue')}
          </p>
          {r.code ? (
            <p className="rk-metadata">{String(r.code)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'pages',
      label: 'Affected pages',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) =>
        num(r.affectedPages ?? r.pageCount ?? 0),
      render: (r) => (
        <span className="rk-number">
          {fmtInt(r.affectedPages ?? r.pageCount ?? 0)}
        </span>
      ),
    },
    {
      key: 'severity',
      label: 'Severity',
      priority: 'high',
      render: (r) => (
        <SeverityChip
          severity={String(r.severity || 'MEDIUM')}
        />
      ),
    },
    {
      key: 'seen',
      label: 'First seen',
      priority: 'low',
      render: (r) => (
        <span className="rk-number text-rk-secondary">
          {fmtDate(r.firstSeenAt || r.createdAt)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      priority: 'medium',
      render: (r) => (
        <StatusChip
          status={String(r.status || 'OPEN')}
        />
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
        eyebrow="Visibility"
        title="Technical SEO"
        description="Measured crawl health â€” issues with evidence, real fix state, and a tracked path to done."
        actions={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => void handleRunAudit()}
              disabled={running || !websiteId}
            >
              {running
                ? `Auditingâ€¦ ${auditSeconds}s`
                : 'Run audit'}
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
              source="Site crawl"
              connected={Boolean(data)}
            />
            {crawl?.completedAt || crawl?.createdAt ? (
              <FreshnessBadge
                label={`Crawled ${fmtDate(crawl.completedAt || crawl.createdAt)}`}
              />
            ) : null}
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading crawl data" />
        </div>
      ) : error && !data ? (
        <div className="mt-6">
          <ErrorState
            title="Technical data failed to load"
            description={error}
            onRetry={() => {
              setLoading(true);
              if (websiteId) void load(websiteId);
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Context"
            title="Website & filters"
            description="Switching website loads its latest measured crawl automatically."
          >
            <FilterBar
              searchValue={search}
              searchPlaceholder="Search issuesâ€¦"
              onSearchChange={setSearch}
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
                  key: 'severity',
                  label: 'Severity',
                  value: severityFilter,
                  options: [
                    { value: 'ALL', label: 'All' },
                    {
                      value: 'CRITICAL',
                      label: 'Critical',
                    },
                    { value: 'HIGH', label: 'High' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'LOW', label: 'Low' },
                  ],
                  onChange: setSeverityFilter,
                },
                {
                  key: 'status',
                  label: 'Status',
                  value: statusFilter,
                  options: [
                    { value: 'ALL', label: 'All' },
                    { value: 'OPEN', label: 'Open' },
                    { value: 'FIXED', label: 'Fixed' },
                    { value: 'IGNORED', label: 'Ignored' },
                  ],
                  onChange: setStatusFilter,
                },
              ]}
              onClearAll={() => {
                setSearch('');
                setSeverityFilter('ALL');
                setStatusFilter('OPEN');
              }}
            />
            {runMsg ? (
              <p className="rk-body mt-2">{runMsg}</p>
            ) : null}
            {limitError ? (
              <div className="mt-2">
                <LimitReachedState
                  title="Free plan limit reached"
                  description="This audit could not start because the workspace hit its crawl allowance. Your existing data is untouched â€” raising the limit unlocks the next audit."
                  detail={limitUsageText(
                    limitError,
                  )}
                  actionLabel="View plans"
                  actionHref="/billing"
                />
              </div>
            ) : null}
          </Panel>

          {error ? (
            <ErrorState
              title="Partial load failure"
              description={error}
              onRetry={() =>
                websiteId && void load(websiteId)
              }
            />
          ) : null}

          {!data || issues.length === 0 ? (
            <EmptyState
              title="No crawl data yet"
              description="Run an audit to measure this website's technical health. Issues, evidence and fix state will appear here."
              actionLabel={
                running ? undefined : 'Run audit'
              }
              onAction={
                running
                  ? undefined
                  : () => void handleRunAudit()
              }
            />
          ) : (
            <>
              <section aria-label="Primary signal">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Metric
                    label="Health score"
                    value={
                      score === null ||
                      score === undefined
                        ? 'â€”'
                        : String(score)
                    }
                    detail="Latest measured crawl"
                  />
                  <Metric
                    label="Pages crawled"
                    value={(() => {
                      const raw =
                        crawl?.pagesCrawled ??
                        crawl?.pages ??
                        (data as any)?.pages;
                      return raw === undefined ||
                        raw === null
                        ? 'â€”'
                        : fmtInt(raw);
                    })()}
                    detail="Coverage"
                  />
                  <Metric
                    label="Open issues"
                    value={fmtInt(openCount)}
                    detail="Need resolution"
                    tone={
                      openCount > 0 ? 'warning' : 'positive'
                    }
                  />
                  <Metric
                    label="Critical open"
                    value={fmtInt(criticalCount)}
                    detail="Fix first"
                    tone={
                      criticalCount > 0
                        ? 'negative'
                        : 'positive'
                    }
                  />
                </div>
                {typeof score === 'number' && (
                  <div className="mt-3">
                    <ProgressBar
                      value={num(score)}
                      target={100}
                      summary={`Technical health score ${score} out of 100.`}
                    />
                  </div>
                )}
              </section>

              {alertCount !== null && alertCount > 0 && (
                <InsightBlock
                  eyebrow="Monitoring connection"
                  title={`${alertCount} monitoring alert${alertCount === 1 ? '' : 's'} reference this website`}
                >
                  <div className="mt-2">
                    <NextAction
                      label="Open Monitoring"
                      detail="Acknowledge and resolve technical alerts with persisted lifecycle."
                      href="/monitoring"
                    />
                  </div>
                </InsightBlock>
              )}

              <Panel
                eyebrow="Issues by severity"
                title="Issue table"
                description="Open a row for evidence, fix guidance and tracked action."
              >
                {filtered.length === 0 ? (
                  <EmptyState
                    title="No issues match"
                    description="Adjust severity or status filters."
                  />
                ) : (
                  grouped.map((g) => (
                    <div
                      key={g.severity}
                      className="mb-6 last:mb-0"
                    >
                      <h3 className="rk-section-title mb-2">
                        {g.severity} â€” {g.items.length}
                      </h3>
                      <DataTable
                        caption={`${g.severity} severity issues`}
                        columns={columns}
                        rows={g.items}
                        keyOf={(r: any) =>
                          String(r.id || r.code)
                        }
                        onRowClick={setDrawerIssue}
                      />
                    </div>
                  ))
                )}
              </Panel>

              <RecommendationCallout
                title="Technical â†’ action"
                text="Every fix becomes a tracked action with real DONE state. RENKOO never marks a fix complete on its own â€” resolve it here after the work ships."
                actionLabel="Open Action Engine"
                actionHref="/actions"
              />
            </>
          )}
        </div>
      )}

      <Drawer
        open={drawerIssue !== null}
        onClose={() => setDrawerIssue(null)}
        eyebrow="Issue detail"
        title={String(
          drawerIssue?.title ||
            drawerIssue?.code ||
            'Issue',
        )}
        description="Measured evidence, why it matters, and the recommended fix."
      >
        {drawerIssue && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Severity',
                  value: String(
                    drawerIssue.severity || 'â€”',
                  ).replace(/_/g, ' '),
                },
                {
                  label: 'Affected pages',
                  value: fmtInt(
                    drawerIssue.affectedPages ??
                      drawerIssue.pageCount ??
                      0,
                  ),
                },
                {
                  label: 'Status',
                  value: String(
                    drawerIssue.status || 'OPEN',
                  ).replace(/_/g, ' '),
                },
                {
                  label: 'First seen',
                  value: fmtDate(
                    drawerIssue.firstSeenAt ||
                      drawerIssue.createdAt,
                  ),
                },
              ]}
            />
            <DrawerSection title="Evidence">
              {Array.isArray(drawerIssue.affectedUrls) &&
              drawerIssue.affectedUrls.length > 0 ? (
                <EvidenceList
                  items={drawerIssue.affectedUrls
                    .slice(0, 8)
                    .map((u: any) => ({
                      text: String(u?.url || u),
                      source: 'Latest crawl',
                    }))}
                />
              ) : (
                <p className="rk-body">
                  {String(
                    drawerIssue.evidence ||
                      drawerIssue.description ||
                      'Measured in the latest crawl.',
                  )}
                </p>
              )}
            </DrawerSection>
            <DrawerSection title="Why it matters & fix">
              <p className="rk-body">
                {String(
                  drawerIssue.whyItMatters ||
                    drawerIssue.impact ||
                    'Unresolved technical issues compound: crawl waste, weaker indexing and lost visibility.',
                )}
              </p>
              <p className="rk-body mt-2">
                <strong className="font-semibold text-rk-ink">
                  Recommended fix:{' '}
                </strong>
                {String(
                  drawerIssue.recommendation ||
                    drawerIssue.fix ||
                    'Follow the issue guidance, ship the change, then re-crawl to verify.',
                )}
              </p>
            </DrawerSection>
            <DrawerSection title="Fix state">
              <div className="flex flex-wrap gap-2">
                {String(
                  drawerIssue.status || 'OPEN',
                ).toUpperCase() === 'OPEN' ? (
                  <>
                    <PrimaryButton
                      onClick={() =>
                        void transitionIssue(
                          drawerIssue,
                          'resolve',
                        )
                      }
                      disabled={
                        issueBusy[
                          String(drawerIssue.id)
                        ]
                      }
                    >
                      Mark fixed
                    </PrimaryButton>
                    <SecondaryButton
                      onClick={() =>
                        void transitionIssue(
                          drawerIssue,
                          'ignore',
                        )
                      }
                      disabled={
                        issueBusy[
                          String(drawerIssue.id)
                        ]
                      }
                    >
                      Ignore
                    </SecondaryButton>
                  </>
                ) : (
                  <SecondaryButton
                    onClick={() =>
                      void transitionIssue(
                        drawerIssue,
                        'reopen',
                      )
                    }
                    disabled={
                      issueBusy[String(drawerIssue.id)]
                    }
                  >
                    Reopen
                  </SecondaryButton>
                )}
                <SecondaryButton
                  onClick={() =>
                    void handleCreateAction(drawerIssue)
                  }
                  disabled={
                    actionBusy[
                      String(drawerIssue.id)
                    ] ||
                    actionDone[String(drawerIssue.id)]
                  }
                >
                  {actionDone[String(drawerIssue.id)]
                    ? 'Added'
                    : 'Add to Actions'}
                </SecondaryButton>
              </div>
            </DrawerSection>
            <DrawerSection title="Outcome">
              <NextAction
                label="See what changed"
                detail="Monitoring measures crawl-over-crawl movement after the fix."
                href="/monitoring"
              />
            </DrawerSection>
          </>
        )}
      </Drawer>
    </AppShell>
  );
}
