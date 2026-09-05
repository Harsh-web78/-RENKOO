"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  Loader2,
  RefreshCw,
  LockKeyhole,
  AlertTriangle,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import {
  cancelBillingSubscription,
  getBillingEntitlements,
  getBillingInvoices,
  getBillingPlans,
  getBillingProvider,
  getBillingSubscription,
  getBillingUsage,
  getCurrentAccount,
  openBillingPortal,
  startBillingCheckout,
  startBillingTrial,
  BillingEntitlements,
  BillingInvoice,
  BillingPlan,
  BillingSubscription,
  BillingUsage,
} from "@/lib/api";

const USAGE_LABELS: Record<string, string> = {
  WEBSITES: "Websites",
  KEYWORDS: "Keywords",
  COMPETITORS: "Competitors",
  AI_PROMPTS: "AI prompts",
  AI_SCANS: "AI scans",
  USERS: "Team seats",
  CLIENTS: "Clients",
  REPORTS: "Reports",
  CRAWL_CREDITS: "Crawl credits",
  API_CALLS: "API calls",
  AI_CREDITS: "AI credits",
};

const FEATURE_LABELS: Record<string, string> = {
  whiteLabel: "White label",
  scheduledReports: "Scheduled reports",
  agency: "Agency features",
  api: "API access",
  advancedMonitoring: "Advanced monitoring",
};

function money(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString();
}

