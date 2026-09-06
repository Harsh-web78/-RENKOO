'use client';

/*
 * RENKOO V2 — DataTable.
 * One table pattern for every product list: sticky header,
 * caption for screen readers, tabular numerals, icon+text
 * status cells (never color alone), and the shared data
 * states. Composable, not exhaustive:
 *
 *   sorting      — opt-in per column (uncontrolled by
 *                  default, controlled via sort/onSortChange)
 *   pagination   — client-side by default (pageSize);
 *                  server mode via total/page/onPageChange
 *   selection    — opt-in checkboxes with aria + count
 *   expansion    — opt-in detail rows (also the mobile
 *                  strategy: hidden columns survive in the
 *                  expanded view, nothing is destroyed)
 *   row actions  — compact per-row buttons, keyboard-safe
 *   responsive   — column priority (high always visible;
 *                  medium hides below md; low hides below
 *                  lg) + horizontal scroll as the fallback
 *
 * The table never fetches — rows always come from
 * page-level API data. Error/unavailable/insufficient
 * states render through the shared state primitives.
 */

import { Fragment, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from 'lucide-react';

import {
  EmptyState,
  ErrorState,
  InsufficientHistoryState,
  LoadingBlock,
  PartialDataState,
  UnavailableState,
} from './states';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => ReactNode;
  /** Enable header sort control for this column. */
  sortable?: boolean;
  /** Raw value used for client-side sorting. */
  sortValue?: (row: T) => string | number;
  /** Responsive priority: medium hides below md, low below lg. */
  priority?: 'high' | 'medium' | 'low';
}

export interface DataTableSort {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataTableError {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export type DataTableNoticeKind =
  | 'unavailable'
  | 'insufficient'
  | 'partial';

export interface DataTableNotice {
  kind: DataTableNoticeKind;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

const PRIORITY_CLASS: Record<string, string> = {
  high: '',
  medium: 'hidden md:table-cell',
  low: 'hidden lg:table-cell',
};

function Notice({ notice }: { notice: DataTableNotice }) {
  if (notice.kind === 'unavailable') {
    return (
      <UnavailableState
        title={notice.title}
        description={
          notice.description ??
          'This data source is not connected.'
        }
        connectLabel={
          notice.actionLabel ?? 'Open integrations'
        }
        connectHref={
          notice.actionHref ?? '/integrations'
        }
      />
    );
  }
  if (notice.kind === 'insufficient') {
    return (
      <InsufficientHistoryState
        title={notice.title}
        description={notice.description}
        actionLabel={notice.actionLabel}
        actionHref={notice.actionHref}
        onAction={notice.onAction}
      />
    );
  }
  return (
    <PartialDataState
      title={notice.title}
      description={notice.description}
      actionLabel={notice.actionLabel}
      actionHref={notice.actionHref}
      onAction={notice.onAction}
    />
  );
}

export default function DataTable<T>({
  caption,
  columns,
  rows,
  keyOf,
  loading = false,
  emptyTitle = 'No rows yet',
  emptyDescription,
  emptyActionLabel,
  emptyActionHref,
  onRowClick,
  sort,
  defaultSort,
  onSortChange,
  pageSize = 0,
  page,
  total,
  onPageChange,
  selectedKeys,
  onSelectionChange,
  renderExpanded,
  expandedKeys,
  onExpandedChange,
  rowActions,
  error = null,
  notice = null,
  density = 'comfortable',
  footer,
}: {
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  keyOf: (row: T, index: number) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  emptyActionHref?: string;
  onRowClick?: (row: T) => void;
  sort?: DataTableSort | null;
  defaultSort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  /** Client-side rows per page (0 = all). Ignored in server mode. */
  pageSize?: number;
  /** Server-mode current page (1-based). Requires total + onPageChange. */
  page?: number;
  /** Server-mode total row count. */
  total?: number;
  onPageChange?: (page: number) => void;
  selectedKeys?: string[];
  onSelectionChange?: (keys: string[]) => void;
  renderExpanded?: (row: T) => ReactNode;
  expandedKeys?: string[];
  onExpandedChange?: (keys: string[]) => void;
  rowActions?: (row: T) => Array<{
    label: string;
    onSelect: () => void;
  }>;
  error?: DataTableError | null;
  notice?: DataTableNotice | null;
  density?: 'comfortable' | 'compact';
  footer?: ReactNode;
}) {
  const [innerSort, setInnerSort] =
    useState<DataTableSort | null>(
      defaultSort ?? null,
    );
  const [innerPage, setInnerPage] = useState(1);
  const [innerExpanded, setInnerExpanded] =
    useState<string[]>([]);

  const effectiveSort =
    sort !== undefined ? sort : innerSort;
  const serverMode =
    typeof total === 'number' &&
    typeof page === 'number' &&
    typeof onPageChange === 'function';

  const selectable =
    Array.isArray(selectedKeys) &&
    typeof onSelectionChange === 'function';
  const expandable =
    typeof renderExpanded === 'function';
  const effectiveExpanded =
    expandedKeys ?? innerExpanded;

  function setExpanded(keys: string[]) {
    if (onExpandedChange) onExpandedChange(keys);
    else setInnerExpanded(keys);
  }

  function changeSort(column: DataTableColumn<T>) {
    if (!column.sortable) return;
    const next: DataTableSort =
      effectiveSort?.key === column.key &&
      effectiveSort.direction === 'asc'
        ? { key: column.key, direction: 'desc' }
        : { key: column.key, direction: 'asc' };
    if (onSortChange) onSortChange(next);
    else {
      setInnerSort(next);
      setInnerPage(1);
    }
  }

  const sorted = useMemo(() => {
    if (!effectiveSort) return rows;
    const column = columns.find(
      (c) => c.key === effectiveSort.key,
    );
    if (!column?.sortValue) return rows;
    const dir =
      effectiveSort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = column.sortValue!(a);
      const vb = column.sortValue!(b);
      if (typeof va === 'number' && typeof vb === 'number')
        return (va - vb) * dir;
      return (
        String(va).localeCompare(String(vb)) * dir
      );
    });
  }, [rows, effectiveSort, columns]);

