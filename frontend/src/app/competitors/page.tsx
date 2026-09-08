'use client';

/*
 * RENKOO V2 — Competitor War Room overview (Phase 5F).
 * Real comparison-engine data only: tracked competitors,
 * latest crawl status, score/issues/critical signals, and
 * entry points into per-competitor detail. Add/delete/crawl
 * use the existing APIs with an approval gate for deletion.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getWebsites,
  getCompetitors,
  createCompetitor,
  deleteCompetitor,
  crawlCompetitor,
  getLatestCompetitorCrawl,
  isLimitError,
  limitDetails,
  limitUsageText,
  type Website,
  type Competitor,
} from '@/lib/api';
import { limitTitle } from '@/lib/plans';
import AppShell from '@/components/AppShell';
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
  DangerButton,
  ConfirmDialog,
  DataSourceBadge,
  FreshnessBadge,
  StatusChip,
  LoadingBlock,
  ErrorState,
  EmptyState,
  LimitReachedState,
  InsightBlock,
  EvidenceList,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtInt(value: unknown) {
  return num(value).toLocaleString('en-US');
}

function fmtDate(value: unknown) {
  if (!value) return '—';
  try {
    return new Date(String(value)).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric', year: 'numeric' },
    );
  } catch {
    return String(value);
  }
}

interface Row {
  competitor: Competitor;
  crawl: any;
  crawlState: 'idle' | 'loading' | 'crawling' | 'error';
  crawlError: string;
  crawlLimit?: unknown;
}

export default function CompetitorsPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [formLimit, setFormLimit] =
    useState<unknown>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [drawerRow, setDrawerRow] = useState<Row | null>(
    null,
  );

  const loadLatest = useCallback(
    async (competitors: Competitor[]) => {
      const results = await Promise.all(
        competitors.map(async (c) => {
          try {
            const crawl = await getLatestCompetitorCrawl(
              c.id,
            );
            return { id: c.id, crawl };
          } catch {
            return { id: c.id, crawl: null };
          }
        }),
      );
      const map = new Map(
        results.map((r) => [r.id, r.crawl]),
      );
      setRows((prev) =>
        prev.map((row) => ({
          ...row,
          crawl:
            map.get(row.competitor.id) ?? row.crawl,
        })),
      );
    },
    [],
  );

  const load = useCallback(
    async (siteId: string) => {
      try {
        setError('');
        const all = await getCompetitors();
        const list = (Array.isArray(all) ? all : []).filter(
          (c: any) =>
            !siteId ||
            String(c.websiteId || '') === siteId,
        );
        setRows(
          list.map((competitor) => ({
            competitor,
            crawl: null,
            crawlState: 'loading' as const,
            crawlError: '',
          })),
        );
        await loadLatest(list);
        setRows((prev) =>
          prev.map((row) =>
            row.crawlState === 'loading'
              ? { ...row, crawlState: 'idle' as const }
              : row,
          ),
        );
      } catch (err: any) {
        setError(
          err?.message || 'Failed to load competitors.',
        );
      }
    },
    [loadLatest],
  );

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
        await load(valid);
      } catch (err: any) {
        if (!cancelled)
          setError(
            err?.message || 'Failed to load workspaces.',
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
    setDrawerRow(null);
    if (typeof window !== 'undefined')
      localStorage.setItem('renkoo_website_id', id);
    setLoading(true);
    void load(id).finally(() => setLoading(false));
  }

  async function handleCreate() {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url || !websiteId || creating) return;
    try {
      setCreating(true);
      setFormError('');
      setFormLimit(null);
      const created = await createCompetitor({
        name,
        url,
        websiteId,
      });
      setRows((prev) => [
        {
          competitor: created,
          crawl: null,
          crawlState: 'idle',
          crawlError: '',
        },
        ...prev,
      ]);
      setNewName('');
      setNewUrl('');
      setShowAdd(false);
      void loadLatest([created]);
    } catch (err: any) {
      if (isLimitError(err)) {
        setFormLimit(err);
      } else {
        setFormError(
          err?.message || 'Could not add competitor.',
        );
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleCrawl(row: Row) {
    const id = row.competitor.id;
    setRows((prev) =>
      prev.map((r) =>
        r.competitor.id === id
          ? {
              ...r,
              crawlState: 'crawling',
              crawlError: '',
              crawlLimit: null,
            }
          : r,
      ),
    );
    try {
      await crawlCompetitor(id);
      const deadline = Date.now() + 10 * 60 * 1000;
      let done = false;
      while (!done && Date.now() < deadline) {
        await new Promise((res) =>
          setTimeout(res, 5000),
        );
        try {
          const latest = await getLatestCompetitorCrawl(
            id,
          );
          const status = String(
            (latest as any)?.status || '',
          ).toUpperCase();
          if (
            status === 'COMPLETED' ||
            status === 'FAILED'
          ) {
            done = true;
            setRows((prev) =>
              prev.map((r) =>
                r.competitor.id === id
                  ? {
                      ...r,
                      crawl: latest,
                      crawlState: 'idle',
                    }
                  : r,
              ),
            );
          }
        } catch {
          /* keep polling until timeout */
        }
      }
      setRows((prev) =>
        prev.map((r) =>
          r.competitor.id === id &&
          r.crawlState === 'crawling'
            ? { ...r, crawlState: 'idle' as const }
            : r,
        ),
      );
    } catch (err: any) {
      setRows((prev) =>
        prev.map((r) =>
          r.competitor.id === id
            ? {
                ...r,
                crawlState: 'error' as const,
                crawlError: isLimitError(err)
                  ? ''
                  : err?.message ||
                    'Crawl failed to start.',
                crawlLimit: isLimitError(err)
                  ? err
                  : null,
              }
            : r,
        ),
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) return;
    try {
      setDeleting(true);
      await deleteCompetitor(deleteTarget.competitor.id);
      setRows((prev) =>
        prev.filter(
          (r) =>
            r.competitor.id !==
            deleteTarget.competitor.id,
        ),
      );
      setDeleteTarget(null);
    } catch (err: any) {
      setError(
        err?.message || 'Could not delete competitor.',
      );
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.competitor.name || ''} ${r.competitor.url || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const crawled = rows.filter((r) => r.crawl);
    const scores = crawled
      .map((r) => num((r.crawl as any)?.score, NaN))
      .filter((s) => Number.isFinite(s));
    const avg = scores.length
      ? Math.round(
          scores.reduce((a, b) => a + b, 0) /
            scores.length,
        )
      : null;
    const critical = crawled.reduce(
      (a, r) =>
        a +
        num(
          (r.crawl as any)?.critical ??
            (r.crawl as any)?.criticalIssues ??
            0,
        ),
      0,
    );
    let latestCrawl: string | null = null;
    for (const r of rows) {
      const v =
        (r.crawl as any)?.completedAt ||
        (r.crawl as any)?.createdAt;
      if (v && (!latestCrawl || String(v) > latestCrawl))
        latestCrawl = String(v);
    }
    return {
      total: rows.length,
      crawled: crawled.length,
      avg,
      critical,
      latestCrawl,
    };
  }, [rows]);

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'competitor',
      label: 'Competitor',
      priority: 'high',
      render: (r) => (
        <div className="min-w-0">
          <Link
            href={`/competitors/${r.competitor.id}`}
            className="rk-focusable font-semibold text-rk-ink underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.competitor.name || '—'}
          </Link>
          <p className="rk-metadata truncate">
            {r.competitor.url || ''}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Crawl status',
      priority: 'medium',
      render: (r) =>
        r.crawlState === 'crawling' ? (
          <StatusChip status="RUNNING" />
        ) : r.crawlState === 'error' ? (
          <StatusChip status="FAILED" />
        ) : r.crawl ? (
          <StatusChip
            status={String(
              (r.crawl as any)?.status || 'COMPLETED',
            )}
          />
        ) : (
          <span className="text-xs text-rk-muted">
            Never crawled
          </span>
        ),
    },
    {
      key: 'score',
      label: 'Score',
      align: 'right',
      priority: 'medium',
      sortable: true,
      sortValue: (r) => num((r.crawl as any)?.score, -1),
      render: (r) =>
        r.crawl &&
        (r.crawl as any)?.score !== undefined &&
        (r.crawl as any)?.score !== null ? (
          <span className="rk-number">
            {String((r.crawl as any).score)}
          </span>
        ) : (
          <span className="text-xs text-rk-muted">—</span>
        ),
    },
    {
      key: 'pages',
      label: 'Pages',
      align: 'right',
      priority: 'low',
      sortable: true,
      sortValue: (r) =>
        num(
          (r.crawl as any)?.pagesCrawled ??
            (r.crawl as any)?.pages ??
            -1,
        ),
      render: (r) => (
        <span className="rk-number">
          {r.crawl
            ? fmtInt(
                (r.crawl as any)?.pagesCrawled ??
                  (r.crawl as any)?.pages ??
                  0,
              )
            : '—'}
        </span>
      ),
    },
    {
      key: 'critical',
      label: 'Critical',
      align: 'right',
      priority: 'low',
      render: (r) => (
        <span className="rk-number">
          {r.crawl
            ? fmtInt(
                (r.crawl as any)?.critical ??
                  (r.crawl as any)?.criticalIssues ??
                  0,
              )
            : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      priority: 'high',
      render: (r) => (
        <div
          className="flex flex-wrap gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <SecondaryButton
            onClick={() => void handleCrawl(r)}
            disabled={r.crawlState === 'crawling'}
          >
            {r.crawlState === 'crawling'
              ? 'Crawling…'
              : 'Crawl'}
          </SecondaryButton>
          <Link
            href={`/competitors/${r.competitor.id}`}
          >
            <SecondaryButton type="button">
              Compare
            </SecondaryButton>
          </Link>
        </div>
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
        eyebrow="Market"
        title="Competitor War Room"
        description="Tracked competitors with measured crawl signals. Open one for the full comparison."
        actions={
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => {
                setLoading(true);
                void load(websiteId).finally(() =>
                  setLoading(false),
                );
              }}
              disabled={loading}
            >
              Refresh
            </SecondaryButton>
            <PrimaryButton
              onClick={() => setShowAdd((s) => !s)}
            >
              Add competitor
            </PrimaryButton>
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="Competitor crawls"
              connected={!loading && !error}
            />
            {!loading && stats.latestCrawl ? (
              <FreshnessBadge
                label={`Crawled ${fmtDate(stats.latestCrawl)}`}
              />
            ) : null}
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Loading competitors" />
        </div>
      ) : error && rows.length === 0 ? (
        <div className="mt-6">
          <ErrorState
            title="Competitors failed to load"
            description={error}
            onRetry={() => {
              setLoading(true);
              void load(websiteId).finally(() =>
                setLoading(false),
              );
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel
            eyebrow="Context"
            title="Workspace & search"
            description="Competitors are scoped to the selected website."
          >
            <FilterBar
              searchValue={search}
              searchPlaceholder="Search competitors…"
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
              ]}
              onClearAll={() => setSearch('')}
            />
          </Panel>

          {error ? (
            <ErrorState
              title="Partial load failure"
              description={error}
              onRetry={() => void load(websiteId)}
            />
          ) : null}

          {showAdd && (
            <Panel
              eyebrow="Track"
              title="Add competitor"
              description="Only name and URL are stored. Crawl after adding to measure."
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={newName}
                  onChange={(e) =>
                    setNewName(e.target.value)
                  }
                  placeholder="Competitor name"
                  maxLength={120}
                  className="input flex-1"
                />
                <input
                  value={newUrl}
                  onChange={(e) =>
                    setNewUrl(e.target.value)
                  }
                  placeholder="https://competitor.com"
                  maxLength={300}
                  className="input flex-1"
                />
                <PrimaryButton
                  onClick={() => void handleCreate()}
                  disabled={
                    creating ||
                    !newName.trim() ||
                    !newUrl.trim()
                  }
                >
                  {creating ? 'Adding…' : 'Add'}
                </PrimaryButton>
              </div>
              {formError ? (
                <p className="mt-2 text-sm text-rk-danger">
                  {formError}
                </p>
              ) : null}
              {formLimit ? (
                <div className="mt-2">
                  <LimitReachedState
                    title={limitTitle(
                      limitDetails(formLimit)?.planCode,
                    )}
                    description="This workspace already tracks its included competitor. Existing data is untouched."
                    detail={limitUsageText(
                      formLimit,
                    )}
                    actionLabel="View plans"
                    actionHref="/billing"
                  />
                </div>
              ) : null}
            </Panel>
          )}

          <section aria-label="Comparison summary">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric
                label="Tracked"
                value={fmtInt(stats.total)}
                detail="Competitors"
              />
              <Metric
                label="Crawled"
                value={fmtInt(stats.crawled)}
                detail="With measured data"
              />
              <Metric
                label="Avg. competitor score"
                value={
                  stats.avg === null
                    ? '—'
                    : String(stats.avg)
                }
                detail="Measured crawls"
              />
              <Metric
                label="Critical issues"
                value={fmtInt(stats.critical)}
                detail="Across competitors"
                tone={
                  stats.critical > 0
                    ? 'negative'
                    : 'neutral'
                }
              />
            </div>
          </section>

          <Panel
            eyebrow="Tracked competitors"
            title="Competitor list"
            description="Open a row for strengths, weaknesses, gaps and opportunities."
          >
            {filtered.length === 0 ? (
              <EmptyState
                title="No competitors tracked"
                description="Add a competitor above, crawl it, then open the comparison."
                actionLabel={
                  showAdd ? undefined : 'Add competitor'
                }
                onAction={
                  showAdd
                    ? undefined
                    : () => setShowAdd(true)
                }
              />
            ) : (
              <DataTable
                caption="Tracked competitors with crawl status"
                columns={columns}
                rows={filtered}
                keyOf={(r) => r.competitor.id}
                onRowClick={setDrawerRow}
                pageSize={12}
              />
            )}
          </Panel>

          <InsightBlock
            eyebrow="Opportunity gaps"
            title="Turn gaps into execution"
          >
            <div className="mt-2">
              <NextAction
                label="Open Opportunity Engine"
                detail="Competitor gaps persist as evidence-backed opportunities."
                href="/opportunities"
              />
            </div>
          </InsightBlock>
        </div>
      )}

      <Drawer
        open={drawerRow !== null}
        onClose={() => setDrawerRow(null)}
        eyebrow="Competitor"
        title={String(
          drawerRow?.competitor.name || 'Competitor',
        )}
        description={String(
          drawerRow?.competitor.url || '',
        )}
      >
        {drawerRow && (
          <>
            <DrawerMeta
              items={[
                {
                  label: 'Status',
                  value: String(
                    (drawerRow.crawl as any)?.status ||
                      (drawerRow.crawlState ===
                      'crawling'
                        ? 'RUNNING'
                        : 'Not crawled'),
                  ).replace(/_/g, ' '),
                },
                {
                  label: 'Score',
                  value:
                    (drawerRow.crawl as any)?.score !==
                      undefined &&
                    (drawerRow.crawl as any)?.score !==
                      null
                      ? String(
                          (drawerRow.crawl as any).score,
                        )
                      : 'Not measured',
                },
                {
                  label: 'Pages',
                  value: fmtInt(
                    (drawerRow.crawl as any)
                      ?.pagesCrawled ??
                      (drawerRow.crawl as any)?.pages ??
                      0,
                  ),
                },
                {
                  label: 'Last crawl',
                  value: fmtDate(
                    (drawerRow.crawl as any)
                      ?.completedAt ||
                      (drawerRow.crawl as any)
                        ?.createdAt,
                  ),
                },
              ]}
            />
            {drawerRow.crawlLimit ? (
              <DrawerSection title="Plan limit">
                <LimitReachedState
                  title={limitTitle(
                    limitDetails(drawerRow.crawlLimit)
                      ?.planCode,
                  )}
                  description="This crawl could not start because the workspace hit its crawl allowance. Existing data is untouched."
                  detail={limitUsageText(
                    drawerRow.crawlLimit,
                  )}
                  actionLabel="View plans"
                  actionHref="/billing"
                />
              </DrawerSection>
            ) : null}
            {drawerRow.crawlError ? (
              <DrawerSection title="Crawl note">
                <p className="text-sm text-rk-danger">
                  {drawerRow.crawlError}
                </p>
              </DrawerSection>
            ) : null}
            <DrawerSection title="Evidence">
              <EvidenceList
                items={[
                  {
                    text: `Latest crawl status: ${String((drawerRow.crawl as any)?.status || 'none yet')}.`,
                    source: 'Competitor crawl',
                  },
                  {
                    text: `Critical issues measured: ${fmtInt((drawerRow.crawl as any)?.critical ?? (drawerRow.crawl as any)?.criticalIssues ?? 0)}.`,
                    source: 'Competitor crawl',
                  },
                ]}
              />
            </DrawerSection>
            <DrawerSection title="Detail comparison">
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/competitors/${drawerRow.competitor.id}`}
                >
                  <PrimaryButton type="button">
                    Open full comparison
                  </PrimaryButton>
                </Link>
                <SecondaryButton
                  onClick={() => {
                    setDrawerRow(null);
                    void handleCrawl(drawerRow);
                  }}
                  disabled={
                    drawerRow.crawlState === 'crawling'
                  }
                >
                  {drawerRow.crawlState === 'crawling'
                    ? 'Crawling…'
                    : 'Crawl now'}
                </SecondaryButton>
                <DangerButton
                  onClick={() =>
                    setDeleteTarget(drawerRow)
                  }
                >
                  Remove
                </DangerButton>
              </div>
            </DrawerSection>
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Remove competitor?"
        description={`"${deleteTarget?.competitor.name || ''}" and its crawl history will stop being tracked. This cannot be undone.`}
        confirmLabel="Remove"
        cancelLabel="Keep"
        tone="danger"
        confirming={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}
