'use client';

import AppShell from '@/components/AppShell';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  ConfirmDialog,
  DataTable,
  FilterBar,
  StatusBadge,
  type DataTableColumn,
} from '@/components/ui';
import {
  deleteReport,
  generateReport,
  getCommandCenter,
  getReport,
  getReportScheduling,
  getWebsites,
  isLimitError,
  limitUsageText,
  listClients,
  listReports,
  revokeReportShare,
  shareReport,
  AgencyClient,
  CommandCenterEntry,
  ReportDetail,
  ReportListItem,
  ReportType,
  Website,
} from '@/lib/api';

const REPORT_TYPES: Array<{
  value: ReportType;
  label: string;
}> = [
  { value: 'EXECUTIVE', label: 'Executive Growth' },
  { value: 'SEO', label: 'SEO' },
  { value: 'AI_VISIBILITY', label: 'AI Search Visibility' },
  { value: 'TECHNICAL', label: 'Technical SEO' },
  { value: 'COMPETITOR', label: 'Competitor' },
  { value: 'OUTCOME', label: 'Business Outcome' },
  { value: 'AGENCY_CLIENT', label: 'Agency Client' },
];

export default function ReportsPage() {
  const [open, setOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [clients, setClients] = useState<AgencyClient[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [clientId, setClientId] = useState('ALL');
  const [reportType, setReportType] =
    useState<ReportType>('EXECUTIVE');
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [selected, setSelected] =
    useState<ReportDetail | null>(null);
  const [attention, setAttention] = useState<
    CommandCenterEntry[]
  >([]);
  const [scheduling, setScheduling] = useState('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [generateLimit, setGenerateLimit] =
    useState<unknown>(null);
  const [shareLink, setShareLink] = useState('');
  const [deleteTarget, setDeleteTarget] =
    useState<ReportListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(
    null,
  );

  const loadAll = useCallback(
    async (siteId: string, client: string) => {
      try {
        setLoading(true);
        setError('');

        const [reportData, center] = await Promise.all([
          listReports({
            websiteId: siteId || undefined,
            clientId:
              client !== 'ALL' ? client : undefined,
          }),
          getCommandCenter().catch(() => null),
          getReportScheduling()
            .then((result) => {
              if (!result.supported) {
                setScheduling(result.reason);
              }
            })
            .catch(() => null),
        ]);

        setReports(reportData.reports);
        setAttention(
          (center?.entries ?? []).slice(0, 5),
        );
      } catch (err: any) {
        setError(
          err?.message || 'Failed to load reports.',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    async function init() {
      try {
        const [sites, clientData] = await Promise.all([
          getWebsites(),
          listClients().catch(() => ({
            total: 0,
            clients: [],
          })),
        ]);

        const list = Array.isArray(sites) ? sites : [];
        setWebsites(list);
        setClients(clientData.clients);

        const first = list[0]?.id || '';
        setWebsiteId(first);

        if (first) {
          await loadAll(first, 'ALL');
        } else {
          setLoading(false);
        }
      } catch (err: any) {
        setError(
          err?.message || 'Failed to load workspace.',
        );
        setLoading(false);
      }
    }

    void init();
  }, [loadAll]);

  function refresh() {
    if (websiteId) {
      void loadAll(websiteId, clientId);
    }
  }

  async function handleGenerate() {
    if (!websiteId || generating) return;

    try {
      setGenerating(true);
      setError('');
      setGenerateLimit(null);
      setShareLink('');

      const report = await generateReport({
        websiteId,
        type: reportType,
        clientId:
          clientId !== 'ALL' ? clientId : undefined,
      });

      setReports((prev) => [
        {
          id: report.id,
          websiteId: report.websiteId,
          clientId: report.clientId,
          type: report.type,
          title: report.title,
          dateFrom: report.dateFrom,
          dateTo: report.dateTo,
          status: report.status,
          createdBy: null,
          shareToken: report.shareToken,
          shareExpiresAt: report.shareExpiresAt,
          shareRevoked: report.shareRevoked,
          createdAt: report.createdAt,
        },
        ...prev,
      ]);
      setSelected(report);
    } catch (err: any) {
      if (isLimitError(err)) {
        setGenerateLimit(err);
      } else {
        setError(
          err?.message || 'Report generation failed.',
        );
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleView(id: string) {
    try {
      setError('');
      const report = await getReport(id);
      setSelected(report);
      setShareLink('');
    } catch (err: any) {
      setError(
        err?.message || 'Failed to open report.',
      );
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;

    try {
      setDeleting(true);
      setDeleteError(null);
      await deleteReport(deleteTarget.id);
      const id = deleteTarget.id;
      setReports((prev) =>
        prev.filter((item) => item.id !== id),
      );

      if (selected?.id === id) {
        setSelected(null);
      }
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(
        err?.message || 'Failed to delete report.',
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleShare(report: ReportDetail | ReportListItem) {
    try {
      setError('');
      const result = await shareReport(report.id, 30);
      const url = `${window.location.origin}/share/${result.shareToken}`;
      setShareLink(url);

      setReports((prev) =>
        prev.map((item) =>
          item.id === report.id
            ? {
                ...item,
                shareToken: result.shareToken,
                shareExpiresAt:
                  result.shareExpiresAt,
                shareRevoked: false,
              }
            : item,
        ),
      );

      if (selected?.id === report.id) {
        const fresh = await getReport(report.id);
        setSelected(fresh);
      }
    } catch (err: any) {
      setError(
        err?.message || 'Failed to create share link.',
      );
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeReportShare(id);
      setShareLink('');

      setReports((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                shareRevoked: true,
              }
            : item,
        ),
      );

      if (selected?.id === id) {
        const fresh = await getReport(id);
        setSelected(fresh);
      }
    } catch (err: any) {
      setError(
        err?.message || 'Failed to revoke share link.',
      );
    }
  }

  function websiteNameOf(report: ReportListItem) {
    return (
      report.website?.name ||
      websites.find((site) => site.id === report.websiteId)
        ?.name ||
      '—'
    );
  }

  function clientNameOf(report: ReportListItem) {
    if (!report.clientId) return null;
    return (
      report.client?.name ||
      clients.find((client) => client.id === report.clientId)
        ?.name ||
      'Unnamed client'
    );
  }

  function periodOf(report: ReportListItem) {
    if (report.dateFrom || report.dateTo) {
      const from = report.dateFrom
        ? new Date(report.dateFrom).toLocaleDateString()
        : '—';
      const to = report.dateTo
        ? new Date(report.dateTo).toLocaleDateString()
        : '—';
      return `${from} → ${to}`;
    }
    return '—';
  }

  const reportColumns: DataTableColumn<ReportListItem>[] = [
    {
      key: 'report',
      label: 'Report',
      priority: 'high',
      render: (report) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-rk-ink">
            {report.title}
          </div>
          <div className="mt-0.5 text-xs text-rk-muted">
            {report.type.replace(/_/g, ' ')}
          </div>
        </div>
      ),
    },
    {
      key: 'workspace',
      label: 'Website / Client',
      priority: 'high',
      render: (report) => {
        const client = clientNameOf(report);
        return (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-rk-ink">
              {websiteNameOf(report)}
            </div>
            <div className="mt-0.5 truncate text-xs text-rk-muted">
              {client ?? 'No client'}
            </div>
          </div>
        );
      },
    },
    {
      key: 'period',
      label: 'Period',
      priority: 'low',
      render: (report) => (
        <span className="whitespace-nowrap text-xs text-rk-secondary">
          {periodOf(report)}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      priority: 'medium',
      render: (report) => (
        <StatusBadge status={report.status} />
      ),
    },
    {
      key: 'sharing',
      label: 'Sharing',
      priority: 'medium',
      render: (report) => {
        if (report.shareRevoked) {
          return <Badge label="Revoked" tone="danger" />;
        }
        if (report.shareToken || report.shared) {
          return <Badge label="Shared" tone="info" />;
        }
        return <Badge label="Private" tone="neutral" />;
      },
    },
    {
      key: 'created',
      label: 'Created',
      priority: 'low',
      render: (report) => (
        <span className="whitespace-nowrap text-xs text-rk-secondary">
          {new Date(report.createdAt).toLocaleString()}
        </span>
      ),
    },
  ];

  function renderReportExpanded(report: ReportListItem) {
    const client = clientNameOf(report);
    return (
      <div className="space-y-1 text-xs leading-5 text-rk-secondary">
        <p>
          <b className="text-rk-ink">Period:</b>{' '}
          {periodOf(report)}
        </p>
        <p>
          <b className="text-rk-ink">Workspace:</b>{' '}
          {websiteNameOf(report)}
          {client ? ` · ${client}` : ' · No client'}
        </p>
        {report.shareExpiresAt && !report.shareRevoked ? (
          <p>
            <b className="text-rk-ink">Shared until:</b>{' '}
            {new Date(
              report.shareExpiresAt,
            ).toLocaleString()}
          </p>
        ) : null}
        <p className="text-rk-muted">
          Open the report to inspect per-section availability.
        </p>
      </div>
    );
  }

  return (
    <AppShell
      mobileOpen={open}
      onClose={() => setOpen(false)}
      onMenu={() => setOpen(true)}
    >
      <section className="mx-auto max-w-[1500px] p-5 lg:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Reporting Center
              </div>
              <h1 className="mt-1 text-3xl font-bold">
                Reports
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Persisted snapshots from real workspace data.
                Missing data is labeled, never zero-filled.
              </p>
            </div>

            <div className="w-full sm:max-w-xl">
              <FilterBar
                selects={[
                  {
                    key: 'website',
                    label: 'Website',
                    value: websiteId,
                    options:
                      websites.length > 0
                        ? websites.map((site) => ({
                            value: site.id,
                            label: site.name,
                          }))
                        : [{ value: '', label: 'No websites' }],
                    onChange: (value) => {
                      setWebsiteId(value);
                      setSelected(null);
                      void loadAll(value, clientId);
                    },
                  },
                  {
                    key: 'client',
                    label: 'Client',
                    value: clientId,
                    options: [
                      { value: 'ALL', label: 'All clients' },
                      ...clients.map((client) => ({
                        value: client.id,
                        label: client.name,
                      })),
                    ],
                    onChange: (value) => {
                      setClientId(value);
                      void loadAll(websiteId, value);
                    },
                  },
                ]}
                activeFilterCount={clientId !== 'ALL' ? 1 : 0}
                onClearAll={
                  clientId !== 'ALL'
                    ? () => {
                        setClientId('ALL');
                        void loadAll(websiteId, 'ALL');
                      }
                    : undefined
                }
              />
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {generateLimit ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-bold text-amber-900">
                Free plan limit reached
              </p>

              <p className="mt-1">
                This workspace already used its
                included monthly reports. Your
                existing reports are untouched.
                {limitUsageText(generateLimit)
                  ? ` ${limitUsageText(generateLimit)}.`
                  : ''}
              </p>

              <a
                href="/billing"
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700"
              >
                View plans
              </a>
            </div>
          ) : null}

          {scheduling && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
              Scheduled delivery: {scheduling}
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={reportType}
                onChange={(e) =>
                  setReportType(
                    e.target.value as ReportType,
                  )
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold outline-none"
              >
                {REPORT_TYPES.map((type) => (
                  <option
                    key={type.value}
                    value={type.value}
                  >
                    {type.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={!websiteId || generating}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-60"
              >
                {generating
                  ? 'Generating...'
                  : 'Generate report'}
              </button>

              <span className="text-xs text-slate-400">
                Snapshot persists with per-section availability.
              </span>
            </div>
          </div>

          {attention.length > 0 && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold">
                Needs attention
              </h2>
              <div className="mt-3 divide-y divide-slate-100">
                {attention.map((entry) => (
                  <div
                    key={entry.website.id}
                    className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-bold">
                        {entry.website.name}
                      </span>
                      {entry.client && (
                        <span className="ml-2 text-xs text-slate-400">
                          {entry.client.name}
                        </span>
                      )}
                      {entry.missingData && (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                          NO CRAWL DATA
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {entry.highOpportunities} high ·{' '}
                      {entry.openActions} open actions ·{' '}
                      {entry.activeAlerts} alerts
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_520px]">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-bold">
                  Reports ({reports.length})
                </h2>
              </div>

              <div className="p-4">
                <DataTable<ReportListItem>
                  caption="Reports"
                  columns={reportColumns}
                  rows={reports}
                  keyOf={(report) => report.id}
                  loading={loading}
                  emptyTitle="No reports yet"
                  emptyDescription="Generate the first one above, or set up a website and connections first."
                  emptyActionLabel="Open onboarding"
                  emptyActionHref="/onboarding"
                  onRowClick={(report) =>
                    handleView(report.id)
                  }
                  renderExpanded={renderReportExpanded}
                  rowActions={(report) => [
                    {
                      label: 'View',
                      onSelect: () =>
                        handleView(report.id),
                    },
                    {
                      label: 'Delete',
                      onSelect: () => {
                        setDeleteError(null);
                        setDeleteTarget(report);
                      },
                    },
                  ]}
                />
              </div>
            </div>

            <div>
              {!selected ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  Select a report to inspect its sections,
                  share it, or print it.
                </div>
              ) : (
                <ReportDetailView
                  report={selected}
                  shareLink={shareLink}
                  onShare={() =>
                    handleShare(selected)
                  }
                  onRevoke={() =>
                    handleRevoke(selected.id)
                  }
                  onPrint={() => window.print()}
                />
              )}
            </div>
          </div>
        </section>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this report?"
        description={`"${deleteTarget?.title || ''}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Keep"
        tone="danger"
        confirming={deleting}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      />
    </AppShell>
  );
}

function ShareLinkBox({
  link,
  expiresAt,
}: {
  link: string;
  expiresAt: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(link);
      } else {
        const area = document.createElement('textarea');
        area.value = link;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Client share link (read-only)
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
        >
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <div className="mt-1 break-all text-xs font-semibold text-blue-700">
        {link}
      </div>
      {expiresAt ? (
        <div className="mt-1 text-[11px] font-semibold text-slate-500">
          Shared until{' '}
          {new Date(expiresAt).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}

function ReportDetailView({
  report,
  shareLink,
  onShare,
  onRevoke,
  onPrint,
}: {
  report: ReportDetail;
  shareLink: string;
  onShare: () => void;
  onRevoke: () => void;
  onPrint: () => void;
}) {
  const sections = Object.entries(
    report.sections ?? {},
  );
  const activeShare =
    report.shareToken && !report.shareRevoked;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {report.branding?.agencyName || 'RENKOO'} ·{' '}
        {report.type}
      </div>
      <h3 className="mt-1 text-lg font-bold">
        {report.title}
      </h3>
      <p className="mt-0.5 text-xs text-slate-400">
        Generated{' '}
        {new Date(
          report.createdAt,
        ).toLocaleString()}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPrint}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
        >
          Print / Save as PDF
        </button>
        {!activeShare ? (
          <button
            type="button"
            onClick={onShare}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Create share link (30 days)
          </button>
        ) : (
          <button
            type="button"
            onClick={onRevoke}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
          >
            Revoke share link
          </button>
        )}
      </div>

      {shareLink && (
        <ShareLinkBox
          link={shareLink}
          expiresAt={report.shareExpiresAt}
        />
      )}

      {!shareLink && activeShare && report.shareToken ? (
        <ShareLinkBox
          link={`${
            typeof window !== 'undefined'
              ? window.location.origin
              : ''
          }/share/${report.shareToken}`}
          expiresAt={report.shareExpiresAt}
        />
      ) : null}

      <div className="mt-4 space-y-3">
        {sections.map(([key, section]: [string, any]) => (
          <div
            key={key}
            className="rounded-xl border border-slate-100 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
                {key.replace(/_/g, ' ')}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  section?.status === 'AVAILABLE'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {section?.status || 'NO_DATA'}
              </span>
            </div>

            {section?.status === 'AVAILABLE' ? (
              <SectionBody sectionKey={key} section={section} />
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                {section?.reason ||
                  'No data available for this section.'}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionBody({
  sectionKey,
  section,
}: {
  sectionKey: string;
  section: any;
}) {
  if (sectionKey === 'overview') {
    return (
      <div className="mt-2 text-xs leading-5 text-slate-600">
        <p>
          <b>{section.website?.name}</b> ·{' '}
          {section.website?.url}
        </p>
        {section.businessGoal && (
          <p className="mt-1">
            Priority: {section.businessGoal}
          </p>
        )}
        {section.contextConfidence != null && (
          <p className="mt-1">
            Context confidence:{' '}
            {section.contextConfidence}%
          </p>
        )}
        {(section.missing ?? []).length > 0 && (
          <p className="mt-1 text-slate-400">
            Missing: {section.missing.slice(0, 3).join(' · ')}
          </p>
        )}
      </div>
    );
  }

  if (sectionKey === 'seo') {
    return (
      <p className="mt-2 text-xs leading-5 text-slate-600">
        Score <b>{section.score}/100</b> ·{' '}
        {section.openIssues} open issues across{' '}
        {section.pages} pages (C{' '}
        {section.bySeverity?.CRITICAL ?? 0} / H{' '}
        {section.bySeverity?.HIGH ?? 0} / M{' '}
        {section.bySeverity?.MEDIUM ?? 0} / L{' '}
        {section.bySeverity?.LOW ?? 0}).
      </p>
    );
  }

  if (sectionKey === 'technical') {
    return (
      <ul className="mt-2 space-y-1">
        {(section.groups ?? [])
          .slice(0, 5)
          .map((group: any) => (
            <li
              key={group.code}
              className="text-xs text-slate-600"
            >
              <b>{group.title}</b> — {group.count}{' '}
              pages
            </li>
          ))}
      </ul>
    );
  }

  if (sectionKey === 'opportunities') {
    return (
      <div className="mt-2 text-xs leading-5 text-slate-600">
        <p>
          {section.total} open ({section.summary?.high ?? 0}{' '}
          high).
        </p>
        <ul className="mt-1.5 space-y-1">
          {(section.top ?? [])
            .slice(0, 5)
            .map((item: any, i: number) => (
              <li key={i}>
                · <b>{item.priority}</b> {item.title} (score{' '}
                {item.score})
              </li>
            ))}
        </ul>
      </div>
    );
  }

  if (sectionKey === 'actions') {
    return (
      <div className="mt-2 text-xs leading-5 text-slate-600">
        <p>
          {section.open} open · {section.done} done.
        </p>
        <ul className="mt-1.5 space-y-1">
          {(section.recent ?? [])
            .slice(0, 5)
            .map((item: any, i: number) => (
              <li key={i}>
                · {item.title} [{item.status}]
              </li>
            ))}
        </ul>
      </div>
    );
  }

  if (sectionKey === 'monitoring') {
    return (
      <div className="mt-2 text-xs leading-5 text-slate-600">
        <p>
          {section.activeAlerts} active alerts
          {section.alertsStorageReady === false
            ? ' (store unavailable)'
            : ''}
          .
        </p>
        <ul className="mt-1.5 space-y-1">
          {(section.changes ?? [])
            .slice(0, 5)
            .map((item: any, i: number) => (
              <li key={i}>
                · <b>{item.severity}</b> {item.title}
              </li>
            ))}
        </ul>
      </div>
    );
  }

  if (sectionKey === 'ai_visibility') {
    return (
      <p className="mt-2 text-xs leading-5 text-slate-600">
        {section.counts?.completedChecks ?? 0} completed
        observations · {section.counts?.brandMentions ?? 0}{' '}
        brand mentions ·{' '}
        {section.counts?.citedDomains ?? 0} cited domains.
      </p>
    );
  }

  if (sectionKey === 'competitors') {
    return (
      <ul className="mt-2 space-y-1">
        {(section.competitors ?? []).map((item: any) => (
          <li
            key={item.id}
            className="text-xs text-slate-600"
          >
            <b>{item.name}</b> —{' '}
            {item.crawl
              ? `score ${item.crawl.score}, ${item.crawl.totalIssues} issues`
              : 'no completed crawl'}
          </li>
        ))}
      </ul>
    );
  }

  if (sectionKey === 'outcome') {
    return (
      <div className="mt-2 text-xs leading-5 text-slate-600">
        <p>
          Revenue {section.funnel?.revenue ?? '—'} ·{' '}
          {section.funnel?.conversions ?? 0} conversions ·{' '}
          {section.funnel?.conversionRate != null
            ? `${section.funnel.conversionRate}% rate`
            : 'rate unavailable'}
          .
        </p>
        <p className="mt-1">
          Attribution coverage:{' '}
          {section.attribution?.coverage != null
            ? `${section.attribution.coverage}%`
            : '—'}
          {' · '}ROI:{' '}
          {section.roi?.measurable
            ? `${section.roi.attributedRoi}%`
            : 'unavailable'}
          .
        </p>
      </div>
    );
  }

  return null;
}
