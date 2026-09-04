"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  DollarSign,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import Sidebar from "@/components/Sidebar";
import {
  createMarketingSpend,
  deleteMarketingSpend,
  getMarketingSpend,
  getRoiSummary,
  getWebsites,
  MarketingSpend,
  RoiSummary,
  Website,
} from "@/lib/api";

function money(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function percent(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(1)}%`;
}

function ratio(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(2)}x`;
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="text-slate-400">{icon}</div>
      </div>

      <div className="mt-3 text-2xl font-semibold text-slate-900">
        {value}
      </div>

      {detail && (
        <div className="mt-1 text-sm text-slate-500">
          {detail}
        </div>
      )}
    </div>
  );
}

function Insight({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {title}
      </div>

      <div className="mt-3 truncate text-lg font-semibold text-slate-900">
        {value}
      </div>

      <div className="mt-1 text-sm text-slate-500">
        {detail}
      </div>
    </div>
  );
}

function Impact({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {title}
      </div>
      <div className="mt-2 text-lg font-semibold text-slate-900">
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">
        {detail}
      </div>
    </div>
  );
}

export default function RoiPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState("");

  const [data, setData] = useState<RoiSummary | null>(null);
  const [spends, setSpends] = useState<MarketingSpend[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [mobileOpen, setMobileOpen] = useState(false);

  const [showSpendForm, setShowSpendForm] = useState(false);
  const [spendAmount, setSpendAmount] = useState("");
  const [spendSource, setSpendSource] = useState("");
  const [spendCampaign, setSpendCampaign] = useState("");
  const [spendDate, setSpendDate] = useState("");
  const [savingSpend, setSavingSpend] = useState(false);
  const [deletingSpend, setDeletingSpend] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  async function load(id: string) {
    if (!id) return;

    setLoading(true);
    setError("");

    try {
      const [roi, spendResponse] = await Promise.all([
        getRoiSummary(
          id,
          fromDate || undefined,
          toDate || undefined,
        ),
        getMarketingSpend(id),
      ]);

      setData(roi);
      setSpends(spendResponse.spends || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load ROI data.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function initialise() {
      try {
        const result = await getWebsites();
        const list = result;

        setWebsites(list);

        if (list.length > 0) {
          const firstWebsiteId = list[0].id;
          setWebsiteId(firstWebsiteId);

          try {
            const [roi, spendResponse] = await Promise.all([
              getRoiSummary(firstWebsiteId),
              getMarketingSpend(firstWebsiteId),
            ]);

            setData(roi);
            setSpends(spendResponse.spends || []);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Unable to load ROI data.",
            );
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load websites.",
        );
      } finally {
        setLoading(false);
      }
    }

    initialise();
  }, []);

  async function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    setFromDate("");
    setToDate("");
    await load(id);
  }

  async function saveSpend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!websiteId) {
      setError("Select a website first.");
      return;
    }

    const amount = Number(spendAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid spend amount.");
      return;
    }

    if (!spendSource.trim()) {
      setError("Enter a marketing source.");
      return;
    }

    setSavingSpend(true);
    setError("");

    try {
      await createMarketingSpend(websiteId, {
        amount,
        source: spendSource.trim(),
        campaign: spendCampaign.trim() || undefined,
        spendDate: spendDate
          ? new Date(`${spendDate}T12:00:00`).toISOString()
          : undefined,
      });

      setSpendAmount("");
      setSpendSource("");
      setSpendCampaign("");
      setSpendDate("");
      setShowSpendForm(false);

      await load(websiteId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save marketing spend.",
      );
    } finally {
      setSavingSpend(false);
    }
  }

  async function removeSpend(id: string) {
    if (!websiteId) return;

    setDeletingSpend(id);
    setError("");

    try {
      await deleteMarketingSpend(websiteId, id);
      await load(websiteId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete marketing spend.",
      );
    } finally {
      setDeletingSpend(null);
    }
  }

  function applyDateRange() {
    if (!websiteId) return;

    if (fromDate && toDate && fromDate > toDate) {
      setError("From date cannot be after To date.");
      return;
    }

    load(websiteId);
  }

  function resetDateRange() {
    setFromDate("");
    setToDate("");

    if (websiteId) {
      setTimeout(() => load(websiteId), 0);
    }
  }

  const currency = data?.currency || "INR";

  const attributedRevenue =
    data?.bySource?.reduce(
      (sum, item) => sum + item.revenue,
      0,
    ) || 0;

  const attributedSpend =
    data?.bySource?.reduce(
      (sum, item) => sum + item.spend,
      0,
    ) || 0;

  const unattributedRevenue = data
    ? Math.max(0, data.totalRevenue - attributedRevenue)
    : 0;

  const unattributedSpend = data
    ? Math.max(0, data.totalSpend - attributedSpend)
    : 0;

  const bestRoiSource =
    data?.bySource
      ?.filter((item) => item.roi !== null)
      .sort(
        (a, b) =>
          (b.roi ?? -Infinity) -
          (a.roi ?? -Infinity),
      )[0] || null;

  const highestSpendSource =
    data?.bySource?.sort(
      (a, b) => b.spend - a.spend,
    )[0] || null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <main className="lg:pl-64">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">

          {/* HEADER */}
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-slate-500" />
                <span className="text-sm font-medium text-slate-500">
                  Business Intelligence
                </span>
              </div>

              <h1 className="mt-1 text-2xl font-semibold text-slate-900">
                Leads → Revenue → ROI
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Understand which marketing investment is producing business results.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={websiteId}
                onChange={(e) =>
                  handleWebsiteChange(e.target.value)
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none"
              >
                {websites.length === 0 && (
                  <option value="">No websites</option>
                )}

                {websites.map((website) => (
                  <option key={website.id} value={website.id}>
                    {website.name || website.url}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  websiteId && load(websiteId)
                }
                disabled={loading || !websiteId}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    loading ? "animate-spin" : ""
                  }`}
                />
                Refresh
              </button>
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* DATE RANGE */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  ROI date range
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Filter recognized revenue and marketing spend by date.
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="text-xs font-medium text-slate-600">
                  From
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) =>
                      setFromDate(e.target.value)
                    }
                    className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                  />
                </label>

                <label className="text-xs font-medium text-slate-600">
                  To
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) =>
                      setToDate(e.target.value)
                    }
                    className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400"
                  />
                </label>

                <button
                  type="button"
                  onClick={applyDateRange}
                  disabled={loading || !websiteId}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Apply
                </button>

                <button
                  type="button"
                  onClick={resetDateRange}
                  disabled={loading}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* LOADING */}
          {loading && (
            <div className="grid gap-4 md:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div
                  key={item}
                  className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white"
                />
              ))}
            </div>
          )}

          {/* CONTENT */}
          {!loading && data && (
            <>
              {/* KPI CARDS */}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Metric
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Revenue"
                  value={money(data.totalRevenue, currency)}
                  detail={`${data.revenueTransactions} recognized transactions`}
                />

                <Metric
                  icon={<Wallet className="h-4 w-4" />}
                  label="Marketing spend"
                  value={money(data.totalSpend, currency)}
                  detail={`${data.spendTransactions} spend transactions`}
                />

                <Metric
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="ROI"
                  value={percent(data.roi)}
                  detail={
                    data.roi === null
                      ? "No spend available"
                      : "Return after marketing spend"
                  }
                />

                <Metric
                  icon={<ArrowUpRight className="h-4 w-4" />}
                  label="ROAS"
                  value={ratio(data.roas)}
                  detail="Revenue generated per spend"
                />
              </div>

              {/* BUSINESS IMPACT */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Business impact
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Actual revenue and acquisition economics.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <Impact
                    title="Profit after marketing"
                    value={money(data.profit, currency)}
                    detail="Revenue minus recorded marketing spend"
                  />

                  <Impact
                    title="Converted leads"
                    value={data.convertedLeads.toLocaleString("en-IN")}
                    detail="Leads marked as converted"
                  />

                  <Impact
                    title="Revenue / spend"
                    value={ratio(data.roas)}
                    detail="ROAS based on recognized revenue"
                  />
                </div>
              </div>

              {/* ATTRIBUTION INSIGHTS */}
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <Insight
                  title="Best ROI source"
                  value={
                    bestRoiSource
                      ? bestRoiSource.source
                      : "—"
                  }
                  detail={
                    bestRoiSource
                      ? percent(bestRoiSource.roi)
                      : "No attributed ROI yet"
                  }
                />

                <Insight
                  title="Highest spend"
                  value={
                    highestSpendSource
                      ? highestSpendSource.source
                      : "—"
                  }
                  detail={
                    highestSpendSource
                      ? money(
                          highestSpendSource.spend,
                          currency,
                        )
                      : "No spend recorded"
                  }
                />

                <Insight
                  title="Unattributed"
                  value={money(
                    unattributedRevenue +
                      unattributedSpend,
                    currency,
                  )}
                  detail={`Revenue ${money(
                    unattributedRevenue,
                    currency,
                  )} · Spend ${money(
                    unattributedSpend,
                    currency,
                  )}`}
                />
              </div>

              {/* MARKETING SPEND */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      Marketing investment
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Record real campaign costs so ROI can be measured.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setShowSpendForm((value) => !value)
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Add spend
                  </button>
                </div>

                {showSpendForm && (
                  <form
                    onSubmit={saveSpend}
                    className="border-b border-slate-100 bg-slate-50 p-6"
                  >
                    <div className="grid gap-4 md:grid-cols-4">
                      <label className="text-xs font-medium text-slate-600">
                        Amount
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={spendAmount}
                          onChange={(e) =>
                            setSpendAmount(e.target.value)
                          }
                          placeholder="10000"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                        />
                      </label>

                      <label className="text-xs font-medium text-slate-600">
                        Source
                        <input
                          value={spendSource}
                          onChange={(e) =>
                            setSpendSource(e.target.value)
                          }
                          placeholder="Google Ads"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                        />
                      </label>

                      <label className="text-xs font-medium text-slate-600">
                        Campaign
                        <input
                          value={spendCampaign}
                          onChange={(e) =>
                            setSpendCampaign(e.target.value)
                          }
                          placeholder="Summer campaign"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                        />
                      </label>

                      <label className="text-xs font-medium text-slate-600">
                        Spend date
                        <input
                          type="date"
                          value={spendDate}
                          onChange={(e) =>
                            setSpendDate(e.target.value)
                          }
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setShowSpendForm(false)
                        }
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        disabled={savingSpend}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {savingSpend
                          ? "Saving..."
                          : "Save spend"}
                      </button>
                    </div>
                  </form>
                )}

                {spends.length === 0 ? (
                  <div className="p-8 text-center">
                    <Wallet className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      No marketing spend recorded
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Add real campaign spend to make ROI meaningful.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-6 py-3 font-medium">
                            Date
                          </th>
                          <th className="px-6 py-3 font-medium">
                            Source
                          </th>
                          <th className="px-6 py-3 font-medium">
                            Campaign
                          </th>
                          <th className="px-6 py-3 text-right font-medium">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-right font-medium">
                            Action
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {spends.map((spend) => (
                          <tr
                            key={spend.id}
                            className="border-b border-slate-50 last:border-0"
                          >
                            <td className="px-6 py-4 text-slate-600">
                              {new Date(
                                spend.spendDate,
                              ).toLocaleDateString("en-IN")}
                            </td>

                            <td className="px-6 py-4 font-medium text-slate-900">
                              {spend.source}
                            </td>

                            <td className="px-6 py-4 text-slate-600">
                              {spend.campaign || "—"}
                            </td>

                            <td className="px-6 py-4 text-right font-medium text-slate-900">
                              {money(
                                spend.amount,
                                spend.currency,
                              )}
                            </td>

                            <td className="px-6 py-4 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  removeSpend(spend.id)
                                }
                                disabled={
                                  deletingSpend === spend.id
                                }
                                className="inline-flex rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                title="Delete spend"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SOURCE PERFORMANCE */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 p-6">
                  <h2 className="text-base font-semibold text-slate-900">
                    Performance by source
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Compare actual recognized revenue against recorded marketing investment.
                  </p>
                </div>

                {data.bySource.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    No source attribution data available yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                          <th className="px-6 py-3 font-medium">
                            Source
                          </th>
                          <th className="px-6 py-3 text-right font-medium">
                            Revenue
                          </th>
                          <th className="px-6 py-3 text-right font-medium">
                            Spend
                          </th>
                          <th className="px-6 py-3 text-right font-medium">
                            Profit
                          </th>
                          <th className="px-6 py-3 text-right font-medium">
                            ROI
                          </th>
                          <th className="px-6 py-3 text-right font-medium">
                            ROAS
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {data.bySource.map((item) => (
                          <tr
                            key={item.source}
                            className="border-b border-slate-50 last:border-0"
                          >
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {item.source}
                            </td>

                            <td className="px-6 py-4 text-right text-slate-700">
                              {money(
                                item.revenue,
                                currency,
                              )}
                            </td>

                            <td className="px-6 py-4 text-right text-slate-700">
                              {money(
                                item.spend,
                                currency,
                              )}
                            </td>

                            <td className="px-6 py-4 text-right font-medium text-slate-900">
                              {money(
                                item.profit,
                                currency,
                              )}
                            </td>

                            <td className="px-6 py-4 text-right font-medium text-slate-900">
                              {percent(item.roi)}
                            </td>

                            <td className="px-6 py-4 text-right font-medium text-slate-900">
                              {ratio(item.roas)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {(unattributedRevenue > 0 ||
                  unattributedSpend > 0) && (
                  <div className="border-t border-amber-100 bg-amber-50 px-6 py-4 text-sm text-amber-800">
                    <span className="font-medium">
                      Attribution gap:
                    </span>{" "}
                    {unattributedRevenue > 0 &&
                      `${money(
                        unattributedRevenue,
                        currency,
                      )} revenue is not mapped to a source. `}
                    {unattributedSpend > 0 &&
                      `${money(
                        unattributedSpend,
                        currency,
                      )} spend is not mapped to a revenue source.`}
                  </div>
                )}
              </div>

              {/* CONVERSION NOTE */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-5 w-5 text-slate-400" />

                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Attribution quality
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      ROI is calculated from recognized revenue and recorded marketing spend.
                      Source-level performance depends on the source values attached to those records.
                      Unattributed amounts are kept separate instead of being assigned artificially.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* EMPTY */}
          {!loading && !data && !error && (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <BarChart3 className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                ROI data is not available yet
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Connect revenue and marketing spend data to measure business ROI.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