  const pageCount = serverMode
    ? Math.max(
        1,
        Math.ceil(
          (total ?? 0) /
            Math.max(1, pageSize || total || 1),
        ),
      )
    : pageSize > 0
      ? Math.max(1, Math.ceil(sorted.length / pageSize))
      : 1;

  const currentPage = serverMode
    ? (page as number)
    : innerPage;

  const visible = useMemo(() => {
    if (serverMode) return sorted;
    if (pageSize <= 0) return sorted;
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, serverMode, pageSize, currentPage]);

  function goTo(next: number) {
    const clamped = Math.min(
      Math.max(1, next),
      pageCount,
    );
    if (serverMode) (onPageChange as (p: number) => void)(clamped);
    else setInnerPage(clamped);
  }

  const visibleKeys = visible.map((row, i) =>
    keyOf(row, i),
  );
  const allVisibleSelected =
    selectable &&
    visibleKeys.length > 0 &&
    visibleKeys.every((k) =>
      (selectedKeys as string[]).includes(k),
    );
  const someVisibleSelected =
    selectable &&
    !allVisibleSelected &&
    visibleKeys.some((k) =>
      (selectedKeys as string[]).includes(k),
    );

  function toggleAll() {
    if (!selectable) return;
    const current = selectedKeys as string[];
    if (allVisibleSelected) {
      onSelectionChange!(
        current.filter(
          (k) => !visibleKeys.includes(k),
        ),
      );
    } else {
      onSelectionChange!([
        ...new Set([...current, ...visibleKeys]),
      ]);
    }
  }

  function toggleOne(key: string) {
    if (!selectable) return;
    const current = selectedKeys as string[];
    onSelectionChange!(
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );
  }

  const cellPad =
    density === 'compact' ? 'px-3 py-1.5' : 'px-4 py-3';
  const colSpan =
    columns.length +
    (selectable ? 1 : 0) +
    (expandable ? 1 : 0) +
    (rowActions ? 1 : 0);

  if (error) {
    return (
      <ErrorState
        title={error.title ?? 'Table failed to load'}
        description={
          error.description ??
          'RENKOO could not load these rows. Your data is safe — try again.'
        }
        onRetry={error.onRetry}
      />
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <>
        {notice ? <Notice notice={notice} /> : null}
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          actionLabel={emptyActionLabel}
          actionHref={emptyActionHref}
        />
      </>
    );
  }

