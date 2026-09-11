"use client";

/*
 * RENKOO — ROI (V2 design-system pass).
 * UI ONLY: shared PageHeader / Panel / Metric / FilterBar /
 * DataTable / buttons / states. FunnelStages logic, ROI
 * calculations, spend CRUD, date filters, attribution logic
 * and all API calls are unchanged.
 */

import { FormEvent, useEffect, useState } from "react";
import {
  Globe2,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";

import AppShell from "@/components/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import Panel from "@/components/ui/Panel";
import Metric from "@/components/ui/Metric";
import FilterBar from "@/components/ui/FilterBar";
import DataTable, {
  type DataTableColumn,
} from "@/components/ui/DataTable";
import {
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "@/components/ui/states";
import { FunnelStages } from "@/components/charts/primitives";
import Link from "next/link";
import {
  createMarketingSpend,
  deleteMarketingSpend,
  getMarketingSpend,
  getRoiOutcome,
  getRoiSummary,
  getSearchRevenue,
  getWebsites,
  MarketingSpend,
  OutcomeResponse,
  RoiSummary,
  SearchRevenueResponse,
  Website,
} from "@/lib/api";

const STORAGE_KEY = "renkoo_website_id";

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function money(value: number, currency = "INR") {
  let formatter = moneyFormatters.get(currency);

  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    });

    moneyFormatters.set(currency, formatter);
  }

  return formatter.format(value || 0);
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

