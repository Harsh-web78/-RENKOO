'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  getActions,
  getActionMeasurement,
  getActionVerification,
  verifyActionLive,
  getWebsites,
  updateActionStatus,
  Website,
  RenkooAction,
} from '@/lib/api';

type StatusFilter =
  | 'ALL'
  | 'TODO'
  | 'IN_PROGRESS'
  | 'DONE'
  | 'DISMISSED';

type PriorityFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
type SortMode = 'RECENT' | 'PRIORITY' | 'STATUS';

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All actions' },
  { value: 'TODO', label: 'To Do' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DONE', label: 'Done' },
  { value: 'DISMISSED', label: 'Dismissed' },
];

const STATUS_ORDER: Record<string, number> = {
  TODO: 0,
  IN_PROGRESS: 1,
  DONE: 2,
  DISMISSED: 3,
};

const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export default function ActionsPage() {
  const [actions, setActions] = useState<RenkooAction[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteFilter, setWebsiteFilter] = useState<string>('ALL');
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string>('');
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>('ALL');
  const [priorityFilter, setPriorityFilter] =
    useState<PriorityFilter>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('RECENT');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [error, setError] = useState('');
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(
    {},
  );
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>(
    {},
  );
  const [dismissTarget, setDismissTarget] =
    useState<RenkooAction | null>(null);

  async function loadActions() {
    try {
      setLoading(true);
      setError('');

      const [data, sites] = await Promise.all([
        getActions(),
        getWebsites().catch(() => [] as Website[]),
      ]);

      setActions(Array.isArray(data?.actions) ? data.actions : []);
      setWebsites(Array.isArray(sites) ? sites : []);
    } catch (err: any) {
      console.error('[RENKOO] ACTIONS ERROR', err);
      setError(err?.message || 'Failed to load actions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const selectedId = window.localStorage.getItem(
      'renkoo_website_id',
    );

    if (selectedId) {
      setSelectedWebsiteId(selectedId);
      setWebsiteFilter(selectedId);
    }

    loadActions();
  }, []);

  const websiteNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const site of websites) {
      map[site.id] = site.name;
    }
    return map;
  }, [websites]);

  async function changeStatus(
    actionId: string,
    status: RenkooAction['status'],
  ) {
    if (pendingMap[actionId]) return;
    try {
      setPendingMap((prev) => ({ ...prev, [actionId]: true }));
      setError('');
      const updated = await updateActionStatus(actionId, status);

      setActions((current) =>
        current.map((action) =>
          action.id === actionId
            ? { ...action, ...updated }
            : action,
        ),
      );
    } catch (err: any) {
      console.error('[RENKOO] STATUS UPDATE ERROR', err);
      setError(err?.message || 'Failed to update action');
    } finally {
      setPendingMap((prev) => ({ ...prev, [actionId]: false }));
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result = actions.filter((action) => {
      if (
        websiteFilter !== 'ALL' &&
        (action.websiteId || '') !== websiteFilter
      ) {
        return false;
      }
      if (
        statusFilter !== 'ALL' &&
        String(action.status || '').toUpperCase() !== statusFilter
      ) {
        return false;
      }
      if (
        priorityFilter !== 'ALL' &&
        String(action.priority || '').toUpperCase() !== priorityFilter
      ) {
        return false;
      }
      if (query) {
        const haystack =
          `${action.title} ${action.description || ''} ${action.type} ${action.status} ${action.url || ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    return [...result].sort((a, b) => {
      if (sortMode === 'PRIORITY') {
        const diff =
          (PRIORITY_ORDER[String(b.priority || '').toUpperCase()] ||
            0) -
          (PRIORITY_ORDER[String(a.priority || '').toUpperCase()] ||
            0);
        if (diff !== 0) return diff;
      }
      if (sortMode === 'STATUS') {
        const diff =
          (STATUS_ORDER[String(a.status || '').toUpperCase()] ??
            9) -
          (STATUS_ORDER[String(b.status || '').toUpperCase()] ??
            9);
        if (diff !== 0) return diff;
      }
      return String(b.updatedAt || b.createdAt || '').localeCompare(
        String(a.updatedAt || a.createdAt || ''),
      );
    });
  }, [
    actions,
    websiteFilter,
    statusFilter,
    priorityFilter,
    sortMode,
    search,
  ]);

  const grouped = useMemo(() => {
    const groups: Record<string, RenkooAction[]> = {
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
      DISMISSED: [],
    };
    for (const action of filtered) {
      const key = String(action.status || '').toUpperCase();
      if (groups[key]) groups[key].push(action);
      else groups.TODO.push(action);
    }
    return (['TODO', 'IN_PROGRESS', 'DONE', 'DISMISSED'] as const)
      .filter((key) => groups[key].length > 0)
      .map((key) => ({ status: key, items: groups[key] }));
  }, [filtered]);

  /*
   * One memoized pass instead of four full-array
   * filters on every render.
   */
  const { todo, inProgress, done, high } = useMemo(() => {
    let todoCount = 0;
    let inProgressCount = 0;
    let doneCount = 0;
    let highCount = 0;

    for (const action of actions) {
      if (action.status === 'TODO') todoCount += 1;
      else if (action.status === 'IN_PROGRESS')
        inProgressCount += 1;
      else if (action.status === 'DONE') doneCount += 1;

      if (
        String(action.priority || '').toUpperCase() ===
          'HIGH' &&
        (action.status === 'TODO' ||
          action.status === 'IN_PROGRESS')
      ) {
        highCount += 1;
      }
    }

    return {
      todo: todoCount,
      inProgress: inProgressCount,
      done: doneCount,
      high: highCount,
    };
  }, [actions]);

  if (loading) {
    return <LoadingState />;
  }

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <div className="mx-auto max-w-[1440px]">
        <header className="flex flex-col gap-5 border-b border-[#e5e7eb] pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7280]">
              Execution workspace
            </div>

            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] md:text-[36px]">
              Action Engine
            </h1>

            <p className="mt-2 max-w-xl text-sm leading-6 text-[#6b7280]">
              Every action traces back to a measured opportunity and
              its recommendation. Status changes persist immediately.
            </p>
          </div>

          <div className="border border-[#e5e7eb] bg-white px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9ca3af]">
              Active actions
            </div>
            <div className="mt-1 text-xl font-semibold">
              {todo + inProgress}
            </div>
          </div>
        </header>

        {error && (
          <div className="mt-6 border border-red-200 bg-white px-5 py-4 text-sm text-red-600">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-400">
                  Action error
                </div>
                <div className="mt-1">{error}</div>
              </div>
              <button
                type="button"
                onClick={() => setError('')}
                className="text-xs font-bold underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <section className="mt-8 grid grid-cols-2 gap-px overflow-hidden border border-[#e5e7eb] bg-[#e5e7eb] md:grid-cols-4">
          <Stat
            label="High priority open"
            value={high}
            description="Needs attention first"
          />

          <Stat
            label="To Do"
            value={todo}
            description="Ready to start"
          />

          <Stat
            label="In Progress"
            value={inProgress}
            description="Currently being worked"
          />

          <Stat
            label="Done"
            value={done}
            description="Completed with timestamp"
          />
        </section>

        <section className="mt-8 border border-[#e5e7eb] bg-white">
          <div className="flex flex-col gap-5 border-b border-[#e5e7eb] px-5 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7280]">
                Execution queue
              </div>

              <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em]">
                Growth actions
              </h2>
            </div>

            <div className="text-sm text-[#6b7280]">
              Showing{' '}
              <span className="font-semibold text-[#111827]">
                {filtered.length}
              </span>{' '}
              of {actions.length}
            </div>
          </div>

          <div className="space-y-4 border-b border-[#e5e7eb] px-5 py-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search actions, pages, types..."
              className="w-full max-w-md border border-[#e5e7eb] bg-white px-3 py-2 text-sm outline-none"
            />

            <div className="flex gap-2 overflow-x-auto pb-1">
              {STATUS_FILTERS.map((item) => (
                <button
                  key={item.value}
                  onClick={() => setStatusFilter(item.value)}
                  className={`whitespace-nowrap border px-3.5 py-2 text-xs font-semibold transition ${
                    statusFilter === item.value
                      ? 'border-[#111827] bg-[#111827] text-white'
                      : 'border-[#e5e7eb] bg-white text-[#4b5563] hover:border-[#9ca3af] hover:text-[#111827]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Website"
                value={websiteFilter}
                options={[
                  'ALL',
                  ...websites.map((site) => site.id),
                ]}
                labels={websiteNameMap}
                onChange={setWebsiteFilter}
              />
              <FilterSelect
                label="Priority"
                value={priorityFilter}
                options={['ALL', 'HIGH', 'MEDIUM', 'LOW']}
                onChange={(value) =>
                  setPriorityFilter(
                    value as PriorityFilter,
                  )
                }
              />
              <FilterSelect
                label="Sort"
                value={sortMode}
                options={['RECENT', 'PRIORITY', 'STATUS']}
                onChange={(value) =>
                  setSortMode(value as SortMode)
                }
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {grouped.map((group) => (
                <div key={group.status}>
                  <div className="border-b border-[#e5e7eb] bg-[#fafafa] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7280] md:px-6">
                    {formatLabel(group.status)} —{' '}
                    {group.items.length}
                  </div>
                  {group.items.map((action, index) => (
                    <ActionCard
                      key={action.id}
                      action={action}
                      index={index}
                      websiteName={
                        (action.websiteId &&
                          websiteNameMap[action.websiteId]) ||
                        null
                      }
                      expanded={Boolean(expandedMap[action.id])}
                      pending={Boolean(pendingMap[action.id])}
                      onToggleDetail={() =>
                        setExpandedMap((prev) => ({
                          ...prev,
                          [action.id]: !prev[action.id],
                        }))
                      }
                      onStatusChange={changeStatus}
                      onRequestDismiss={(target) =>
                        setDismissTarget(target)
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 border border-[#1f2937] bg-[#111827] text-white">
          <div className="grid gap-8 p-6 md:grid-cols-[1fr_auto] md:p-8">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-white" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d1d5db]">
                  RENKOO Execution
                </span>
              </div>

              <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-[-0.03em]">
                Move from recommendation to measurable action.
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#9ca3af]">
                RENKOO tracks the work. External changes to your
                website happen only through your own execution or a
                connected integration — never pretended here.
              </p>
            </div>

            <div className="flex items-end">
              <div className="border border-[#374151] px-4 py-3 text-right">
                <div className="text-[11px] uppercase tracking-[0.14em] text-[#9ca3af]">
                  Completion
                </div>

                <div className="mt-1 text-2xl font-semibold">
                  {actions.length
                    ? Math.round((done / actions.length) * 100)
                    : 0}
                  %
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={dismissTarget !== null}
        title="Dismiss this action?"
        description={
          dismissTarget
            ? `Dismiss “${dismissTarget.title}”? It stays recorded as dismissed and can be reopened later.`
            : 'Dismiss this action? It stays recorded as dismissed.'
        }
        confirmLabel="Dismiss action"
        confirming={
          dismissTarget
            ? Boolean(pendingMap[dismissTarget.id])
            : false
        }
        onConfirm={() => {
          if (dismissTarget) {
            void changeStatus(
              dismissTarget.id,
              'DISMISSED',
            ).then(() => setDismissTarget(null));
          }
        }}
        onCancel={() => setDismissTarget(null)}
      />
    </AppShell>
  );
}

function FilterSelect({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
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
        className="max-w-[220px] border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#111827] outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option === 'ALL'
              ? 'All'
              : (labels?.[option] ?? formatLabel(option))}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionCard({
  action,
  index,
  websiteName,
  expanded,
  pending,
  onToggleDetail,
  onStatusChange,
  onRequestDismiss,
}: {
  action: RenkooAction;
  index: number;
  websiteName: string | null;
  expanded: boolean;
  pending: boolean;
  onToggleDetail: () => void;
  onStatusChange: (
    id: string,
    status: RenkooAction['status'],
  ) => Promise<void>;
  onRequestDismiss: (action: RenkooAction) => void;
}) {
  const status = String(action.status || '').toUpperCase();
  const metadata =
    action.metadata && typeof action.metadata === 'object'
      ? (action.metadata as Record<string, any>)
      : null;

  return (
    <article className="group border-b border-[#e5e7eb] px-5 py-6 last:border-b-0 md:px-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_250px]">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="border border-[#dfe2e6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4b5563]">
              {formatLabel(action.priority)} priority
            </span>

            <span className="border border-[#dfe2e6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4b5563]">
              {formatLabel(action.type)}
            </span>

            <StatusBadge status={status} />

            {websiteName && (
              <span className="border border-[#dfe2e6] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#6b7280]">
                {websiteName}
              </span>
            )}

            {action.completedAt && (
              <span className="border border-[#dfe2e6] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#6b7280]">
                Completed {formatDateTime(action.completedAt)}
              </span>
            )}
          </div>

          <div className="flex gap-4">
            <div className="hidden pt-1 text-xs font-medium tabular-nums text-[#c4c8ce] md:block">
              {String(index + 1).padStart(2, '0')}
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold leading-6 tracking-[-0.015em] text-[#111827]">
                {action.title}
              </h2>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6b7280]">
                {action.description}
              </p>

              <Traceability action={action} />

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onToggleDetail}
                  className="border border-[#e5e7eb] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:border-[#9ca3af]"
                >
                  {expanded ? 'Hide detail' : 'View detail'}
                </button>
              </div>

              {expanded && (
                <ActionDetail
                  action={action}
                  websiteName={websiteName}
                  metadata={metadata}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 border-t border-[#f0f1f3] pt-5 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
          <div className="flex items-center justify-between lg:block">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
                Current stage
              </div>

              <div className="mt-1.5 text-sm font-semibold text-[#111827]">
                {status === 'TODO'
                  ? 'Ready to start'
                  : status === 'IN_PROGRESS'
                    ? 'In progress'
                    : status === 'DONE'
                      ? 'Completed'
                      : 'Dismissed'}
              </div>
            </div>

            <div className="text-right lg:mt-4 lg:text-left">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
                Priority
              </div>

              <div className="mt-1.5 text-sm font-semibold text-[#111827]">
                {formatLabel(action.priority)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:flex-col">
            {status === 'TODO' && (
              <>
                <ActionButton
                  primary
                  pending={pending}
                  onClick={() =>
                    onStatusChange(action.id, 'IN_PROGRESS')
                  }
                  label="Start action"
                />

                <ActionButton
                  pending={pending}
                  onClick={() => onRequestDismiss(action)}
                  label="Dismiss"
                />
              </>
            )}

            {status === 'IN_PROGRESS' && (
              <>
                <ActionButton
                  primary
                  pending={pending}
                  onClick={() => onStatusChange(action.id, 'DONE')}
                  label="Mark complete"
                />

                <ActionButton
                  pending={pending}
                  onClick={() =>
                    onStatusChange(action.id, 'TODO')
                  }
                  label="Move back to To Do"
                />

                <ActionButton
                  pending={pending}
                  onClick={() => onRequestDismiss(action)}
                  label="Dismiss"
                />
              </>
            )}

            {status === 'DONE' && (
              <>
                <div className="border border-[#dfe2e6] bg-[#fafafa] px-4 py-2.5 text-xs font-semibold text-[#374151]">
                  ✓ Completed
                  {action.completedAt
                    ? ` — ${formatDateTime(action.completedAt)}`
                    : ''}
                </div>

                <ActionButton
                  pending={pending}
                  onClick={() =>
                    onStatusChange(action.id, 'IN_PROGRESS')
                  }
                  label="Reopen"
                />

                <Link
                  href="/monitoring"
                  className="border border-[#e5e7eb] bg-white px-4 py-2.5 text-center text-xs font-semibold text-[#4b5563] hover:border-[#9ca3af] hover:text-[#111827]"
                >
                  Verify in Monitoring
                </Link>

                <Link
                  href="/roi"
                  className="border border-[#e5e7eb] bg-white px-4 py-2.5 text-center text-xs font-semibold text-[#4b5563] hover:border-[#9ca3af] hover:text-[#111827]"
                >
                  Measure in ROI
                </Link>
              </>
            )}

            {status === 'DISMISSED' && (
              <>
                <div className="border border-[#e5e7eb] bg-[#fafafa] px-4 py-2.5 text-xs font-semibold text-[#6b7280]">
                  Dismissed
                </div>

                <ActionButton
                  pending={pending}
                  onClick={() =>
                    onStatusChange(action.id, 'TODO')
                  }
                  label="Reopen"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function ActionButton({
  label,
  onClick,
  primary,
  pending,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
  pending: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className={`px-4 py-2.5 text-xs font-semibold transition disabled:opacity-60 ${
        primary
          ? 'border border-[#111827] bg-[#111827] text-white hover:bg-[#374151]'
          : 'border border-[#e5e7eb] bg-white text-[#4b5563] hover:border-[#9ca3af] hover:text-[#111827]'
      }`}
    >
      {pending ? 'Saving...' : label}
    </button>
  );
}

function Traceability({ action }: { action: RenkooAction }) {
  const recommendation = action.recommendation as any;
  const metadata =
    action.metadata && typeof action.metadata === 'object'
      ? (action.metadata as Record<string, any>)
      : null;
  const source =
    metadata?.source ||
    recommendation?.source ||
    action.type;

  const steps = [
    {
      label: 'Problem found',
      value: recommendation?.title || action.type,
    },
    {
      label: 'Why this',
      value:
        recommendation?.description ||
        recommendation?.actionText ||
        null,
    },
    {
      label: 'Do this',
      value: action.title,
    },
    {
      label: 'Owner',
      value: null,
    },
  ];

  return (
    <div className="mt-6 border border-[#e5e7eb] bg-[#fafafa] px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
          Traceability
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
          Source:{' '}
          {sourceHref(source) ? (
            <Link
              href={sourceHref(source) as string}
              className="text-[#111827] underline hover:text-black"
            >
              {formatLabel(source)}
            </Link>
          ) : (
            formatLabel(source)
          )}
        </span>
      </div>

      <ol className="space-y-2.5">
        {steps.map((step) => (
          <li
            key={step.label}
            className="flex flex-col gap-1 sm:flex-row sm:gap-3"
          >
            <span className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
              {step.label}
            </span>
            <span className="min-w-0 flex-1 text-xs leading-5 text-[#374151]">
              {step.label === 'Owner' ? (
                <span className="text-[#9ca3af]">
                  Unassigned — owner tracking is not supported by
                  the current Action model.
                </span>
              ) : (
                step.value || (
                  <span className="text-[#9ca3af]">
                    {step.label === 'Why this'
                      ? 'No linked recommendation explanation — created directly from an opportunity.'
                      : '—'}
                  </span>
                )
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ActionDetail({
  action,
  websiteName,
  metadata,
}: {
  action: RenkooAction;
  websiteName: string | null;
  metadata: Record<string, any> | null;
}) {
  const recommendation = action.recommendation as any;
  const entries = metadata ? Object.entries(metadata).slice(0, 12) : [];

  return (
    <div className="mt-4 border border-[#e5e7eb] bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
        Evidence and context
      </div>

      <dl className="mt-2 grid gap-2 text-xs text-[#4b5563] sm:grid-cols-2">
        {action.url && (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-[#9ca3af]">
              Affected page
            </dt>
            <dd className="mt-0.5 break-all text-[#111827]">
              {action.url}
            </dd>
          </div>
        )}

        {websiteName && (
          <div>
            <dt className="font-semibold text-[#9ca3af]">Website</dt>
            <dd className="mt-0.5 text-[#111827]">{websiteName}</dd>
          </div>
        )}

        {recommendation && (
          <>
            <div>
              <dt className="font-semibold text-[#9ca3af]">
                Recommendation
              </dt>
              <dd className="mt-0.5 text-[#111827]">
                {recommendation.title || recommendation.id}
              </dd>
            </div>
            {(recommendation.impact || recommendation.effort) && (
              <div>
                <dt className="font-semibold text-[#9ca3af]">
                  Impact / Effort
                </dt>
                <dd className="mt-0.5 text-[#111827]">
                  {[recommendation.impact, recommendation.effort]
                    .filter(Boolean)
                    .map((value: unknown) => formatLabel(value))
                    .join(' / ') || '—'}
                </dd>
              </div>
            )}
            {recommendation.actionText && (
              <div className="sm:col-span-2">
                <dt className="font-semibold text-[#9ca3af]">
                  Recommended next step
                </dt>
                <dd className="mt-0.5 text-[#111827]">
                  {recommendation.actionText}
                </dd>
              </div>
            )}
            {recommendation.pageUrl && (
              <div className="sm:col-span-2">
                <dt className="font-semibold text-[#9ca3af]">
                  Recommendation page
                </dt>
                <dd className="mt-0.5 break-all text-[#111827]">
                  {recommendation.pageUrl}
                </dd>
              </div>
            )}
          </>
        )}

        <div>
          <dt className="font-semibold text-[#9ca3af]">Created</dt>
          <dd className="mt-0.5 text-[#111827]">
            {formatDateTime(action.createdAt)}
          </dd>
        </div>

        <div>
          <dt className="font-semibold text-[#9ca3af]">Updated</dt>
          <dd className="mt-0.5 text-[#111827]">
            {formatDateTime(action.updatedAt)}
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

      <p className="mt-3 text-[11px] leading-5 text-[#9ca3af]">
        RENKOO does not change your website by completing an action
        here. Carry out the work yourself or through a connected
        integration, then re-crawl to let monitoring measure the
        outcome.
      </p>

      <ActionMeasurementBlock action={action} />
    </div>
  );
}

function ActionMeasurementBlock({
  action,
}: {
  action: RenkooAction;
}) {
  const [measurement, setMeasurement] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (action.status !== 'DONE') return;
    setLoading(true);
    getActionMeasurement(action.id, 28)
      .then((result) => {
        if (!cancelled) setMeasurement(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [action.id, action.status]);

  if (action.status !== 'DONE') {
    return (
      <p className="mt-3 text-[11px] leading-5 text-[#9ca3af]">
        Measurement starts after this action is completed.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="mt-3 text-[11px] leading-5 text-[#9ca3af]">
        Reading observed measurement…
      </p>
    );
  }

  if (failed || !measurement) {
    return (
      <p className="mt-3 text-[11px] leading-5 text-[#9ca3af]">
        Measurement is currently unavailable.
      </p>
    );
  }

  const changes: any[] =
    measurement.observedChanges ?? [];

  return (
    <div className="mt-3 border-t border-[#e5e7eb] pt-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
        Measurement — observed after action
      </div>
      <p className="mt-1 text-xs text-[#111827]">
        Outcome:{' '}
        <b>{String(measurement.outcomeState ?? 'UNKNOWN')}</b>
      </p>
      <ul className="mt-1.5 space-y-1">
        {changes.slice(0, 6).map((row: any) => (
          <li
            key={String(row.key)}
            className="text-xs text-[#4b5563]"
          >
            · <b>{String(row.label)}</b> {String(row.before)}{' '}
            → {String(row.after)} ({String(row.outcome)})
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] leading-5 text-[#9ca3af]">
        {String(measurement.learning ?? '')}
      </p>
      {measurement.overlapNote ? (
        <p className="mt-1 text-[11px] leading-5 text-[#9ca3af]">
          {String(measurement.overlapNote)}
        </p>
      ) : null}
      <p className="mt-1.5 text-[11px] leading-5">
        <Link
          href="/change-intelligence"
          className="font-semibold text-[#111827] underline"
        >
          View change timeline
        </Link>
      </p>
      <ActionVerificationBlock action={action} />
    </div>
  );
}

function ActionVerificationBlock({
  action,
}: {
  action: RenkooAction;
}) {
  const [verification, setVerification] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (action.status !== 'DONE') return;
    setLoading(true);
    getActionVerification(action.id)
      .then((result) => {
        if (!cancelled) setVerification(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [action.id, action.status]);

  async function handleVerify() {
    if (verifying) return;
    setVerifying(true);
    setFailed(false);
    try {
      const result = await verifyActionLive(action.id);
      setVerification(result);
    } catch {
      setFailed(true);
    } finally {
      setVerifying(false);
    }
  }

  if (action.status !== 'DONE') {
    return (
      <p className="mt-3 text-[11px] leading-5 text-[#9ca3af]">
        Live verification becomes available after this
        action is marked complete.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="mt-3 text-[11px] leading-5 text-[#9ca3af]">
        Reading verification state…
      </p>
    );
  }

  if (failed || !verification) {
    return (
      <p className="mt-3 text-[11px] leading-5 text-[#9ca3af]">
        Verification state is currently unavailable.
      </p>
    );
  }

  const expected = verification.expectedChange as any;

  return (
    <div className="mt-3 border-t border-[#e5e7eb] pt-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9ca3af]">
        Live verification
      </div>
      {expected ? (
        <p className="mt-1 text-xs text-[#111827]">
          Expected:{' '}
          <b>{String(expected.targetElement ?? '')}</b>{' '}
          {String(expected.expectedState ?? '')}
        </p>
      ) : (
        <p className="mt-1 text-xs text-[#4b5563]">
          This action has no deterministic live-page
          verification target.
        </p>
      )}
      <p className="mt-1 text-xs text-[#111827]">
        Status:{' '}
        <b>{String(verification.verificationStatus)}</b>
      </p>
      <p className="mt-1 text-[11px] leading-5 text-[#4b5563]">
        {String(verification.verificationNote ?? '')}
      </p>
      {verification.live ? (
        <p className="mt-1 break-words text-[11px] leading-5 text-[#4b5563]">
          Observed:{' '}
          {String(
            verification.live.title ??
              verification.live.url ??
              '',
          )}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void handleVerify()}
        disabled={verifying}
        className="mt-2 rounded-lg border border-[#d1d5db] px-3 py-1.5 text-xs font-bold text-[#111827] hover:bg-[#f3f4f6] disabled:opacity-60"
      >
        {verifying ? 'Verifying…' : 'Verify live change'}
      </button>
      <p className="mt-1 text-[11px] leading-5 text-[#9ca3af]">
        Explicit verification uses existing crawl quota.
        RENKOO never modifies your website.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'DONE'
      ? 'bg-[#111827] text-white'
      : status === 'IN_PROGRESS'
        ? 'bg-[#f3f4f6] text-[#111827] border border-[#d1d5db]'
        : status === 'DISMISSED'
          ? 'bg-[#fafafa] text-[#9ca3af] border border-[#e5e7eb]'
          : 'bg-white text-[#4b5563] border border-[#dfe2e6]';

  return (
    <span className={`px-2.5 py-1 text-[11px] font-semibold ${styles}`}>
      {formatLabel(status)}
    </span>
  );
}

function Stat({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="bg-white p-5 md:p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7280]">
        {label}
      </div>

      <div className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#111827]">
        {value}
      </div>

      <div className="mt-2 text-xs leading-5 text-[#9ca3af]">
        {description}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center border border-[#e5e7eb] bg-[#fafafa] text-sm font-semibold text-[#6b7280]">
        —
      </div>

      <h2 className="mt-4 text-sm font-semibold text-[#111827]">
        No actions found
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7280]">
        Create an action from the{' '}
        <Link
          href="/opportunities"
          className="font-semibold text-[#111827] underline hover:text-black"
        >
          Opportunity Engine
        </Link>{' '}
        or a competitor gap to start tracking execution here.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <AppShell
      mobileOpen={false}
      onClose={() => undefined}
    >
      <div className="mx-auto max-w-[1440px] animate-pulse">
        <div className="h-3 w-32 bg-[#e5e7eb]" />
        <div className="mt-4 h-10 w-64 bg-[#e5e7eb]" />
        <div className="mt-3 h-4 w-96 max-w-full bg-[#e5e7eb]" />

        <div className="mt-8 grid grid-cols-2 gap-px bg-[#e5e7eb] md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-36 bg-white" />
          ))}
        </div>

        <div className="mt-8 h-24 bg-white" />

        <div className="mt-1 space-y-px bg-[#e5e7eb]">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-52 bg-white" />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function formatLabel(value: unknown) {
  return String(value || '—')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/*
 * Core-loop traceability: link a source back to its existing
 * RENKOO route only. Unknown sources stay plain text.
 */
function sourceHref(source: unknown): string | null {
  const value = String(source || '').toUpperCase();
  if (
    value.includes('COMPETITOR') ||
    value === 'COMPETITOR_COMPARISON'
  ) {
    return '/competitors';
  }
  if (value.includes('BACKLINK')) return '/backlinks';
  if (value.includes('CONTENT')) return '/content';
  if (
    value.includes('TECHNICAL') ||
    value.includes('SEO_AUDIT') ||
    value === 'SEO'
  ) {
    return '/technical-seo';
  }
  if (
    value.includes('MONITOR') ||
    value.includes('MONITORING')
  ) {
    return '/monitoring';
  }
  if (
    value.includes('INTELLIGENCE') ||
    value.includes('WORKER')
  ) {
    return '/agents';
  }
  if (value.includes('OPPORTUNITY')) return '/opportunities';
  if (value.includes('RECOMMENDATION')) return '/opportunities';
  return null;
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