export default function BillingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] =
    useState<BillingSubscription | null>(null);
  const [entitlements, setEntitlements] =
    useState<BillingEntitlements | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(
    null,
  );
  const [provider, setProvider] = useState(true);
  const [invoices, setInvoices] = useState<BillingInvoice[]>(
    [],
  );
  const [invoicesNote, setInvoicesNote] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [yearly, setYearly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);

  const loadBilling = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const account = await getCurrentAccount();
      const orgId = account.organization.id;
      setOrganizationId(orgId);

      const [
        plansData,
        entitlementsData,
        usageData,
        providerData,
        subscriptionData,
        invoiceData,
      ] = await Promise.all([
        getBillingPlans(),
        getBillingEntitlements(),
        getBillingUsage(),
        getBillingProvider().catch(() => ({
          provider: false,
        })),
        getBillingSubscription(orgId).catch(() => null),
        getBillingInvoices().catch(() => ({
          provider: false,
          invoices: [],
          reason: "Payment history unavailable.",
        })),
      ]);

      setPlans(
        Array.isArray(plansData) ? plansData : [],
      );
      setEntitlements(entitlementsData);
      setUsage(usageData);
      setProvider(providerData.provider);
      setSubscription(subscriptionData);
      setInvoices(invoiceData.invoices ?? []);
      setInvoicesNote(invoiceData.reason ?? "");
    } catch (err: any) {
      setError(
        err?.message || "Unable to load billing information.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  async function handleCheckout(planCode: string) {
    if (!organizationId || busy) return;

    try {
      setBusy(planCode);
      setError("");
      setNotice("");

      const session = await startBillingCheckout(
        organizationId,
        planCode,
        yearly,
      );

      if (session.checkoutUrl) {
        window.location.href = session.checkoutUrl;
        return;
      }

      setNotice("Checkout session created.");
    } catch (err: any) {
      const message =
        typeof err?.message === "string"
          ? err.message
          : "Checkout failed.";

      if (/not connected|not configured/i.test(message)) {
        setNotice(
          "Online checkout is not connected for this workspace yet. Your current plan and data are unchanged — contact sales to upgrade.",
        );
      } else {
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  }

  async function handlePortal() {
    if (busy) return;

    try {
      setBusy("portal");
      setError("");
      setNotice("");

      const session = await openBillingPortal();

      if (session.portalUrl) {
        window.location.href = session.portalUrl;
      }
    } catch (err: any) {
      const message =
        typeof err?.message === "string"
          ? err.message
          : "Portal unavailable.";

      if (/not configured/i.test(message)) {
        setNotice(
          "Customer billing portal is not configured for this workspace yet.",
        );
      } else {
        setError(message);
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    if (busy) return;

    const confirmed = window.confirm(
      "Cancel your subscription at the end of the current period? Your websites, clients, reports and history are preserved — only new usage is limited afterward.",
    );

    if (!confirmed) return;

    try {
      setBusy("cancel");
      setError("");

      const updated = await cancelBillingSubscription();
      setSubscription(updated);
      setNotice(
        "Subscription will cancel at the end of the current period. All data is preserved.",
      );
      await loadBilling();
    } catch (err: any) {
      setError(
        err?.message || "Cancellation failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleTrial() {
    if (!organizationId || busy) return;

    try {
      setBusy("trial");
      setError("");

      const created = await startBillingTrial(
        organizationId,
      );
      setSubscription(created);
      setNotice("Trial started.");
      await loadBilling();
    } catch (err: any) {
      setError(
        err?.message || "Could not start trial.",
      );
    } finally {
      setBusy(null);
    }
  }

  const currentCode =
    entitlements?.planCode || subscription?.plan?.code || "FREE";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        mobileOpen={open}
        onClose={() => setOpen(false)}
      />

      <main className="lg:pl-[270px]">
        <section className="mx-auto max-w-[1500px] p-5 lg:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Billing & Plans
              </div>
              <h1 className="mt-1 text-3xl font-bold">
                Subscription
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Plan, usage, limits and payment history for this
                workspace. Downgrades never delete data.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadBilling()}
              disabled={loading}
              className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw
                size={15}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0"
              />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              {notice}
            </div>
          )}

          {!provider && (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <LockKeyhole
                size={17}
                className="mt-0.5 shrink-0"
              />
              <span>
                Online payments are not connected for this
                installation. Plans, usage and limits below are
                real; checkout and invoices activate once a
                payment provider is configured.
              </span>
            </div>
          )}

          {loading ? (
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              Loading billing...
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Current plan
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {entitlements?.planName || "Free"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Status:{" "}
                    <span className="font-bold text-slate-800">
                      {entitlements?.status || "FREE"}
                    </span>
                    {entitlements?.cancelAtPeriodEnd && (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        CANCELING
                      </span>
                    )}
                  </div>
                  {entitlements?.trialEnd && (
                    <div className="mt-1 text-xs text-slate-500">
                      Trial ends{" "}
                      {formatDate(entitlements.trialEnd)}
                    </div>
                  )}
                  {entitlements?.currentPeriodEnd && (
                    <div className="mt-1 text-xs text-slate-500">
                      Renews{" "}
                      {formatDate(
                        entitlements.currentPeriodEnd,
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {!subscription && (
                      <button
                        type="button"
                        disabled={busy === "trial"}
                        onClick={handleTrial}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {busy === "trial"
                          ? "Starting..."
                          : "Start free trial"}
                      </button>
                    )}
                    {subscription &&
                      !subscription.cancelAtPeriodEnd && (
                        <button
                          type="button"
                          disabled={busy === "cancel"}
                          onClick={handleCancel}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {busy === "cancel"
                            ? "Canceling..."
                            : "Cancel at period end"}
                        </button>
                      )}
                    <button
                      type="button"
                      disabled={busy === "portal"}
                      onClick={handlePortal}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {busy === "portal"
                        ? "Opening..."
                        : "Customer portal"}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Usage & limits
                  </div>

                  {!usage ? (
                    <p className="mt-3 text-sm text-slate-400">
                      Usage unavailable.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {Object.entries(usage.usage).map(
                        ([metric, item]) => (
                          <div
                            key={metric}
                            className="rounded-xl border border-slate-100 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-600">
                                {USAGE_LABELS[metric] ||
                                  metric}
                              </span>
                              <span className="text-xs font-bold tabular-nums text-slate-900">
                                {item.used === null
                                  ? "—"
                                  : `${item.used}/${item.limit}`}
                              </span>
                            </div>
                            {item.used !== null ? (
                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${
                                    item.remaining === 0
                                      ? "bg-red-500"
                                      : "bg-slate-900"
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.round(
                                        (item.used /
                                          Math.max(
                                            item.limit,
                                            1,
                                          )) *
                                          100,
                                      ),
                                    )}%`,
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="mt-2 text-[11px] text-slate-400">
                                Not reliably measurable —
                                unavailable, never zero-filled.
                              </div>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>

              {entitlements && (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Entitlements
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(
                      entitlements.features,
                    ).map(([feature, allowed]) => (
                      <span
                        key={feature}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          allowed
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {FEATURE_LABELS[feature] || feature}:{" "}
                        {allowed ? "ON" : "OFF"}
                      </span>
                    ))}
                  </div>
                  {entitlements.customPricing && (
                    <p className="mt-3 text-xs text-slate-500">
                      Custom Enterprise pricing — contact sales
                      for terms.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-bold">
                    Plans
                  </h2>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <input
                      type="checkbox"
                      checked={yearly}
                      onChange={(e) =>
                        setYearly(e.target.checked)
                      }
                    />
                    Yearly billing
                  </label>
                </div>

                {plans.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">
                    No public plans configured.
                  </p>
                ) : (
                  <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {plans.map((plan) => {
                      const isCurrent =
                        plan.code === currentCode;
                      const price = yearly
                        ? plan.yearlyPrice
                        : plan.monthlyPrice;

                      return (
                        <div
                          key={plan.code}
                          className={`rounded-2xl border p-5 ${
                            isCurrent
                              ? "border-slate-900 bg-slate-50"
                              : "border-slate-200"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold">
                              {plan.name}
                            </span>
                            {isCurrent && (
                              <span className="flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">
                                <CheckCircle2 size={11} />
                                CURRENT
                              </span>
                            )}
                          </div>

                          <div className="mt-2 text-2xl font-bold">
                            {money(
                              price,
                              plan.currency || "USD",
                            )}
                            <span className="text-xs font-medium text-slate-400">
                              /{yearly ? "yr" : "mo"}
                            </span>
                          </div>

                          {plan.description && (
                            <p className="mt-1 min-h-[2.5rem] text-xs text-slate-500">
                              {plan.description}
                            </p>
                          )}

                          <ul className="mt-3 space-y-1 text-xs text-slate-600">
                            <li>
                              {plan.maxWebsites} websites
                            </li>
                            <li>
                              {plan.maxClients} clients
                            </li>
                            <li>
                              {plan.maxReports} reports
                            </li>
                            <li>
                              {plan.maxCompetitors} competitors
                            </li>
                            <li>
                              {plan.maxCrawlCredits} crawl
                              credits
                            </li>
                          </ul>

                          {!isCurrent && (
                            <button
                              type="button"
                              disabled={busy === plan.code}
                              onClick={() =>
                                handleCheckout(plan.code)
                              }
                              className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60"
                            >
                              {busy === plan.code
                                ? "Redirecting..."
                                : "Upgrade"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold">
                  Payment history
                </h2>

                {invoices.length === 0 ? (
                  <p className="mt-2 flex items-start gap-2 text-sm text-slate-500">
                    <CreditCard
                      size={16}
                      className="mt-0.5 shrink-0"
                    />
                    {invoicesNote ||
                      "No payment history. Invoices appear here once billing is connected."}
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100">
                    {invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="text-sm font-semibold">
                          {money(
                            invoice.amount,
                            invoice.currency,
                          )}{" "}
                          <span className="ml-2 text-xs font-medium text-slate-400">
                            {invoice.status} ·{" "}
                            {formatDate(invoice.created)}
                          </span>
                        </div>
                        {invoice.url && (
                          <a
                            href={invoice.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-blue-700 hover:underline"
                          >
                            View invoice
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
