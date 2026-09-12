/*
 * RENKOO — active filter counting (pure, no imports).
 *
 * Generic mechanism shared by FilterBar: a select
 * contributes to the active count only when it is
 * countable AND its value differs from its default.
 * Defaults preserve the historical rule exactly
 * (every select countable, default 'ALL', '' never
 * counts), so pages that pass no new props behave
 * byte-for-byte as before.
 *
 * Scope selectors (e.g. Website) pass
 * `countable: false`; pages whose default is not
 * ALL (e.g. Status=OPEN) pass that default via
 * `defaultValue`.
 */

export interface CountableSelect {
  value: string;
  countable?: boolean;
  defaultValue?: string;
}

export interface CountableMultiSelect {
  values: string[];
}

export interface CountableDateRange {
  from: string;
  to: string;
}

export function countActiveFilters(input: {
  selects?: CountableSelect[];
  multiSelects?: CountableMultiSelect[];
  dateRange?: CountableDateRange | null;
  searchValue?: string | null;
}): number {
  const {
    selects = [],
    multiSelects = [],
    dateRange = null,
    searchValue = null,
  } = input;

  const selectCount = selects.filter((s) => {
    if (s.countable === false) return false;
    if (s.value === '') return false;
    return (
      s.value !== (s.defaultValue ?? 'ALL')
    );
  }).length;

  const multiCount = multiSelects.reduce(
    (n, m) => n + m.values.length,
    0,
  );

  const dateCount =
    dateRange && (dateRange.from || dateRange.to)
      ? 1
      : 0;

  const searchCount =
    searchValue && searchValue.trim() ? 1 : 0;

  return (
    selectCount +
    multiCount +
    dateCount +
    searchCount
  );
}