  if (loading && rows.length === 0) {
    return <LoadingBlock title={`Loading ${caption}…`} lines={4} />;
  }

  return (
    <div>
      {notice ? (
        <div className="mb-3">
          <Notice notice={notice} />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-rk-lg border border-rk-border bg-rk-surface shadow-rk-sm">
        <table className="rk-table-text w-full min-w-[640px] border-collapse text-left">
          <caption className="sr-only">
            {caption}
          </caption>

          <thead className="sticky top-0 z-10">
            <tr className="border-b border-rk-border bg-rk-soft">
              {expandable ? (
                <th
                  scope="col"
                  className={`w-10 ${cellPad}`}
                >
                  <span className="sr-only">
                    Expand row
                  </span>
                </th>
              ) : null}

              {selectable ? (
                <th
                  scope="col"
                  className={`w-10 ${cellPad}`}
                >
                  <input
                    type="checkbox"
                    checked={!!allVisibleSelected}
                    aria-checked={
                      someVisibleSelected
                        ? 'mixed'
                        : !!allVisibleSelected
                    }
                    aria-label={`Select all rows on this page (${caption})`}
                    onChange={toggleAll}
                    className="rk-focusable h-4 w-4 accent-[#111318]"
                  />
                </th>
              ) : null}

              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    column.sortable
                      ? effectiveSort?.key ===
                        column.key
                        ? effectiveSort.direction ===
                          'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                  className={`rk-label ${cellPad} whitespace-nowrap ${
                    column.align === 'right'
                      ? 'text-right'
                      : column.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  } ${PRIORITY_CLASS[column.priority ?? 'high']}`}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() =>
                        changeSort(column)
                      }
                      aria-label={`Sort by ${column.label}${
                        effectiveSort?.key ===
                        column.key
                          ? effectiveSort.direction ===
                            'asc'
                            ? ', sorted ascending'
                            : ', sorted descending'
                          : ''
                      }`}
                      className="rk-focusable inline-flex items-center gap-1 uppercase"
                    >
                      {column.label}
                      {effectiveSort?.key ===
                      column.key ? (
                        effectiveSort.direction ===
                        'asc' ? (
                          <ArrowUp
                            size={12}
                            aria-hidden
                          />
                        ) : (
                          <ArrowDown
                            size={12}
                            aria-hidden
                          />
                        )
                      ) : (
                        <ChevronsUpDown
                          size={12}
                          aria-hidden
                          className="opacity-50"
                        />
                      )}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}

              {rowActions ? (
                <th
                  scope="col"
                  className={`rk-label ${cellPad} text-right`}
                >
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>

          <tbody className="divide-y divide-rk-border">
            {visible.map((row, index) => {
              const key = keyOf(row, index);
              const expanded =
                effectiveExpanded.includes(key);
              const selected =
                selectable &&
                (selectedKeys as string[]).includes(
                  key,
                );

              return (
                <Fragment key={key}>
                  <tr
                    onClick={
                      onRowClick
                        ? () => onRowClick(row)
                        : undefined
                    }
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (
                              e.key !== 'Enter' &&
                              e.key !== ' '
                            )
                              return;
                            const target =
                              e.target as HTMLElement;
                            if (
                              target.closest(
                                'button, input, a, [role="button"]',
                              )
                            )
                              return;
                            e.preventDefault();
                            onRowClick(row);
                          }
                        : undefined
                    }
                    tabIndex={
                      onRowClick ? 0 : undefined
                    }
                    role={
                      onRowClick ? 'link' : undefined
                    }
                    className={
                      onRowClick
                        ? 'rk-focusable cursor-pointer transition-colors hover:bg-rk-soft'
                        : selected
                          ? 'bg-rk-soft/60'
                          : undefined
                    }
                  >
                    {expandable ? (
                      <td
                        className={cellPad}
                        key={`${key}-expand`}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(
                              expanded
                                ? effectiveExpanded.filter(
                                    (k) =>
                                      k !== key,
                                  )
                                : [
                                    ...effectiveExpanded,
                                    key,
                                  ],
                            );
                          }}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Collapse' : 'Expand'} details for row ${index + 1}`}
                          className="rk-focusable grid h-6 w-6 place-items-center rounded text-rk-secondary hover:text-rk-ink"
                        >
                          <ChevronDown
                            size={15}
                            aria-hidden
                            className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </td>
                    ) : null}

