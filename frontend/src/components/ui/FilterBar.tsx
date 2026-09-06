'use client';

/*
 * RENKOO V2 — shared filtering system.
 * One filter pattern for every product list: search input,
 * single selects, multi-selects (where genuinely required),
 * date range, and an optional action slot. Active filters
 * are always visible with a one-tap Clear all — filters
 * never silently narrow results.
 *
 * Responsive strategy: inline bar on desktop; on mobile the
 * controls collapse into an intentional filter sheet
 * (same controls, larger touch targets, explicit Apply).
 * Filtering logic stays in pages — this renders controls
 * only and reports values back up.
 */

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelect {
  key: string;
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

export interface FilterMultiSelect {
  key: string;
  label: string;
  options: FilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
}

export interface FilterDateRange {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}

function MultiSelectControl({
  spec,
  large = false,
}: {
  spec: FilterMultiSelect;
  large?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () =>
      document.removeEventListener('keydown', onKey);
  }, [open ]);

  function toggle(value: string) {
    spec.onChange(
      spec.values.includes(value)
        ? spec.values.filter((v) => v !== value)
        : [...spec.values, value],
    );
  }

  const summary =
    spec.values.length === 0
      ? 'All'
      : spec.values.length === 1
        ? (spec.options.find(
            (o) => o.value === spec.values[0],
          )?.label ?? spec.values[0])
        : `${spec.values.length} selected`;

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${spec.label}: ${summary}. Activate to change.`}
        className={`rk-focusable inline-flex items-center gap-2 rounded-rk-md border border-rk-border bg-rk-surface font-semibold text-rk-ink hover:border-rk-strong ${large ? 'px-4 py-3 text-sm' : 'px-3 py-2 text-xs'}`}
      >
        <span className="rk-field-label">
          {spec.label}
        </span>
        <span className={large ? 'text-sm' : 'text-xs'}>
          {summary}
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={`text-rk-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label={`Close ${spec.label} options`}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <ul
            aria-label={spec.label}
            className="absolute left-0 z-20 mt-1 max-h-60 w-56 overflow-y-auto rounded-rk-md border border-rk-border bg-rk-surface p-1 shadow-rk-md"
          >
            {spec.options.map((option) => {
              const checked = spec.values.includes(
                option.value,
              );
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() =>
                      toggle(option.value)
                    }
                    className="rk-focusable flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-rk-ink hover:bg-rk-soft"
                  >
                    <span
                      aria-hidden
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-sm border ${checked ? 'border-rk-ink bg-rk-ink text-white' : 'border-rk-strong text-transparent'}`}
                    >
                      <Check size={12} />
                    </span>
                    {option.label}
                  </button>
                </li>
              );
            })}
            {spec.options.length === 0 ? (
              <li className="px-2 py-3 text-sm text-rk-muted">
                No options available.
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default function FilterBar({
  searchValue,
  searchPlaceholder = 'Search…',
  onSearchChange,
  selects = [],
  multiSelects = [],
  dateRange,
  dateLabel = 'Period',
  actions,
  meta,
  activeFilterCount,
  onClearAll,
}: {
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  selects?: FilterSelect[];
  multiSelects?: FilterMultiSelect[];
  dateRange?: FilterDateRange;
  dateLabel?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  /** Explicit count override (auto-derived when omitted). */
  activeFilterCount?: number;
  onClearAll?: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const derivedCount =
    selects.filter((s) => s.value !== '' && s.value !== 'ALL').length +
    multiSelects.reduce(
      (n, m) => n + m.values.length,
      0,
    ) +
    (dateRange && (dateRange.from || dateRange.to) ? 1 : 0) +
    (searchValue && searchValue.trim() ? 1 : 0);

  const count = activeFilterCount ?? derivedCount;
  const showClear = count > 0 && onClearAll;

  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setSheetOpen(false);
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [sheetOpen ]);

  const controls = (
    <>
      {onSearchChange ? (
        <label className="min-w-0 flex-1">
          <span className="sr-only">
            {searchPlaceholder}
          </span>
          <span className="relative block">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rk-muted"
            />
            <input
              type="search"
              value={searchValue ?? ''}
              placeholder={searchPlaceholder}
              onChange={(event) =>
                onSearchChange(event.target.value)
              }
              className="input pl-9"
            />
          </span>
        </label>
      ) : null}

      {selects.map((select) => (
        <label
          key={select.key}
          className="flex shrink-0 items-center gap-2"
        >
          <span className="rk-field-label whitespace-nowrap">
            {select.label}
          </span>
          <select
            value={select.value}
            onChange={(event) =>
              select.onChange(event.target.value)
            }
            aria-label={select.label}
            className="input w-auto"
          >
            {select.options.map((option) => (
              <option
                key={option.value}
                value={option.value}
              >
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      {multiSelects.map((spec) => (
        <MultiSelectControl
          key={spec.key}
          spec={spec}
        />
      ))}

      {dateRange ? (
        <fieldset className="flex shrink-0 items-center gap-2">
          <legend className="rk-field-label sr-only">
            {dateLabel}
          </legend>
          <span
            aria-hidden
            className="rk-field-label whitespace-nowrap"
          >
            {dateLabel}
          </span>
          <input
            type="date"
            value={dateRange.from}
            aria-label={`${dateLabel} start`}
            onChange={(event) =>
              dateRange.onChange({
                ...dateRange,
                from: event.target.value,
              })
            }
            className="input w-auto"
          />
          <span aria-hidden className="text-rk-muted">
            →
          </span>
          <input
            type="date"
            value={dateRange.to}
            aria-label={`${dateLabel} end`}
            min={dateRange.from || undefined}
            onChange={(event) =>
              dateRange.onChange({
                ...dateRange,
                to: event.target.value,
              })
            }
            className="input w-auto"
          />
        </fieldset>
      ) : null}
    </>
  );

  return (
    <div className="rounded-rk-lg border border-rk-border bg-rk-surface px-4 py-3 shadow-rk-sm">
      {/* Desktop / tablet inline bar */}
      <div className="hidden flex-col gap-2 lg:flex lg:flex-row lg:items-center">
        {controls}

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:ml-auto">
          {showClear ? (
            <button
              type="button"
              onClick={onClearAll}
              className="rk-focusable inline-flex items-center gap-1 rounded-rk-md px-2 py-2 text-xs font-bold text-rk-secondary hover:text-rk-ink"
            >
              <X size={13} aria-hidden />
              Clear all ({count})
            </button>
          ) : null}
          {actions}
        </div>
      </div>

      {/* Mobile: search stays visible, rest moves to a sheet */}
      <div className="flex items-center gap-2 lg:hidden">
        {onSearchChange ? (
          <label className="min-w-0 flex-1">
            <span className="sr-only">
              {searchPlaceholder}
            </span>
            <span className="relative block">
              <Search
                size={15}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rk-muted"
              />
              <input
                type="search"
                value={searchValue ?? ''}
                placeholder={searchPlaceholder}
                onChange={(event) =>
                  onSearchChange(event.target.value)
                }
                className="input pl-9"
              />
            </span>
          </label>
        ) : null}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={`Open filters${count > 0 ? `, ${count} active` : ''}`}
          className="rk-focusable relative grid h-10 w-10 shrink-0 place-items-center rounded-rk-md border border-rk-border text-rk-ink"
        >
          <SlidersHorizontal
            size={17}
            aria-hidden
          />
          {count > 0 ? (
            <span
              aria-hidden
              className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-rk-ink px-1 text-[10px] font-bold text-white"
            >
              {count}
            </span>
          ) : null}
        </button>

        {actions ? (
          <span className="flex shrink-0 items-center gap-2">
            {actions}
          </span>
        ) : null}
      </div>

      {/* Active-filter indicator (all breakpoints) */}
      {showClear ? (
        <p role="status" className="rk-metadata mt-2 lg:hidden">
          {count} filter{count === 1 ? '' : 's'} active.{' '}
          <button
            type="button"
            onClick={onClearAll}
            className="rk-focusable font-bold text-rk-ink underline underline-offset-2"
          >
            Clear all
          </button>
        </p>
      ) : null}

      {meta ? (
        <div className="rk-metadata mt-2">{meta}</div>
      ) : null}

      {/* Mobile filter sheet */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-rk-scrim"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-rk-border bg-rk-surface p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="rk-panel-title">
                Filters
                {count > 0 ? ` (${count})` : ''}
              </h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close filters"
                className="rk-focusable grid h-9 w-9 place-items-center rounded-rk-md border border-rk-border text-rk-secondary"
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            <div className="space-y-4">
              {selects.map((select) => (
                <label
                  key={select.key}
                  className="block"
                >
                  <span className="rk-field-label">
                    {select.label}
                  </span>
                  <select
                    value={select.value}
                    onChange={(event) =>
                      select.onChange(
                        event.target.value,
                      )
                    }
                    className="input mt-1"
                  >
                    {select.options.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              {multiSelects.map((spec) => (
                <fieldset key={spec.key}>
                  <legend className="rk-field-label">
                    {spec.label}
                  </legend>
                  <ul className="mt-1 space-y-1">
                    {spec.options.map((option) => {
                      const checked =
                        spec.values.includes(
                          option.value,
                        );
                      return (
                        <li key={option.value}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() =>
                              spec.onChange(
                                checked
                                  ? spec.values.filter(
                                      (v) =>
                                        v !==
                                        option.value,
                                    )
                                  : [
                                      ...spec.values,
                                      option.value,
                                    ],
                              )
                            }
                            className="rk-focusable flex w-full items-center gap-3 rounded-rk-md px-2 py-2.5 text-left text-sm text-rk-ink hover:bg-rk-soft"
                          >
                            <span
                              aria-hidden
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-sm border ${checked ? 'border-rk-ink bg-rk-ink text-white' : 'border-rk-strong text-transparent'}`}
                            >
                              <Check size={14} />
                            </span>
                            {option.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ))}

              {dateRange ? (
                <fieldset>
                  <legend className="rk-field-label">
                    {dateLabel}
                  </legend>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="date"
                      value={dateRange.from}
                      aria-label={`${dateLabel} start`}
                      onChange={(event) =>
                        dateRange.onChange({
                          ...dateRange,
                          from: event.target.value,
                        })
                      }
                      className="input"
                    />
                    <span
                      aria-hidden
                      className="text-rk-muted"
                    >
                      →
                    </span>
                    <input
                      type="date"
                      value={dateRange.to}
                      aria-label={`${dateLabel} end`}
                      min={dateRange.from || undefined}
                      onChange={(event) =>
                        dateRange.onChange({
                          ...dateRange,
                          to: event.target.value,
                        })
                      }
                      className="input"
                    />
                  </div>
                </fieldset>
              ) : null}
            </div>

            <div className="sticky bottom-0 mt-5 flex gap-2 border-t border-rk-border bg-rk-surface pt-4">
              {showClear ? (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="rk-focusable flex-1 rounded-rk-md border border-rk-strong px-4 py-3 text-sm font-bold text-rk-ink"
                >
                  Clear all
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rk-focusable flex-1 rounded-rk-md bg-rk-ink px-4 py-3 text-sm font-bold text-white"
              >
                Show results
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
