'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  getMonitoringChanges,
  listMonitoringAlerts,
  acknowledgeMonitoringAlert,
  resolveMonitoringAlert,
  detectMonitoringChanges,
  getWebsites,
  createAction,
  Website,
  MonitoringAlert,
  MonitoringChange,
  MonitoringChangesResponse,
} from '@/lib/api';

type Tab = 'changes' | 'alerts';
type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type DirectionFilter = 'ALL' | 'NEGATIVE' | 'POSITIVE' | 'NEUTRAL';

export default function MonitoringPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [changes, setChanges] =
    useState<MonitoringChangesResponse | null>(null);
  const [alerts, setAlerts] = useState<MonitoringAlert[]>([]);
  const [alertsStorageReady, setAlertsStorageReady] = useState<
    boolean | null
  >(null);
  const [alertsStorageError, setAlertsStorageError] = useState('');
  const [tab, setTab] = useState<Tab>('changes');
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>('ALL');
  const [directionFilter, setDirectionFilter] =
    useState<DirectionFilter>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectMessage, setDetectMessage] = useState('');
  const [error, setError] = useState('');
  const [expandedMap, setExpandedMap] = useState<
    Record<string, boolean>
  >({});
  const [actionLoadingMap, setActionLoadingMap] = useState<
    Record<string, boolean>
  >({});
  const [actionSuccessMap, setActionSuccessMap] = useState<
    Record<string, boolean>
  >({});
  const [actionError, setActionError] = useState('');
  const [alertPendingMap, setAlertPendingMap] = useState<
    Record<string, boolean>
  >({});
  const [resolveTarget, setResolveTarget] =
    useState<MonitoringAlert | null>(null);

  const loadChanges = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setLoading(true);
      setError('');
      const result = await getMonitoringChanges(id);
      setChanges(result);
    } catch (err: any) {
      setError(
        err?.message || 'Failed to load detected changes',
      );
      setChanges(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setAlertsLoading(true);
      const result = await listMonitoringAlerts({
        websiteId: id,
      });
      setAlerts(result.alerts);
      setAlertsStorageReady(result.storageReady ?? true);
      setAlertsStorageError(result.storageError || '');
    } catch (err: any) {
      setAlerts([]);
      setAlertsStorageReady(null);
      setAlertsStorageError(
        err?.message || 'Failed to load alerts',
      );
    } finally {
      setAlertsLoading(false);
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
          stored && list.some((site) => site.id === stored)
            ? stored
            : list[0]?.id || '';

        setWebsiteId(valid);
        if (valid) {
          await Promise.all([
            loadChanges(valid),
            loadAlerts(valid),
          ]);
        } else {
          setLoading(false);
          if (list.length === 0) {
            setError('No website found. Add a website first.');
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load monitoring');
          setLoading(false);
        }
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [loadAlerts, loadChanges]);

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    setChanges(null);
    setAlerts([]);
    if (typeof window !== 'undefined') {
      localStorage.setItem('renkoo_website_id', id);
    }
    void loadChanges(id);
    void loadAlerts(id);
  }

  async function handleDetect() {
    if (!websiteId || detecting) return;
    try {
      setDetecting(true);
      setDetectMessage('');
      const result = await detectMonitoringChanges(websiteId);
      setDetectMessage(
        `Detection complete: ${result?.alertsCreated ?? 0} created, ${result?.alertsUpdated ?? 0} updated, ${result?.alertsResolved ?? 0} resolved.`,
      );
      await Promise.all([
        loadChanges(websiteId),
        loadAlerts(websiteId),
      ]);
    } catch (err: any) {
      setDetectMessage(
        err?.message || 'Detection failed.',
      );
    } finally {
      setDetecting(false);
    }
  }

  async function handleAlertTransition(
    alert: MonitoringAlert,
    mode: 'acknowledge' | 'resolve',
  ) {
    if (alertPendingMap[alert.id]) return;
    try {
      setAlertPendingMap((prev) => ({
        ...prev,
        [alert.id]: true,
      }));
      const updated =
        mode === 'acknowledge'
          ? await acknowledgeMonitoringAlert(alert.id)
          : await resolveMonitoringAlert(alert.id);
      setAlerts((current) =>
        current.map((item) =>
          item.id === alert.id
            ? { ...item, ...updated }
            : item,
        ),
      );
    } catch (err: any) {
      setAlertsStorageError(
        err?.message || 'Unable to update alert.',
      );
    } finally {
      setAlertPendingMap((prev) => ({
        ...prev,
        [alert.id]: false,
      }));
    }
  }

  async function handleCreateAction(change: MonitoringChange) {
    if (
      actionLoadingMap[change.id] ||
      actionSuccessMap[change.id]
    ) {
      return;
    }
    try {
      setActionLoadingMap((prev) => ({
        ...prev,
        [change.id]: true,
      }));
      setActionError('');
      await createAction({
        websiteId,
        type: change.type || change.source,
        title: `Address change: ${change.title}`,
        description: `${change.description}${change.recommendation ? ` — Recommendation: ${change.recommendation}` : ''}`,
        priority:
          String(change.severity || '').toUpperCase() ===
          'CRITICAL'
            ? 'HIGH'
            : String(change.severity || 'MEDIUM'),
        metadata: {
          source: change.source,
          metric: change.metric,
          previousCrawlId: change.previousCrawlId,
          currentCrawlId: change.currentCrawlId,
          previousValue: change.previousValue,
          currentValue: change.currentValue,
          monitoringChangeId: change.id,
        },
      });
      setActionSuccessMap((prev) => ({
        ...prev,
        [change.id]: true,
      }));
    } catch (err: any) {
      setActionError(
        err?.message || 'Unable to create action.',
      );
    } finally {
      setActionLoadingMap((prev) => ({
        ...prev,
        [change.id]: false,
      }));
    }
  }

  const filteredChanges = useMemo(() => {
    const list = changes?.changes || [];
    const query = search.trim().toLowerCase();
    return list.filter((item) => {
      if (
        severityFilter !== 'ALL' &&
        String(item.severity || '').toUpperCase() !==
          severityFilter
      ) {
        return false;
      }
      if (
        directionFilter !== 'ALL' &&
        String(item.direction || '').toUpperCase() !==
          directionFilter
      ) {
        return false;
      }
      if (query) {
        const haystack =
          `${item.title} ${item.description} ${item.metric} ${item.type}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [changes, severityFilter, directionFilter, search]);

  if (loading) {
    return <LoadingState />;
  }

  if (error && !changes) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-6 py-8 text-[#111827] md:px-10">
        <div className="mx-auto max-w-[1400px]">
          <PageHeader
            title="What Changed?"
            description="Continuous change detection across your website."
          />
          <div className="mt-8 border border-red-200 bg-white p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-red-500">
              Connection error
            </div>
            <div className="mt-2 text-sm text-red-700">
              {error}
            </div>
            {websiteId && (
              <button
                type="button"
                onClick={() => loadChanges(websiteId)}
                className="mt-4 border border-red-300 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  const summary = changes?.summary;
  const negativeCount = filteredChanges.filter(
    (item) => item.direction === 'NEGATIVE',
  ).length;
  const positiveCount = filteredChanges.filter(
    (item) => item.direction === 'POSITIVE',
  ).length;
  const criticalCount =
    (summary?.critical || 0) + (summary?.high || 0);

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-5 py-6 text-[#111827] md:px-8 lg:px-10">
      <div className="mx-auto max-w-[1440px]">
        <PageHeader
          title="What Changed?"
          description="Measured crawl-over-crawl movement with honest significance — never inferred percentages, never invented causes."
          count={changes?.changes.length || 0}
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
            Website
          </label>
          <select
            value={websiteId}
            onChange={(e) => handleWebsiteChange(e.target.value)}
            className="max-w-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm outline-none"
          >
            {websites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleDetect()}
            disabled={detecting || !websiteId}
            className="bg-[#111827] px-4 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-60 sm:ml-auto"
          >
            {detecting ? 'Detecting...' : 'Run detection'}
          </button>
        </div>

        {detectMessage && (
          <div className="mt-4 border border-[#e5e7eb] bg-white px-4 py-3 text-xs text-[#374151]">
            {detectMessage}
          </div>
        )}

        <section className="mt-6 grid grid-cols-2 gap-px overflow-hidden border border-[#e5e7eb] bg-[#e5e7eb] md:grid-cols-4">
          <SummaryCard
            label="Important changes"
            value={criticalCount}
            description="Critical and high severity movement"
            emphasis={criticalCount > 0}
          />
          <SummaryCard
            label="Negative movement"
            value={negativeCount}
            description="Regressions in the current filter"
          />
          <SummaryCard
            label="Positive movement"
            value={positiveCount}
            description="Measured improvements"
          />
          <SummaryCard
            label="Latest score"
            value={changes?.latestScore ?? '—'}
            description={`${changes?.completedCrawls || 0} completed crawls in baseline`}
          />
        </section>

        <section className="mt-8 border border-[#e5e7eb] bg-white">
          <div className="flex flex-col gap-5 border-b border-[#e5e7eb] px-5 py-5 md:flex-row md:items-center md:justify-between">
            <nav className="flex gap-2">
              <TabButton
                active={tab === 'changes'}
                label={`Changes (${filteredChanges.length})`}
                onClick={() => setTab('changes')}
              />
              <TabButton
                active={tab === 'alerts'}
                label={`Alerts (${alerts.length})`}
                onClick={() => setTab('alerts')}
              />
            </nav>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search changes, metrics, codes..."
              className="w-full max-w-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm outline-none"
            />
          </div>

          {tab === 'changes' && (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-[#e5e7eb] px-5 py-4">
                <FilterSelect
                  label="Severity"
                  value={severityFilter}
                  options={[
                    'ALL',
                    'CRITICAL',
                    'HIGH',
                    'MEDIUM',
                    'LOW',
                  ]}
                  onChange={(value) =>
                    setSeverityFilter(
                      value as SeverityFilter,
                    )
                  }
                />
                <FilterSelect
                  label="Direction"
                  value={directionFilter}
                  options={[
                    'ALL',
                    'NEGATIVE',
                    'POSITIVE',
                    'NEUTRAL',
                  ]}
                  onChange={(value) =>
                    setDirectionFilter(
                      value as DirectionFilter,
                    )
                  }
                />
              </div>

              {actionError && (
                <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700">
                  {actionError}
                </div>
              )}

              {changes?.notEnoughData ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center border border-[#e5e7eb] bg-[#fafafa] text-sm font-semibold text-[#6b7280]">
                    —
                  </div>
                  <h2 className="mt-4 text-sm font-semibold">
                    Not enough historical data
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7280]">
                    {changes.notEnoughDataReason}
                  </p>
                </div>
              ) : filteredChanges.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <h2 className="text-sm font-semibold">
                    No meaningful changes
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7280]">
                    {(changes?.suppressedNoise || 0) > 0
                      ? `${changes?.suppressedNoise} tiny movement${changes?.suppressedNoise === 1 ? ' was' : 's were'} suppressed as noise. Run another crawl to compare again.`
                      : 'Crawls agree with each other. Run another crawl to compare again.'}
                  </p>
                </div>
              ) : (
                <div>
                  {filteredChanges.map((change, index) => (
                    <ChangeCard
                      key={change.id}
                      change={change}
                      index={index}
                      expanded={Boolean(
                        expandedMap[change.id],
                      )}
                      actionLoading={Boolean(
                        actionLoadingMap[change.id],
                      )}
                      actionSuccess={Boolean(
                        actionSuccessMap[change.id],
                      )}
                      onToggle={() =>
                        setExpandedMap((prev) => ({
                          ...prev,
                          [change.id]: !prev[change.id],
                        }))
                      }
                      onCreateAction={() =>
                        handleCreateAction(change)
                      }
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'alerts' && (
            <div>
              {alertsStorageReady === false ? (
                <div className="px-6 py-16 text-center">
                  <h2 className="text-sm font-semibold">
                    Alert store unavailable
                  </h2>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#6b7280]">
                    {alertsStorageError ||
                      'The alert store is not ready.'}{' '}
                    Change detection above keeps working because it
                    reads crawl history directly.
                  </p>
                </div>
              ) : alertsLoading ? (
                <div className="px-6 py-16 text-center text-sm text-[#6b7280]">
                  Loading alerts...
                </div>
              ) : alertsStorageError && alerts.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <h2 className="text-sm font-semibold">
                    Alerts unavailable
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7280]">
                    {alertsStorageError}
                  </p>
                  <button
                    type="button"
                    onClick={() => loadAlerts(websiteId)}
                    className="mt-4 border border-[#e5e7eb] px-4 py-2 text-xs font-semibold hover:border-[#9ca3af]"
                  >
                    Retry
                  </button>
                </div>
              ) : alerts.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <h2 className="text-sm font-semibold">
                    No alerts
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7280]">
                    No technical SEO alerts are active. Run
                    detection after a crawl to evaluate the latest
                    issues.
                  </p>
                </div>
              ) : (
                <div>
                  {alerts.map((alert) => (
                    <AlertCard
                      key={alert.id}
                      alert={alert}
                      pending={Boolean(
                        alertPendingMap[alert.id],
                      )}
                      onTransition={handleAlertTransition}
                      onRequestResolve={(target) =>
                        setResolveTarget(target)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mt-6 border border-[#1f2937] bg-[#111827] text-white">
          <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d1d5db]">
                  RENKOO Monitoring
                </span>
              </div>
              <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-[-0.03em]">
                Know what changed, and why it matters.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9ca3af]">
                Deterministic crawl comparison with correlation-only
                explanations. GSC, GA4, keyword, backlink, AI, lead,
                and revenue movement appear here only once real
                historical sources are connected.
              </p>
            </div>
            <div className="flex items-end">
              <div className="border border-[#374151] px-4 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#9ca3af]">
                  Noise suppressed
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {changes?.suppressedNoise || 0}
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={resolveTarget !== null}
        title="Resolve this alert?"
        description={
          resolveTarget
            ? `Resolve “${resolveTarget.title}”? It stays recorded as resolved and drops out of the active queue.`
            : 'Resolve this alert? It stays recorded as resolved.'
        }
        confirmLabel="Resolve alert"
        confirming={
          resolveTarget
            ? Boolean(alertPendingMap[resolveTarget.id])
            : false
        }
        onConfirm={() => {
          if (resolveTarget) {
            const target = resolveTarget;
            setResolveTarget(null);
            void handleAlertTransition(target, 'resolve');
          }
        }}
        onCancel={() => setResolveTarget(null)}
      />
    </main>
  );
}

function PageHeader({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-[#e5e7eb] pb-7 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7280]">
          Monitoring
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#111827] md:text-[36px]">
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#6b7280]">
          {description}
        </p>
      </div>
      {typeof count === 'number' && (
        <div className="border border-[#e5e7eb] bg-white px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9ca3af]">
            Detected changes
          </div>
          <div className="mt-1 text-xl font-semibold">{count}</div>
        </div>
      )}
    </header>
  );
}

function SummaryCard({
  label,
  value,
  description,
  emphasis,
}: {
  label: string;
  value: number | string;
  description: string;
  emphasis?: boolean;
}) {
  return (
    <div className="bg-white p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7280]">
          {label}
        </div>
        {emphasis && (
          <span className="h-2 w-2 rounded-full bg-[#111827]" />
        )}
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-[-0.04em]">
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-[#9ca3af]">
        {description}
      </div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-3.5 py-2 text-xs font-semibold transition ${
        active
          ? 'border-[#111827] bg-[#111827] text-white'
          : 'border-[#e5e7eb] bg-white text-[#4b5563] hover:border-[#9ca3af]'
      }`}
    >
      {label}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-[#6b7280]">
      <span className="font-semibold uppercase tracking-[0.12em]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111827] outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChangeCard({
  change,
  index,
  expanded,
  actionLoading,
  actionSuccess,
  onToggle,
  onCreateAction,
}: {
  change: MonitoringChange;
  index: number;
  expanded: boolean;
  actionLoading: boolean;
  actionSuccess: boolean;
  onToggle: () => void;
  onCreateAction: () => void;
}) {
  const severity = String(change.severity || '').toUpperCase();
  const direction = String(change.direction || '').toUpperCase();

  return (
    <article className="border-b border-[#e5e7eb] px-5 py-5 last:border-b-0 md:px-6">
      <div className="flex gap-4">
        <div className="hidden pt-1 text-xs font-medium tabular-nums text-[#c4c8ce] md:block">
          {String(index + 1).padStart(2, '0')}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={severity} />
            <DirectionBadge direction={direction} />
            <span className="border border-[#e5e7eb] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#6b7280]">
              {formatLabel(change.metric)}
            </span>
            <span className="text-[11px] text-[#9ca3af]">
              {formatDateTime(change.detectedAt)}
            </span>
          </div>

          <h2 className="text-[17px] font-semibold leading-6 tracking-[-0.015em]">
            {change.title}
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6b7280]">
            {change.description}
          </p>

          <MovementLine change={change} />

          {(change.why || []).length > 0 && (
            <div className="mt-4 border-l-2 border-[#111827] bg-[#fafafa] px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
                Why — observed correlation only
              </div>
              <ul className="mt-1.5 space-y-1.5">
                {(change.why || []).map((reason, i) => (
                  <li
                    key={i}
                    className="text-sm leading-6 text-[#374151]"
                  >
                    {reason}
                  </li>
                ))}
              </ul>
              {change.businessNote && (
                <p className="mt-2 text-xs leading-5 text-[#6b7280]">
                  {change.businessNote}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:border-[#9ca3af]"
            >
              {expanded ? 'Hide evidence' : 'View evidence'}
            </button>
            <button
              type="button"
              onClick={onCreateAction}
              disabled={actionLoading || actionSuccess}
              className={`px-3 py-1.5 text-xs font-semibold transition ${
                actionSuccess
                  ? 'cursor-default bg-green-700 text-white'
                  : 'bg-[#111827] text-white hover:bg-black disabled:opacity-60'
              }`}
            >
              {actionLoading
                ? 'Creating...'
                : actionSuccess
                  ? 'Action created'
                  : 'Create action'}
            </button>
            {actionSuccess && (
              <Link
                href="/actions"
                className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#9ca3af]"
              >
                Open in Actions
              </Link>
            )}
          </div>

          {expanded && <ChangeEvidence change={change} />}
        </div>
      </div>
    </article>
  );
}

function MovementLine({ change }: { change: MonitoringChange }) {
  const movement = formatMovement(change);
  if (!movement) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="tabular-nums font-semibold">
        {movement.before}
      </span>
      <span className="text-[#9ca3af]">→</span>
      <span className="tabular-nums font-semibold">
        {movement.after}
      </span>
      <span
        className={`px-2 py-0.5 text-xs font-bold ${
          change.direction === 'POSITIVE'
            ? 'bg-green-100 text-green-800'
            : change.direction === 'NEGATIVE'
              ? 'bg-red-100 text-red-800'
              : 'bg-slate-100 text-slate-600'
        }`}
      >
        {movement.delta}
      </span>
    </div>
  );
}

function formatMovement(change: MonitoringChange) {
  const prev = change.previousValue;
  const curr = change.currentValue;
  if (prev === null || curr === null) return null;

  const isPoints = change.pointChange !== null;
  const fmt = (value: number) =>
    isPoints ? `${value} pts` : `${value}`;

  let delta = '';
  if (change.pointChange !== null) {
    const signed =
      change.pointChange > 0
        ? `+${change.pointChange}`
        : `${change.pointChange}`;
    delta = `${signed} pts`;
  } else if (change.absoluteChange !== null) {
    const signed =
      change.absoluteChange > 0
        ? `+${change.absoluteChange}`
        : `${change.absoluteChange}`;
    delta = `${signed}`;
  } else {
    return null;
  }

  return { before: fmt(prev), after: fmt(curr), delta };
}

function ChangeEvidence({
  change,
}: {
  change: MonitoringChange;
}) {
  const evidence = change.evidence || {};
  const entries = Object.entries(evidence)
    .filter(([key]) => key !== 'affectedUrls')
    .slice(0, 10);
  const urls = Array.isArray(evidence.affectedUrls)
    ? (evidence.affectedUrls as string[]).slice(0, 10)
    : [];

  return (
    <div className="mt-4 border border-[#e5e7eb] bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
        Evidence
      </div>
      <dl className="mt-2 grid gap-2 text-xs text-[#4b5563] sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-[#9ca3af]">
            Compared crawls
          </dt>
          <dd className="mt-0.5 break-all">
            {change.previousCrawlId} → {change.currentCrawlId}
          </dd>
        </div>
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="font-semibold text-[#9ca3af]">
              {formatLabel(key)}
            </dt>
            <dd className="mt-0.5 break-words text-[#111827]">
              {formatMetadataValue(value)}
            </dd>
          </div>
        ))}
      </dl>
      {urls.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
            Affected URLs
          </div>
          <ul className="mt-1 space-y-1">
            {urls.map((url) => (
              <li
                key={url}
                className="break-all text-xs text-[#111827]"
              >
                {url}
              </li>
            ))}
          </ul>
        </div>
      )}
      {change.recommendation && (
        <p className="mt-3 text-xs leading-5 text-[#374151]">
          <span className="font-bold">Next step: </span>
          {change.recommendation}{' '}
          <Link
            href="/opportunities"
            className="font-semibold text-[#111827] underline hover:text-black"
          >
            Review in Opportunities
          </Link>
        </p>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  pending,
  onTransition,
  onRequestResolve,
}: {
  alert: MonitoringAlert;
  pending: boolean;
  onTransition: (
    alert: MonitoringAlert,
    mode: 'acknowledge' | 'resolve',
  ) => void;
  onRequestResolve: (alert: MonitoringAlert) => void;
}) {
  const severity = String(alert.severity || '').toUpperCase();
  const status = String(alert.status || '').toUpperCase();
  const evidence = alert.evidence || {};
  const affectedPages =
    typeof evidence.affectedPages === 'number'
      ? evidence.affectedPages
      : null;

  return (
    <article className="border-b border-[#e5e7eb] px-5 py-5 last:border-b-0 md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={severity} />
        <span className="border border-[#e5e7eb] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4b5563]">
          {formatLabel(alert.source)}
        </span>
        <span className="border border-[#e5e7eb] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#6b7280]">
          {formatLabel(status)}
        </span>
        <span className="text-[11px] text-[#9ca3af]">
          {formatDateTime(alert.detectedAt)}
        </span>
      </div>

      <h2 className="mt-2 text-[16px] font-semibold leading-6">
        {alert.title}
      </h2>
      <p className="mt-1 max-w-4xl text-sm leading-6 text-[#6b7280]">
        {alert.description}
      </p>

      {affectedPages !== null && (
        <p className="mt-2 text-xs text-[#6b7280]">
          {affectedPages} page{affectedPages === 1 ? '' : 's'}{' '}
          affected
          {typeof evidence.totalPages === 'number' &&
            ` of ${evidence.totalPages} crawled`}
          {typeof evidence.affectedPercentage === 'number' &&
            ` (${evidence.affectedPercentage}%)`}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {status === 'DETECTED' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onTransition(alert, 'acknowledge')}
            className="border border-[#111827] bg-[#111827] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#374151] disabled:opacity-60"
          >
            {pending ? 'Saving...' : 'Acknowledge'}
          </button>
        )}
        {status !== 'RESOLVED' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onRequestResolve(alert)}
            className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:border-[#9ca3af] disabled:opacity-60"
          >
            {pending ? 'Saving...' : 'Resolve'}
          </button>
        )}
        {status === 'RESOLVED' && (
          <span className="border border-[#dfe2e6] bg-[#fafafa] px-3 py-1.5 text-xs font-semibold text-[#374151]">
            ✓ Resolved
            {alert.resolvedAt
              ? ` — ${formatDateTime(alert.resolvedAt)}`
              : ''}
          </span>
        )}
      </div>
    </article>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles =
    severity === 'CRITICAL'
      ? 'bg-[#7f1d1d] text-white'
      : severity === 'HIGH'
        ? 'bg-[#111827] text-white'
        : severity === 'MEDIUM'
          ? 'border border-[#d1d5db] bg-[#f3f4f6] text-[#374151]'
          : 'border border-[#e5e7eb] bg-white text-[#6b7280]';
  return (
    <span
      className={`px-2.5 py-1 text-[11px] font-semibold ${styles}`}
    >
      {formatLabel(severity)}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const styles =
    direction === 'POSITIVE'
      ? 'bg-green-100 text-green-800'
      : direction === 'NEGATIVE'
        ? 'bg-red-100 text-red-800'
        : 'bg-slate-100 text-slate-600';
  const symbol =
    direction === 'POSITIVE'
      ? '↑'
      : direction === 'NEGATIVE'
        ? '↓'
        : '→';
  return (
    <span
      className={`px-2.5 py-1 text-[11px] font-semibold ${styles}`}
    >
      {symbol} {formatLabel(direction)}
    </span>
  );
}

function LoadingState() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] px-5 py-8 md:px-10">
      <div className="mx-auto max-w-[1440px] animate-pulse">
        <div className="h-3 w-28 bg-[#e5e7eb]" />
        <div className="mt-4 h-10 w-72 bg-[#e5e7eb]" />
        <div className="mt-3 h-4 w-96 max-w-full bg-[#e5e7eb]" />
        <div className="mt-8 grid grid-cols-2 gap-px bg-[#e5e7eb] md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-36 bg-white" />
          ))}
        </div>
        <div className="mt-8 h-24 bg-white" />
        <div className="mt-1 space-y-px bg-[#e5e7eb]">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-44 bg-white" />
          ))}
        </div>
      </div>
    </main>
  );
}

function formatLabel(value: unknown) {
  return String(value || '—')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: unknown) {
  if (!value) return '—';
  try {
    return new Date(String(value)).toLocaleString();
  } catch {
    return String(value);
  }
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.length > 180 ? `${value.slice(0, 180)}…` : value;
  }
  try {
    const text = JSON.stringify(value);
    return text.length > 180 ? `${text.slice(0, 180)}…` : text;
  } catch {
    return '—';
  }
}