export default function RoiPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState("");

  const [data, setData] = useState<RoiSummary | null>(null);
  const [spends, setSpends] = useState<MarketingSpend[]>([]);

  const [outcome, setOutcome] =
    useState<OutcomeResponse | null>(null);
  const [outcomeLoading, setOutcomeLoading] = useState(false);
  const [outcomeError, setOutcomeError] = useState("");
  /* Phase 13 — search-to-revenue composition */
  const [searchRevenue, setSearchRevenue] =
    useState<SearchRevenueResponse | null>(null);
  const [srLoading, setSrLoading] = useState(false);
  const [srError, setSrError] = useState("");
  const [pendingDeleteSpend, setPendingDeleteSpend] =
    useState<MarketingSpend | null>(null);

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

  async function loadSearchRevenue(id: string) {
    if (!id) return;
    setSrLoading(true);
    setSrError("");
    try {
      const graph = await getSearchRevenue(id);
      setSearchRevenue(graph);
    } catch (err) {
      setSrError(
        err instanceof Error
          ? err.message
          : "Unable to load search-to-revenue.",
      );
      setSearchRevenue(null);
    } finally {
      setSrLoading(false);
    }
  }

  async function load(id: string) {
    if (!id) return;

    setLoading(true);
    setOutcomeLoading(true);
    setError("");
    setOutcomeError("");
    void loadSearchRevenue(id);

    try {
      const [roi, spendResponse, outcomeData] = await Promise.all([
        getRoiSummary(
          id,
          fromDate || undefined,
          toDate || undefined,
        ),
        getMarketingSpend(id),
        getRoiOutcome(
          id,
          fromDate || undefined,
          toDate || undefined,
        ).catch((err) => {
          setOutcomeError(
            err instanceof Error
              ? err.message
              : "Unable to load attribution and outcome.",
          );
          return null;
        }),
      ]);

      setData(roi);
      setSpends(spendResponse.spends || []);
      setOutcome(outcomeData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load ROI data.",
      );
    } finally {
      setLoading(false);
      setOutcomeLoading(false);
    }
  }

  useEffect(() => {
    async function initialise() {
      try {
        const result = await getWebsites();
        const list = result;

        setWebsites(list);

        if (list.length > 0) {
          const stored =
            typeof window !== "undefined"
              ? localStorage.getItem(STORAGE_KEY)
              : null;
          const valid =
            stored && list.some((site) => site.id === stored)
              ? stored
              : list[0].id;
          const firstWebsiteId = valid;
          setWebsiteId(firstWebsiteId);

          try {
            setOutcomeLoading(true);
            const [roi, spendResponse, outcomeData] = await Promise.all([
              getRoiSummary(firstWebsiteId),
              getMarketingSpend(firstWebsiteId),
              getRoiOutcome(firstWebsiteId).catch((err) => {
                setOutcomeError(
                  err instanceof Error
                    ? err.message
                    : "Unable to load attribution and outcome.",
                );
                return null;
              }),
            ]);

            setData(roi);
            setSpends(spendResponse.spends || []);
            setOutcome(outcomeData);
            void loadSearchRevenue(firstWebsiteId);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Unable to load ROI data.",
            );
          } finally {
            setOutcomeLoading(false);
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
    setOutcome(null);
    setOutcomeError("");
    setSearchRevenue(null);
    setSrError("");
    setPendingDeleteSpend(null);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    }
    await load(id);
  }

  async function saveSpend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingSpend) return;

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

    const target =
      spends.find((item) => item.id === id) || null;
    setPendingDeleteSpend(target);
  }

  async function confirmRemoveSpend() {
    const target = pendingDeleteSpend;
    if (!websiteId || !target) return;

    setDeletingSpend(target.id);
    setError("");

    try {
      await deleteMarketingSpend(websiteId, target.id);
      setPendingDeleteSpend(null);
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

  const activeWebsite =
    websites.find((site) => site.id === websiteId) || null;

  const spendColumns: DataTableColumn<MarketingSpend>[] = [
    {
      key: "date",
      label: "Date",
      priority: "high",
      render: (spend) =>
        new Date(spend.spendDate).toLocaleDateString("en-IN"),
    },
    {
      key: "source",
      label: "Source",
      priority: "high",
      render: (spend) => (
        <span className="font-semibold">{spend.source}</span>
      ),
    },
    {
      key: "campaign",
      label: "Campaign",
      priority: "medium",
      render: (spend) => spend.campaign || "—",
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      priority: "high",
      render: (spend) => (
        <span className="font-bold">
          {money(spend.amount, spend.currency)}
        </span>
      ),
    },
  ];

  const sourceColumns: DataTableColumn<{
    source: string;
    revenue: number;
    spend: number;
    profit: number;
    roi: number | null;
    roas: number | null;
  }>[] = [
    {
      key: "source",
      label: "Source",
      priority: "high",
      render: (item) => (
        <span className="font-semibold">{item.source}</span>
      ),
    },
    {
      key: "revenue",
      label: "Revenue",
      align: "right",
      priority: "high",
      render: (item) => money(item.revenue, currency),
    },
    {
      key: "spend",
      label: "Spend",
      align: "right",
      priority: "medium",
      render: (item) => money(item.spend, currency),
    },
    {
      key: "profit",
      label: "Profit",
      align: "right",
      priority: "medium",
      render: (item) => (
        <span className="font-semibold">
          {money(item.profit, currency)}
        </span>
      ),
    },
    {
      key: "roi",
      label: "ROI",
      align: "right",
      priority: "low",
      render: (item) => (
        <span className="font-semibold">{percent(item.roi)}</span>
      ),
    },
    {
      key: "roas",
      label: "ROAS",
      align: "right",
      priority: "low",
      render: (item) => (
        <span className="font-semibold">{ratio(item.roas)}</span>
      ),
    },
  ];

  return (
    <AppShell
      mobileOpen={mobileOpen}
      onClose={() => setMobileOpen(false)}
      onMenu={() => setMobileOpen(true)}
    >
      <div className="rk-page">
        <PageHeader
          eyebrow="Business Intelligence"
          title="Leads → Revenue → ROI"
          description="Understand which marketing investment is producing business results."
          meta={
            <>
              {activeWebsite ? (
                <span className="truncate">{activeWebsite.name}</span>
              ) : (
                <span>No website selected</span>
              )}
              {fromDate || toDate ? (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {fromDate || "…"} → {toDate || "…"}
                  </span>
                </>
              ) : null}
            </>
          }
          actions={
            <SecondaryButton
              onClick={() => websiteId && load(websiteId)}
              disabled={loading || !websiteId}
            >
              <RefreshCw
                size={14}
                aria-hidden
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </SecondaryButton>
          }
        />

        {/* Website context — preserved selection behavior */}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label
            htmlFor="roi-website"
            className="rk-field-label flex shrink-0 items-center gap-1.5"
          >
            <Globe2 size={13} aria-hidden className="text-rk-muted" />
            Website
          </label>

          <select
            id="roi-website"
            value={websiteId}
            onChange={(e) => handleWebsiteChange(e.target.value)}
            className="rk-focusable h-10 w-full max-w-md rounded-rk-md border border-rk-border bg-rk-surface px-3 text-sm font-semibold text-rk-ink shadow-rk-sm outline-none transition-all hover:border-rk-strong sm:w-auto sm:min-w-[240px]"
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
        </div>

        {/* Date range — shared FilterBar */}
        <div className="mt-4">
          <FilterBar
            dateRange={{
              from: fromDate,
              to: toDate,
              onChange: (range) => {
                setFromDate(range.from);
                setToDate(range.to);
              },
            }}
            dateLabel="Range"
            actions={
              <>
                <PrimaryButton size="sm" onClick={applyDateRange} disabled={loading || !websiteId}>
                  Apply
                </PrimaryButton>
                <SecondaryButton size="sm" onClick={resetDateRange} disabled={loading}>
                  Reset
                </SecondaryButton>
              </>
            }
            meta="Filter recognized revenue and marketing spend by date."
          />
        </div>

        {error ? (
          <div className="mt-4">
            <ErrorState
              title="Could not load ROI data"
              description={error}
              onRetry={() => websiteId && load(websiteId)}
            />
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4">
            <LoadingBlock title="Loading ROI…" lines={4} />
          </div>
        ) : null}

        {/* CONTENT */}
        {!loading && data && (
          <>
            {/* PRIMARY — Spend → Revenue → ROI story */}
            <section aria-label="Key metrics" className="mt-6">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                  Spend → Revenue → ROI
                </h2>
                <p className="rk-metadata hidden sm:block">
                  Primary business outcomes
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <Metric
                    label="Revenue"
                    value={money(data.totalRevenue, currency)}
                    detail={`${data.revenueTransactions} recognized transactions`}
                    tone="positive"
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <Metric
                    label="Marketing spend"
                    value={money(data.totalSpend, currency)}
                    detail={`${data.spendTransactions} spend transactions`}
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <Metric
                    label="ROI"
                    value={percent(data.roi)}
                    detail={
                      data.roi === null
                        ? "No spend available"
                        : "Return after marketing spend"
                    }
                    tone={data.roi === null ? "neutral" : "positive"}
                  />
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-4 shadow-rk-sm sm:p-5">
                  <Metric
                    label="ROAS"
                    value={ratio(data.roas)}
                    detail="Revenue generated per spend"
                  />
                </div>
              </div>
            </section>

            {/* PHASE 13 — Search → Revenue composition */}
            <section
              aria-label="Search to revenue"
              className="mt-6"
            >
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                  Search → Revenue
                </h2>
                <p className="rk-metadata hidden sm:block">
                  Evidence-backed, never proportional
                </p>
              </div>
              {srLoading ? (
                <LoadingBlock
                  title="Reading search-to-revenue…"
                  lines={3}
                />
              ) : srError ? (
                <ErrorState
                  title="Search-to-revenue unavailable"
                  description={srError}
                  onRetry={() =>
                    websiteId &&
                    loadSearchRevenue(websiteId)
                  }
                />
              ) : searchRevenue ? (
                <div className="grid gap-3">
                  <Panel
                    eyebrow="Funnel"
                    title="Search demand → visibility → traffic → leads → revenue"
                    description={`Windows — GSC: ${searchRevenue.window.gsc}. Outcomes: ${searchRevenue.window.outcomes}. Missing stages stay unavailable, never zero.`}
                  >
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {searchRevenue.funnel.map(
                        (stage) => (
                          <Metric
                            key={stage.stage}
                            label={stage.stage
                              .toLowerCase()
                              .replace(/_/g, " ")}
                            value={
                              stage.value === null
                                ? "unavailable"
                                : stage.stage === "REVENUE"
                                  ? money(
                                      stage.value,
                                    )
                                  : String(stage.value)
                            }
                            detail={stage.evidenceState.toLowerCase()}
                            tone={
                              stage.value === null
                                ? "neutral"
                                : undefined
                            }
                          />
                        ),
                      )}
                    </div>
                  </Panel>
                  <Panel
                    eyebrow="Pages"
                    title="Revenue-connected pages"
                    description="Each cell is independently evidence-backed. Unavailable stays unavailable."
                  >
                    {searchRevenue.pages.length > 0 ? (
                      <DataTable
                        caption="Page search-to-revenue"
                        columns={[
                          { key: "url", label: "Page" },
                          {
                            key: "clicks",
                            label: "Clicks",
                          },
                          {
                            key: "leads",
                            label: "Leads",
                          },
                          {
                            key: "revenue",
                            label: "Revenue",
                          },
                        ]}
                        rows={searchRevenue.pages
                          .slice(0, 8)
                          .map((row: any, index: number) => ({
                            ...row,
                            key: `${row.url}|${index}`,
                            url: String(
                              row.url || "—",
                            )
                              .replace(
                                /^https?:\/\//,
                                "",
                              )
                              .slice(0, 44),
                            clicks:
                              row.clicksState ===
                              "UNAVAILABLE"
                                ? "—"
                                : String(row.clicks),
                            leads:
                              row.leadsState ===
                              "UNAVAILABLE"
                                ? "—"
                                : String(row.leads),
                            revenue:
                              row.revenueState ===
                              "UNAVAILABLE" ||
                              row.revenue === null
                                ? "—"
                                : money(row.revenue),
                          }))}
                        keyOf={(row: any) => row.key}
                        emptyTitle="No page outcomes"
                        emptyDescription="No ranking pages with observed outcomes yet."
                      />
                    ) : (
                      <EmptyState
                        title="No page outcomes yet"
                        description="Connect ranking pages to leads to light up this view."
                      />
                    )}
                  </Panel>
                  <Panel
                    eyebrow="Diagnostics"
                    title="Visibility gaps and AI bridge"
                    description={searchRevenue.diagnostic.statement}
                  >
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Metric
                        label="AI mentions"
                        value={String(
                          searchRevenue.ai.mentions ?? 0,
                        )}
                        detail={`${searchRevenue.ai.citations ?? 0} citations observed`}
                      />
                      <Metric
                        label="AI traffic"
                        value="unavailable"
                        detail="Citation is not traffic"
                        tone="neutral"
                      />
                      <Metric
                        label="Search ROI"
                        value={
                          searchRevenue.roi.roiPercent ===
                          null
                            ? "unavailable"
                            : `${searchRevenue.roi.roiPercent.toFixed(1)}%`
                        }
                        detail={
                          searchRevenue.roi.evidenceState.toLowerCase()
                        }
                        tone={
                          searchRevenue.roi.roiPercent ===
                          null
                            ? "neutral"
                            : "positive"
                        }
                      />
                    </div>
                    {searchRevenue.gaps.length > 0 ? (
                      <ul className="mt-3 grid gap-2">
                        {searchRevenue.gaps.map(
                          (gap) => (
                            <li
                              key={gap.key}
                              className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3 text-sm text-rk-secondary"
                            >
                              {gap.statement}
                            </li>
                          ),
                        )}
                      </ul>
                    ) : null}
                  </Panel>
                </div>
              ) : null}
            </section>

            {/* SECONDARY — business impact */}
            <div className="mt-6">
              <Panel
                eyebrow="Secondary"
                title="Business impact"
                description="Actual revenue and acquisition economics."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                    <Metric
                      label="Profit after marketing"
                      value={money(data.profit, currency)}
                      detail="Revenue minus recorded marketing spend"
                    />
                  </div>

                  <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                    <Metric
                      label="Converted leads"
                      value={data.convertedLeads.toLocaleString("en-IN")}
                      detail="Leads marked as converted"
                    />
                  </div>

                  <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                    <Metric
                      label="Revenue / spend"
                      value={ratio(data.roas)}
                      detail="ROAS based on recognized revenue"
                    />
                  </div>
                </div>
              </Panel>
            </div>

            {/* Attribution insights */}
            <div className="mt-6">
              <Panel
                eyebrow="Attribution"
                title="Attribution insights"
                description="Where attributed performance concentrates — and what stays unattributed."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-rk-md border border-rk-border bg-rk-surface px-4 py-3.5 shadow-rk-sm">
                    <Metric
                      label="Best ROI source"
                      value={bestRoiSource ? bestRoiSource.source : "—"}
                      detail={
                        bestRoiSource
                          ? percent(bestRoiSource.roi)
                          : "No attributed ROI yet"
                      }
                    />
                  </div>

                  <div className="rounded-rk-md border border-rk-border bg-rk-surface px-4 py-3.5 shadow-rk-sm">
                    <Metric
                      label="Highest spend"
                      value={highestSpendSource ? highestSpendSource.source : "—"}
                      detail={
                        highestSpendSource
                          ? money(highestSpendSource.spend, currency)
                          : "No spend recorded"
                      }
                    />
                  </div>

                  <div className="rounded-rk-md border border-rk-border bg-rk-surface px-4 py-3.5 shadow-rk-sm">
                    <Metric
                      label="Unattributed"
                      value={money(
                        unattributedRevenue + unattributedSpend,
                        currency,
                      )}
                      detail={`Revenue ${money(unattributedRevenue, currency)} · Spend ${money(unattributedSpend, currency)}`}
                      tone="warning"
                    />
                  </div>
                </div>
              </Panel>
            </div>

            {/* ATTRIBUTION & OUTCOME — FunnelStages preserved */}
            <div className="mt-6">
              <Panel
                eyebrow="Funnel"
                title="Attribution & outcome"
                description="Lead-to-revenue funnel and attributed ROI for the selected website and date range."
              >
                {outcomeLoading ? (
                  <LoadingBlock title="Loading attribution and outcome…" />
                ) : outcomeError && !outcome ? (
                  <ErrorState
                    title="Attribution and outcome unavailable"
                    description={outcomeError}
                    onRetry={() => websiteId && load(websiteId)}
                  />
                ) : !outcome ? (
                  <EmptyState
                    title="No attribution data yet"
                    description="Record leads, revenue, and marketing spend to measure attribution and outcome."
                  />
                ) : (
                  <>
                    <FunnelStages
                      state="ready"
                      stages={[
                        ...(outcome.funnel.visitors !== null
                          ? [
                              {
                                label: "Visitors",
                                value: outcome.funnel.visitors,
                              },
                            ]
                          : []),
                        {
                          label: "Leads",
                          value: outcome.funnel.leads,
                        },
                        {
                          label: "Qualified",
                          value: outcome.funnel.qualified,
                        },
                        {
                          label: "Conversions",
                          value: outcome.funnel.conversions,
                        },
                      ]}
                      summary={`Leads ${outcome.funnel.leads}, qualified ${outcome.funnel.qualified}, conversions ${outcome.funnel.conversions}`}
                      emptyTitle="No funnel data yet"
                      emptyDescription="No leads recorded in range."
                    />

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                        <Metric
                          label="Attribution coverage"
                          value={
                            outcome.attribution.coverage !== null
                              ? `${outcome.attribution.coverage.toFixed(1)}%`
                              : "—"
                          }
                          detail={
                            outcome.attribution.coverage !== null
                              ? `${money(outcome.attribution.attributedRevenue, outcome.currency || currency)} of ${money(outcome.attribution.totalRevenue, outcome.currency || currency)} recognized revenue attributed`
                              : "No recognized revenue"
                          }
                        />
                      </div>

                      <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                        <Metric
                          label="Attributed ROI"
                          value={
                            outcome.roi.measurable &&
                            outcome.roi.attributedRoi !== null &&
                            outcome.roi.attributedRevenue > 0
                              ? `${outcome.roi.attributedRoi.toFixed(1)}%`
                              : "—"
                          }
                          detail={
                            outcome.roi.measurable &&
                            outcome.roi.attributedRoi !== null &&
                            outcome.roi.attributedRevenue > 0
                              ? `${money(outcome.roi.attributedRevenue, outcome.currency || currency)} attributed revenue against ${money(outcome.roi.spend, outcome.currency || currency)} spend`
                              : outcome.roi.spend <= 0
                                ? "No marketing spend is recorded in range."
                                : "No attributed revenue is recorded in range."
                          }
                        />
                      </div>

                      <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                        <Metric
                          label="Conversion rate"
                          value={
                            outcome.funnel.conversionRate !== null
                              ? `${outcome.funnel.conversionRate.toFixed(1)}%`
                              : "—"
                          }
                          detail={
                            outcome.funnel.conversionRate !== null
                              ? "Conversions against recorded leads in range"
                              : "Not measurable — no leads recorded"
                          }
                        />
                      </div>
                    </div>

                    {outcome.conversionGaps.length > 0 && (
                      <div className="mt-4 rounded-rk-md border border-rk-warning/30 bg-rk-warningSoft px-4 py-3.5">
                        <p className="rk-label">Conversion gaps</p>
                        <ul className="mt-2 space-y-2">
                          {outcome.conversionGaps.map((gap) => (
                            <li
                              key={gap.id}
                              className="text-sm leading-5 text-rk-secondary"
                            >
                              <span className="font-bold text-rk-ink">
                                {gap.title}
                              </span>{" "}
                              — {gap.description}
                            </li>
                          ))}
                        </ul>
                        <Link
                          href="/opportunities"
                          className="rk-focusable mt-3 inline-flex text-sm font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
                        >
                          Review in Opportunities
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </Panel>
            </div>

            {/* MARKETING SPEND */}
            <div id="roi-spend" className="mt-6 scroll-mt-24">
              <Panel
                eyebrow="Investment"
                title="Marketing investment"
                description="Record real campaign costs so ROI can be measured."
                actions={
                  <SecondaryButton
                    size="sm"
                    onClick={() => setShowSpendForm((value) => !value)}
                  >
                    <Plus size={14} aria-hidden />
                    {showSpendForm ? "Hide form" : "Add spend"}
                  </SecondaryButton>
                }
                padded={false}
              >
                {showSpendForm && (
                  <form
                    onSubmit={saveSpend}
                    className="border-b border-rk-border bg-rk-soft/60 px-4 py-4 sm:px-5"
                  >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="block">
                        <span className="rk-field-label">Amount</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={spendAmount}
                          onChange={(e) => setSpendAmount(e.target.value)}
                          placeholder="10000"
                          className="rk-input mt-1.5"
                        />
                      </label>

                      <label className="block">
                        <span className="rk-field-label">Source</span>
                        <input
                          value={spendSource}
                          onChange={(e) => setSpendSource(e.target.value)}
                          placeholder="Google Ads"
                          className="rk-input mt-1.5"
                        />
                      </label>

                      <label className="block">
                        <span className="rk-field-label">Campaign</span>
                        <input
                          value={spendCampaign}
                          onChange={(e) => setSpendCampaign(e.target.value)}
                          placeholder="Summer campaign"
                          className="rk-input mt-1.5"
                        />
                      </label>

                      <label className="block">
                        <span className="rk-field-label">Spend date</span>
                        <input
                          type="date"
                          value={spendDate}
                          onChange={(e) => setSpendDate(e.target.value)}
                          className="rk-input mt-1.5"
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex justify-end gap-2">
                      <SecondaryButton
                        size="sm"
                        onClick={() => setShowSpendForm(false)}
                      >
                        Cancel
                      </SecondaryButton>

                      <PrimaryButton size="sm" type="submit" disabled={savingSpend}>
                        {savingSpend ? "Saving…" : "Save spend"}
                      </PrimaryButton>
                    </div>
                  </form>
                )}

                <div className="px-2 py-2 sm:px-3">
                  <DataTable
                    caption="Marketing spend"
                    columns={spendColumns}
                    rows={spends}
                    keyOf={(spend) => spend.id}
                    loading={false}
                    emptyTitle="No marketing spend recorded"
                    emptyDescription="Add real campaign spend to make ROI meaningful."
                    rowActions={(spend) => [
                      {
                        label:
                          deletingSpend === spend.id
                            ? "Deleting…"
                            : "Delete",
                        onSelect: () => removeSpend(spend.id),
                      },
                    ]}
                    renderExpanded={(spend) => (
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <p className="rk-field-label">Campaign</p>
                          <p className="mt-0.5 font-medium text-rk-ink">
                            {spend.campaign || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="rk-field-label">Amount</p>
                          <p className="rk-number mt-0.5 font-bold text-rk-ink">
                            {money(spend.amount, spend.currency)}
                          </p>
                        </div>
                      </div>
                    )}
                    density="compact"
                  />
                </div>
              </Panel>
            </div>

            {/* SOURCE PERFORMANCE */}
            <div className="mt-6">
              <Panel
                eyebrow="Attribution"
                title="Performance by source"
                description="Compare actual recognized revenue against recorded marketing investment."
                footer={
                  unattributedRevenue > 0 || unattributedSpend > 0 ? (
                    <span>
                      <strong className="text-rk-ink">Attribution gap:</strong>{" "}
                      {unattributedRevenue > 0 &&
                        `${money(unattributedRevenue, currency)} revenue is not mapped to a source. `}
                      {unattributedSpend > 0 &&
                        `${money(unattributedSpend, currency)} spend is not mapped to a revenue source.`}
                    </span>
                  ) : undefined
                }
              >
                <DataTable
                  caption="Performance by source"
                  columns={sourceColumns}
                  rows={data.bySource}
                  keyOf={(item) => item.source}
                  loading={false}
                  emptyTitle="No source attribution data available yet"
                  emptyDescription="Recognized revenue and spend will appear here once recorded with sources."
                  renderExpanded={(item) => (
                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      <div>
                        <p className="rk-field-label">Spend</p>
                        <p className="mt-0.5 font-semibold text-rk-ink">
                          {money(item.spend, currency)}
                        </p>
                      </div>
                      <div>
                        <p className="rk-field-label">ROI</p>
                        <p className="mt-0.5 font-semibold text-rk-ink">
                          {percent(item.roi)}
                        </p>
                      </div>
                      <div>
                        <p className="rk-field-label">ROAS</p>
                        <p className="mt-0.5 font-semibold text-rk-ink">
                          {ratio(item.roas)}
                        </p>
                      </div>
                    </div>
                  )}
                  density="compact"
                />
              </Panel>
            </div>

            {/* ATTRIBUTION QUALITY */}
            <div className="mt-6">
              <Panel
                eyebrow="Methodology"
                title="Attribution quality"
                description="ROI is calculated from recognized revenue and recorded marketing spend. Source-level performance depends on the source values attached to those records. Unattributed amounts are kept separate instead of being assigned artificially."
              >
                <div className="flex items-start gap-2.5">
                  <Users
                    size={16}
                    aria-hidden
                    className="mt-0.5 shrink-0 text-rk-muted"
                  />
                  <p className="text-[13px] leading-5 text-rk-secondary">
                    Only recorded transactions feed this page — nothing
                    is estimated. Connect leads, revenue and spend to
                    sharpen attribution.
                  </p>
                </div>
              </Panel>
            </div>
          </>
        )}

        {/* EMPTY */}
        {!loading && !data && !error && (
          <div className="mt-6">
            <EmptyState
              title="ROI data is not available yet"
              description="Connect revenue and marketing spend data to measure business ROI."
              actionLabel="Record leads & revenue"
              actionHref="/leads"
            />
            <p className="mt-3 text-center text-sm">
              <a
                href="#roi-spend"
                className="rk-focusable font-bold text-rk-ink underline decoration-rk-border-strong underline-offset-4 hover:decoration-rk-ink"
              >
                Add marketing spend
              </a>
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDeleteSpend !== null}
        title="Delete marketing spend?"
        description={`Delete ${pendingDeleteSpend ? money(pendingDeleteSpend.amount, pendingDeleteSpend.currency) : "this spend"} for "${pendingDeleteSpend?.source || "unknown source"}"? This cannot be undone.`}
        confirmLabel="Delete spend"
        confirming={deletingSpend !== null}
        onConfirm={confirmRemoveSpend}
        onCancel={() => setPendingDeleteSpend(null)}
      />
    </AppShell>
  );
}