                    {selectable ? (
                      <td
                        className={cellPad}
                        key={`${key}-select`}
                        onClick={(e) =>
                          e.stopPropagation()
                        }
                      >
                        <input
                          type="checkbox"
                          checked={!!selected}
                          aria-label={`Select row ${index + 1}`}
                          onChange={() =>
                            toggleOne(key)
                          }
                          className="rk-focusable h-4 w-4 accent-[#111318]"
                        />
                      </td>
                    ) : null}

                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`${cellPad} align-top text-rk-ink ${
                          column.align === 'right'
                            ? 'text-right tabular-nums'
                            : column.align === 'center'
                              ? 'text-center'
                              : 'text-left'
                        } ${PRIORITY_CLASS[column.priority ?? 'high']}`}
                      >
                        {column.render
                          ? column.render(row)
                          : String(
                              (
                                row as Record<
                                  string,
                                  unknown
                                >
                              )[column.key] ??
                                '—',
                            )}
                      </td>
                    ))}

                    {rowActions ? (
                      <td
                        className={`${cellPad} text-right`}
                        key={`${key}-actions`}
                        onClick={(e) =>
                          e.stopPropagation()
                        }
                      >
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          {rowActions(row).map(
                            (action) => (
                              <button
                                key={action.label}
                                type="button"
                                onClick={
                                  action.onSelect
                                }
                                className="rk-focusable rounded-rk-sm border border-rk-border bg-rk-surface px-2 py-1 text-[11px] font-bold text-rk-ink hover:bg-rk-soft"
                              >
                                {action.label}
                              </button>
                            ),
                          )}
                        </span>
                      </td>
                    ) : null}
                  </tr>

                  {expandable && expanded ? (
                    <tr className="bg-rk-soft/50">
                      <td
                        colSpan={colSpan}
                        className="px-4 py-3"
                      >
                        {renderExpanded!(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}

            {loading
              ? Array.from({ length: 3 }).map(
                  (_, index) => (
                    <tr
                      key={`skeleton-${index}`}
                    >
                      <td
                        colSpan={colSpan}
                        className="px-4 py-3"
                      >
                        <div
                          className="rk-skeleton h-4 w-full"
                          aria-hidden
                        />
                      </td>
                    </tr>
                  ),
                )
              : null}
          </tbody>
        </table>
      </div>

      {selectable &&
      (selectedKeys as string[]).length > 0 ? (
        <p
          role="status"
          className="rk-metadata mt-2"
        >
          {
            (selectedKeys as string[]).length
          }{' '}
          row
          {(selectedKeys as string[]).length ===
          1
            ? ''
            : 's'}{' '}
          selected
        </p>
      ) : null}

      {pageCount > 1 || footer ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="rk-metadata">
            {footer ??
              (serverMode
                ? `${total} rows`
                : `${sorted.length} rows`)}
          </div>

          {pageCount > 1 ? (
            <nav
              aria-label={`${caption} pagination`}
              className="flex items-center gap-1"
            >
              <button
                type="button"
                onClick={() =>
                  goTo(currentPage - 1)
                }
                disabled={currentPage <= 1}
                aria-label="Previous page"
                className="rk-focusable grid h-8 w-8 place-items-center rounded-rk-md border border-rk-border text-rk-secondary disabled:opacity-40"
              >
                <ChevronLeft
                  size={15}
                  aria-hidden
                />
              </button>
              <span
                role="status"
                className="px-2 text-xs font-semibold tabular-nums text-rk-secondary"
              >
                {currentPage} / {pageCount}
              </span>
              <button
                type="button"
                onClick={() =>
                  goTo(currentPage + 1)
                }
                disabled={
                  currentPage >= pageCount
                }
                aria-label="Next page"
                className="rk-focusable grid h-8 w-8 place-items-center rounded-rk-md border border-rk-border text-rk-secondary disabled:opacity-40"
              >
                <ChevronRight
                  size={15}
                  aria-hidden
                />
              </button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
