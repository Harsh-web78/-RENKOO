'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Clock3,
  Eye,
  Globe2,
  Loader2,
  Menu,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import {
  getGoogleAnalyticsReport,
  getGoogleAnalyticsProperties,
  getGoogleConnectionStatus,
  selectGoogleAnalyticsProperty,
  type GoogleAnalyticsProperty,
  type GoogleAnalyticsReport,
  type GoogleAnalyticsReportRow,
} from '@/lib/api';

import Sidebar from '../../components/Sidebar';

type DateRangeKey = '7' | '28' | '90';

interface DateRange {
  key: DateRangeKey;
  label: string;
  startDate: string;
  endDate: string;
}

function getDateRange(
  days: DateRangeKey,
): DateRange {
  const end = new Date();

  const start = new Date(end);
  start.setDate(
    start.getDate() -
      (Number(days) - 1),
  );

  return {
    key: days,
    label:
      days === '7'
        ? 'Last 7 days'
        : days === '28'
          ? 'Last 28 days'
          : 'Last 90 days',
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatDate(
  date: Date,
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1,
    ).padStart(2, '0');

  const day =
    String(
      date.getDate(),
    ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatNumber(
  value: number,
) {
  return new Intl.NumberFormat(
    'en-US',
  ).format(
    Math.round(value),
  );
}

function formatPercent(
  value: number,
) {
  return `${value.toFixed(1)}%`;
}

function formatDuration(
  seconds: number,
) {
  if (!Number.isFinite(seconds)) {
    return '0s';
  }

  const total =
    Math.max(
      0,
      Math.round(seconds),
    );

  const minutes =
    Math.floor(total / 60);

  const remaining =
    total % 60;

  if (minutes <= 0) {
    return `${remaining}s`;
  }

  return `${minutes}m ${String(
    remaining,
  ).padStart(2, '0')}s`;
}

function getLastActivityDate(
  rows: GoogleAnalyticsReportRow[],
) {
  const dates = rows
    .map((row: GoogleAnalyticsReportRow) => row.date)
    .filter(Boolean)
    .sort();

  return dates.length
    ? dates[dates.length - 1]
    : null;
}

function formatShortDate(
  value: string,
) {
  const date =
    new Date(
      `${value}T00:00:00`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    'en-IN',
    {
      day: 'numeric',
      month: 'short',
    },
  );
}

function sumRows(
  rows: GoogleAnalyticsReportRow[],
  key:
    | 'activeUsers'
    | 'newUsers'
    | 'sessions'
    | 'pageViews'
    | 'conversions',
) {
  return rows.reduce(
    (total, row) =>
      total +
      Number(row[key] ?? 0),
    0,
  );
}

function weightedEngagementRate(
  rows: GoogleAnalyticsReportRow[],
) {
  const sessions =
    sumRows(
      rows,
      'sessions',
    );

  if (!sessions) {
    return 0;
  }

  const weighted =
    rows.reduce(
      (total, row) =>
        total +
        Number(
          row.engagementRate ?? 0,
        ) *
          Number(
            row.sessions ?? 0,
          ),
      0,
    );

  return weighted / sessions;
}

function weightedDuration(
  rows: GoogleAnalyticsReportRow[],
) {
  const sessions =
    sumRows(
      rows,
      'sessions',
    );

  if (!sessions) {
    return 0;
  }

  const weighted =
    rows.reduce(
      (total, row) =>
        total +
        Number(
          row.averageSessionDuration ??
            0,
        ) *
          Number(
            row.sessions ?? 0,
          ),
      0,
    );

  return weighted / sessions;
}

export default function AnalyticsPage() {
  const [open, setOpen] = useState(false);
  const [
    properties,
    setProperties,
  ] = useState<
    GoogleAnalyticsProperty[]
  >([]);

  const [
    selectedProperty,
    setSelectedProperty,
  ] = useState('');

  const [
    report,
    setReport,
  ] = useState<
    GoogleAnalyticsReport | null
  >(null);

  const [
    selectedRange,
    setSelectedRange,
  ] = useState<DateRangeKey>(
    '28',
  );

  const [
    loadingProperties,
    setLoadingProperties,
  ] = useState(true);

  const [
    loadingReport,
    setLoadingReport,
  ] = useState(false);

  const [
    selectingProperty,
    setSelectingProperty,
  ] = useState(false);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    propertyError,
    setPropertyError,
  ] = useState('');

  const dateRange =
    useMemo(
      () =>
        getDateRange(
          selectedRange,
        ),
      [selectedRange],
    );

  const loadProperties =
    useCallback(
      async () => {
        try {
          setLoadingProperties(
            true,
          );
          setPropertyError('');

          const [
            connection,
            availableProperties,
          ] =
            await Promise.all([
              getGoogleConnectionStatus(),
              getGoogleAnalyticsProperties(),
            ]);

          setProperties(
            availableProperties ?? [],
          );

          const active =
            connection.selectedAnalyticsProperty ??
            '';

          if (
            active &&
            (
              availableProperties ??
              []
            ).some(
              (property) =>
                property.propertyId ===
                active,
            )
          ) {
            setSelectedProperty(
              active,
            );
          } else if (
            (
              availableProperties ??
              []
            ).length > 0
          ) {
            setSelectedProperty(
              availableProperties[0]?.propertyId ?? '',
            );
          } else {
            setSelectedProperty('');
          }
        } catch (err) {
          console.error(
            'Failed to load GA4 properties:',
            err,
          );

          setProperties([]);
          setSelectedProperty('');

          setPropertyError(
            err instanceof Error
              ? err.message
              : 'Unable to load Google Analytics 4 properties.',
          );
        } finally {
          setLoadingProperties(
            false,
          );
        }
      },
      [],
    );

  const loadReport =
    useCallback(
      async () => {
        if (!selectedProperty) {
          setReport(null);
          return;
        }

        try {
          setLoadingReport(
            true,
          );
          setError('');

          const data =
            await getGoogleAnalyticsReport(
              dateRange.startDate,
              dateRange.endDate,
            );

          setReport(data);
        } catch (err) {
          console.error(
            'Failed to load GA4 report:',
            err,
          );

          setReport(null);

          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load Google Analytics 4 data.',
          );
        } finally {
          setLoadingReport(
            false,
          );
        }
      },
      [
        selectedProperty,
        dateRange.startDate,
        dateRange.endDate,
      ],
    );

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handlePropertyChange =
    async (
      propertyId: string,
    ) => {
      if (
        !propertyId ||
        propertyId ===
          selectedProperty
      ) {
        return;
      }

      try {
        setSelectingProperty(
          true,
        );
        setError('');

        await selectGoogleAnalyticsProperty(
          propertyId,
        );

        setSelectedProperty(
          propertyId,
        );
      } catch (err) {
        console.error(
          'Failed to select GA4 property:',
          err,
        );

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to select Google Analytics property.',
        );
      } finally {
        setSelectingProperty(
          false,
        );
      }
    };

  const handleRefresh =
    async () => {
      try {
        setRefreshing(true);
        setError('');

        await loadProperties();
      } finally {
        setRefreshing(false);
      }
    };

  const rows =
    report?.rows ?? [];

  const lastActivityDate =
    getLastActivityDate(rows);

  const lastActivityLabel =
    lastActivityDate
      ? formatShortDate(lastActivityDate)
      : 'No recorded activity';

  const dataCoverageLabel =
    rows.length > 0
      ? `${rows.length} days with recorded data`
      : 'No recorded data';

  const totals =
    useMemo(() => {
      return {
        activeUsers:
          sumRows(
            rows,
            'activeUsers',
          ),

        newUsers:
          sumRows(
            rows,
            'newUsers',
          ),

        sessions:
          sumRows(
            rows,
            'sessions',
          ),

        pageViews:
          sumRows(
            rows,
            'pageViews',
          ),

        conversions:
          sumRows(
            rows,
            'conversions',
          ),

        engagementRate:
          weightedEngagementRate(
            rows,
          ),

        averageSessionDuration:
          weightedDuration(
            rows,
          ),
      };
    }, [rows]);

  const maxUsers =
    Math.max(
      1,
      ...rows.map(
        (row: GoogleAnalyticsReportRow) =>
          Number(
            row.activeUsers ?? 0,
          ),
      ),
    );

  const selectedPropertyData =
    properties.find(
      (property) =>
        property.propertyId ===
        selectedProperty,
    );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        mobileOpen={open}
        onClose={() => setOpen(false)}
      />

      <main className="lg:pl-[270px]">
        {/* TOP BAR */}

        <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 lg:px-8">
          <div className="flex items-center">
            <button
              type="button"
              className="mr-4 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <div>
              <div className="text-sm font-semibold text-slate-500">
              RENKO / Traffic & Analytics
            </div>

            <div className="mt-0.5 text-xs text-slate-400">
              Google Analytics 4 traffic,
              engagement and conversion intelligence
            </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={
              refreshing ||
              loadingProperties ||
              selectingProperty
            }
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              size={16}
              className={
                refreshing
                  ? 'animate-spin'
                  : ''
              }
            />

            Refresh
          </button>
        </header>

        <section className="mx-auto max-w-[1500px] p-5 lg:p-8">
          {/* HEADER */}

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:p-7">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                  <BarChart3
                    size={23}
                  />
                </div>

                <div>
                  <h1 className="text-2xl font-bold">
                    Traffic & Analytics
                  </h1>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                    Understand how people reach your
                    website, how they engage and whether
                    traffic is producing conversions.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-[280px]">
                  <div className="absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-400">
                    <Globe2
                      size={17}
                    />
                  </div>

                  <select
                    value={
                      selectedProperty
                    }
                    onChange={(event) =>
                      handlePropertyChange(
                        event.target.value,
                      )
                    }
                    disabled={
                      loadingProperties ||
                      selectingProperty ||
                      properties.length ===
                        0
                    }
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-10 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {properties.length ===
                    0 ? (
                      <option value="">
                        No GA4 property
                      </option>
                    ) : (
                      properties.map(
                        (
                          property,
                        ) => (
                          <option
                            key={
                              property.propertyId
                            }
                            value={
                              property.propertyId
                            }
                          >
                            {
                              property.displayName
                            }{' '}
                            (
                            {
                              property.propertyId
                            }
                            )
                          </option>
                        ),
                      )
                    )}
                  </select>
                </div>

                <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1">
                  {(
                    [
                      {
                        key: '7',
                        label: '7D',
                      },
                      {
                        key: '28',
                        label: '28D',
                      },
                      {
                        key: '90',
                        label: '90D',
                      },
                    ] as const
                  ).map(
                    (range) => (
                      <button
                        key={
                          range.key
                        }
                        type="button"
                        onClick={() =>
                          setSelectedRange(
                            range.key,
                          )
                        }
                        className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                          selectedRange ===
                          range.key
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {
                          range.label
                        }
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>

            {selectedPropertyData && (
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Active GA4 Property
                    </div>

                    <div className="mt-1 text-sm font-bold text-slate-800">
                      {
                        selectedPropertyData.displayName
                      }
                    </div>
                  </div>

                  <div className="text-xs text-slate-500">
                    Property ID:{' '}
                    <span className="font-semibold text-slate-700">
                      {
                        selectedPropertyData.propertyId
                      }
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ERROR */}

          {(error ||
            propertyError) && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
              <div className="flex items-start gap-3">
                <XCircle
                  size={20}
                  className="mt-0.5 shrink-0 text-red-600"
                />

                <div>
                  <div className="text-sm font-bold text-red-800">
                    Google Analytics error
                  </div>

                  <div className="mt-1 text-sm leading-6 text-red-700">
                    {error ||
                      propertyError}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* NO PROPERTY */}

          {!loadingProperties &&
            properties.length ===
              0 && (
              <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                <BarChart3
                  size={40}
                  className="mx-auto text-slate-300"
                />

                <h2 className="mt-4 text-lg font-bold">
                  No GA4 property available
                </h2>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Make sure the connected Google
                  account has access to at least one
                  Google Analytics 4 property.
                </p>
              </div>
            )}

          {/* LOADING */}

          {loadingProperties ||
            (loadingReport &&
              !report) ? (
            <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-12 shadow-sm">
              <div className="flex flex-col items-center justify-center text-center">
                <Loader2
                  size={32}
                  className="animate-spin text-violet-600"
                />

                <div className="mt-4 text-sm font-bold">
                  Loading GA4 analytics...
                </div>

                <div className="mt-1 text-sm text-slate-500">
                  RENKO is retrieving real traffic and
                  engagement data.
                </div>
              </div>
            </div>
          ) : (
            selectedProperty &&
            report && (
              <>
                {/* DATE */}

                <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
                  <CalendarDays
                    size={15}
                  />

                  <span>
                    {dateRange.label}
                  </span>

                  <span>
                    Ã¢â‚¬Â¢
                  </span>

                  <span>
                    {
                      dateRange.startDate
                    }{' '}
                    Ã¢â€ â€™{' '}
                    {
                      dateRange.endDate
                    }
                  </span>
                </div>

                {/* DATA TRUST / FRESHNESS */}

                <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-amber-600 shadow-sm">
                        <AlertTriangle size={19} />
                      </div>

                      <div>
                        <h2 className="text-sm font-bold text-slate-900">
                          RENKO Data Context
                        </h2>

                        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                          These metrics are historical GA4 observations for
                          the selected period. They should not be interpreted
                          as proof that the website is currently live,
                          healthy or receiving traffic right now.
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-[10px] font-bold text-amber-700">
                      <ShieldCheck size={14} />
                      Source: Google Analytics 4
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-amber-100 bg-white p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Last recorded activity
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-800">
                        {lastActivityLabel}
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-100 bg-white p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Data coverage
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-800">
                        {dataCoverageLabel}
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-100 bg-white p-4">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        Current website status
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-800">
                        Not verified by GA4
                      </div>
                    </div>
                  </div>
                </section>

                {/* METRICS */}

                <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    title="Active Users"
                    value={formatNumber(
                      totals.activeUsers,
                    )}
                    subtitle="Users active during the selected period"
                    icon={
                      <Users
                        size={18}
                      />
                    }
                  />

                  <MetricCard
                    title="Sessions"
                    value={formatNumber(
                      totals.sessions,
                    )}
                    subtitle="Total sessions recorded by GA4"
                    icon={
                      <Activity
                        size={18}
                      />
                    }
                  />

                  <MetricCard
                    title="Page Views"
                    value={formatNumber(
                      totals.pageViews,
                    )}
                    subtitle="Total page views recorded"
                    icon={
                      <Eye
                        size={18}
                      />
                    }
                  />

                  <MetricCard
                    title="Conversions"
                    value={formatNumber(
                      totals.conversions,
                    )}
                    subtitle="Conversions recorded by GA4"
                    icon={
                      <TrendingUp
                        size={18}
                      />
                    }
                  />
                </div>

                {/* SECONDARY METRICS */}

                <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  <MetricCard
                    title="New Users"
                    value={formatNumber(
                      totals.newUsers,
                    )}
                    subtitle="New users recorded in the selected period"
                    icon={
                      <UserPlus
                        size={18}
                      />
                    }
                    compact
                  />

                  <MetricCard
                    title="Engagement Rate"
                    value={formatPercent(
                      totals.engagementRate *
                        100,
                    )}
                    subtitle="Session-weighted engagement rate"
                    icon={
                      <BarChart3
                        size={18}
                      />
                    }
                    compact
                  />

                  <MetricCard
                    title="Avg. Session Duration"
                    value={formatDuration(
                      totals.averageSessionDuration,
                    )}
                    subtitle="Session-weighted average duration"
                    icon={
                      <Clock3
                        size={18}
                      />
                    }
                    compact
                  />
                </div>

                {/* TRAFFIC TREND */}

                <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold">
                        Traffic Trend
                      </h2>

                      <p className="mt-1 text-sm text-slate-500">
                        Daily active users reported by Google
                        Analytics 4.
                      </p>
                    </div>

                    <div className="rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">
                      {rows.length}{' '}
                      data points
                    </div>
                  </div>

                  {rows.length ===
                  0 ? (
                    <EmptyState />
                  ) : (
                    <div className="mt-6">
                      <div className="flex h-[280px] items-end gap-1 overflow-x-auto rounded-xl bg-slate-50 p-4">
                        {rows.map(
                          (
                            row: GoogleAnalyticsReportRow,
                            index: number,
                          ) => {
                            const users =
                              Number(
                                row.activeUsers ??
                                  0,
                              );

                            const height =
                              Math.max(
                                5,
                                (users /
                                  maxUsers) *
                                  100,
                              );

                            return (
                              <div
                                key={`${row.date}-${index}`}
                                className="group flex h-full min-w-[20px] flex-1 flex-col items-center justify-end"
                              >
                                <div className="pointer-events-none mb-2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[9px] font-bold text-white opacity-0 transition group-hover:opacity-100">
                                  {formatShortDate(
                                    (row.date ?? ''),
                                  )}{' '}
                                  Â·{' '}
                                  {formatNumber(
                                    users,
                                  )}{' '}
                                  users
                                </div>

                                <div
                                  className="w-full max-w-[34px] rounded-t-md bg-violet-500 transition-all group-hover:bg-violet-600"
                                  style={{
                                    height: `${height}%`,
                                  }}
                                />
                              </div>
                            );
                          },
                        )}
                      </div>

                      <div className="mt-3 flex justify-between text-[10px] text-slate-400">
                        <span>
                          {
                            rows[0]
                              ?.date
                          }
                        </span>

                        <span>
                          {
                            rows[
                              rows.length -
                                1
                            ]?.date
                          }
                        </span>
                      </div>
                    </div>
                  )}
                </section>

                {/* DAILY TABLE */}

                <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div>
                    <h2 className="text-lg font-bold">
                      Daily Analytics
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Actual daily GA4 metrics for the
                      selected property and period.
                    </p>
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[850px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <Th>
                            Date
                          </Th>

                          <Th>
                            Active Users
                          </Th>

                          <Th>
                            New Users
                          </Th>

                          <Th>
                            Sessions
                          </Th>

                          <Th>
                            Engagement
                          </Th>

                          <Th>
                            Avg. Duration
                          </Th>

                          <Th>
                            Page Views
                          </Th>

                          <Th>
                            Conversions
                          </Th>
                        </tr>
                      </thead>

                      <tbody>
                        {rows.map(
                          (
                            row: GoogleAnalyticsReportRow,
                            index: number,
                          ) => (
                            <tr
                              key={`${row.date}-${index}`}
                              className="border-b border-slate-50 transition hover:bg-slate-50"
                            >
                              <Td strong>
                                {formatShortDate(
                                  (row.date ?? ''),
                                )}
                              </Td>

                              <Td>
                                {formatNumber(
                                  (row.activeUsers ?? 0),
                                )}
                              </Td>

                              <Td>
                                {formatNumber(
                                  (row.newUsers ?? 0),
                                )}
                              </Td>

                              <Td>
                                {formatNumber(
                                  (row.sessions ?? 0),
                                )}
                              </Td>

                              <Td>
                                {formatPercent(
                                  (row.engagementRate ?? 0) *
                                    100,
                                )}
                              </Td>

                              <Td>
                                {formatDuration(
                                  (row.averageSessionDuration ?? 0),
                                )}
                              </Td>

                              <Td>
                                {formatNumber(
                                  (row.pageViews ?? 0),
                                )}
                              </Td>

                              <Td>
                                {formatNumber(
                                  (row.conversions ?? 0),
                                )}
                              </Td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>

                    {rows.length ===
                      0 && (
                      <EmptyState />
                    )}
                  </div>
                </section>

                {/* INSIGHT */}

                <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                      <TrendingUp
                        size={19}
                      />
                    </div>

                    <div>
                      <h2 className="text-sm font-bold">
                        RENKO Analytics Signal
                      </h2>

                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        RENKO uses the connected GA4
                        property as the source of truth for
                        measured traffic, engagement and conversion
                        metrics in the selected period. Historical
                        GA4 activity does not verify that the website
                        is currently reachable or operating normally.
                        Monetary revenue is not estimated unless
                        revenue data is actually available.
                      </p>
                    </div>
                  </div>
                </section>
              </>
            )
          )}
        </section>
      </main>
    </div>
  );
}

/* =========================================================
 * METRIC CARD
 * ========================================================= */

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  compact = false,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-100 bg-white shadow-sm ${
        compact
          ? 'p-5'
          : 'p-6'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-slate-500">
          {title}
        </div>

        <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
          {icon}
        </div>
      </div>

      <div
        className={`font-bold ${
          compact
            ? 'mt-3 text-2xl'
            : 'mt-4 text-3xl'
        }`}
      >
        {value}
      </div>

      <div className="mt-2 text-xs leading-5 text-slate-400">
        {subtitle}
      </div>
    </div>
  );
}

/* =========================================================
 * TABLE
 * ========================================================= */

function Th({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <th className="px-3 py-3 font-semibold text-slate-400">
      {children}
    </th>
  );
}

function Td({
  children,
  strong = false,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`px-3 py-3 ${
        strong
          ? 'font-semibold text-slate-700'
          : 'text-slate-500'
      }`}
    >
      {children}
    </td>
  );
}

/* =========================================================
 * EMPTY
 * ========================================================= */

function EmptyState() {
  return (
    <div className="mt-5 rounded-xl bg-slate-50 p-8 text-center text-xs text-slate-500">
      No GA4 data available for the selected period.
    </div>
  );
}

