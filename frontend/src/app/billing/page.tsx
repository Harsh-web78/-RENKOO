"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  Loader2,
  RefreshCw,
  LockKeyhole,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";

type Plan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  currency?: string;

  maxWebsites?: number;
  maxKeywords?: number;
  maxCompetitors?: number;
  maxAiPrompts?: number;
  maxAiScans?: number;
  maxUsers?: number;
  maxClients?: number;
  maxReports?: number;
  maxCrawlCredits?: number;
  maxApiCalls?: number;
};

type Subscription = {
  id: string;
  status: string;
  plan?: Plan | null;

  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;

  trialStart?: string | null;
  trialEnd?: string | null;
  trialEndsAt?: string | null;

  cancelAtPeriodEnd?: boolean;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000/api";

function getToken(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return (
    localStorage.getItem("renkoo_access_token") || ""
  );
}

function getOrganizationId(): string {
  const token = getToken();

  if (!token) {
    return "";
  }

  try {
    const parts = token.split(".");

    if (parts.length < 2) {
      return "";
    }

    const payload = JSON.parse(
      atob(
        parts[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/")
      )
    );

    return (
      payload.organizationId ||
      payload.organization_id ||
      payload.orgId ||
      ""
    );
  } catch {
    return "";
  }
}

async function apiRequest(
  path: string
): Promise<any> {
  const token = getToken();

  const response = await fetch(
    `${API_URL}${path}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  const text = await response.text();

  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      typeof data === "object" &&
      data?.message
        ? Array.isArray(data.message)
          ? data.message.join(", ")
          : data.message
        : `Request failed (${response.status})`
    );
  }

  return data;
}

function money(
  value: number,
  currency = "USD"
): string {
  try {
    return new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }
    ).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

function formatDate(
  value?: string | null
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString();
}

export default function BillingPage() {
  const [plans, setPlans] =
    useState<Plan[]>([]);

  const [subscription, setSubscription] =
    useState<Subscription | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  const [billingReady, setBillingReady] =
    useState(false);

  const [open, setOpen] =
    useState(false);

  async function loadBilling(
    isRefresh = false
  ) {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      const organizationId =
        getOrganizationId();

      if (!organizationId) {
        throw new Error(
          "Organization could not be detected from your login session."
        );
      }

      /*
       * Load plans independently.
       *
       * This is important because Stripe may not be configured yet.
       * Plans should still appear even when subscription/checkout
       * is not ready.
       */

      let receivedPlans: Plan[] = [];

      try {
        const plansData =
          await apiRequest(
            "/billing/plans"
          );

        receivedPlans =
          Array.isArray(plansData)
            ? plansData
            : Array.isArray(
                plansData?.plans
              )
            ? plansData.plans
            : [];

        setPlans(receivedPlans);
      } catch (plansError: any) {
        console.error(
          "[RENKOO] BILLING PLANS ERROR",
          plansError
        );

        setPlans([]);

        throw new Error(
          plansError?.message ||
            "Unable to load billing plans."
        );
      }

      /*
       * Subscription is intentionally handled separately.
       *
       * If Stripe is not configured yet, this request can fail.
       * That must NOT hide the available plans.
       */

      try {
        const subscriptionData =
          await apiRequest(
            `/billing/subscription/${encodeURIComponent(
              organizationId
            )}`
          );

        const receivedSubscription =
          subscriptionData?.subscription ||
          subscriptionData ||
          null;

        setSubscription(
          receivedSubscription
        );

        setBillingReady(true);
      } catch (subscriptionError: any) {
        console.warn(
          "[RENKOO] SUBSCRIPTION NOT AVAILABLE",
          subscriptionError
        );

        setSubscription(null);

        /*
         * Stripe is not configured yet.
         * Do not show a red error because this is expected
         * during development before the Stripe account is created.
         */
        setBillingReady(false);
      }
    } catch (err: any) {
      console.error(
        "[RENKOO] BILLING LOAD ERROR",
        err
      );

      setError(
        err?.message ||
          "Unable to load billing information."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadBilling();
  }, []);

  const currentPlan =
    subscription?.plan || null;

  const trialEnd =
    subscription?.trialEnd ||
    subscription?.trialEndsAt ||
    null;

  const usageItems = useMemo(
    () => [
      [
        "Websites",
        currentPlan?.maxWebsites,
      ],
      [
        "Keywords",
        currentPlan?.maxKeywords,
      ],
      [
        "Competitors",
        currentPlan?.maxCompetitors,
      ],
      [
        "AI Prompts",
        currentPlan?.maxAiPrompts,
      ],
      [
        "AI Scans",
        currentPlan?.maxAiScans,
      ],
      [
        "Users",
        currentPlan?.maxUsers,
      ],
      [
        "Clients",
        currentPlan?.maxClients,
      ],
      [
        "Reports",
        currentPlan?.maxReports,
      ],
      [
        "Crawl Credits",
        currentPlan?.maxCrawlCredits,
      ],
      [
        "API Calls",
        currentPlan?.maxApiCalls,
      ],
    ],
    [currentPlan]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        mobileOpen={open}
        onClose={() => setOpen(false)}
      />

      <main className="lg:pl-[270px]">
        {/* HEADER */}

        <header className="flex h-[72px] items-center border-b border-slate-200 bg-white px-5 lg:px-8">
          <div>
            <div className="text-sm font-bold">
              RENKOO
            </div>

            <div className="text-xs text-slate-400">
              Billing & Plan
            </div>
          </div>
        </header>

        {/* CONTENT */}

        <section className="mx-auto max-w-[1150px] p-5 lg:p-8">

          {/* TITLE */}

          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-bold">
                Billing & Plan
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                Manage your RENKOO plan,
                limits and subscription.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                loadBilling(true)
              }
              disabled={
                loading || refreshing
              }
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={
                  refreshing
                    ? "animate-spin"
                    : ""
                }
              />

              Refresh
            </button>
          </div>

          {/* GENERAL ERROR */}

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="font-semibold">
                Billing could not be loaded
              </div>

              <div className="mt-1">
                {error}
              </div>
            </div>
          )}

          {/* STRIPE STATUS */}

          {!loading &&
            !billingReady &&
            !error && (
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                <LockKeyhole
                  size={18}
                  className="mt-0.5 shrink-0"
                />

                <div>
                  <div className="font-bold">
                    Payments setup pending
                  </div>

                  <div className="mt-1 text-blue-700">
                    RENKOO plans are available.
                    Online payments will be enabled
                    after Stripe is connected.
                  </div>
                </div>
              </div>
            )}

          {/* LOADING */}

          {loading ? (
            <div className="mt-12 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2
                size={18}
                className="animate-spin"
              />

              Loading billing...
            </div>
          ) : (
            <>
              {/* CURRENT PLAN */}

              <div className="mt-8 grid gap-5 lg:grid-cols-3">

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">

                  <div className="flex items-start justify-between gap-4">

                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
                        Current Plan
                      </div>

                      <div className="mt-2 text-2xl font-bold">
                        {currentPlan?.name ||
                          "No active plan"}
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        {currentPlan?.description ||
                          "Choose a plan to unlock RENKOO growth features."}
                      </p>
                    </div>

                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                      <CreditCard
                        size={22}
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">

                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
                      {subscription?.status ||
                        "NOT ACTIVE"}
                    </span>

                    {currentPlan && (
                      <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                        {money(
                          currentPlan.monthlyPrice,
                          currentPlan.currency ||
                            "USD"
                        )}

                        /month
                      </span>
                    )}

                  </div>
                </div>

                {/* SUBSCRIPTION */}

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Subscription
                  </div>

                  <div className="mt-4 space-y-4 text-sm">

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Status
                      </span>

                      <span className="font-semibold">
                        {subscription?.status ||
                          "—"}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Period ends
                      </span>

                      <span className="font-semibold">
                        {formatDate(
                          subscription?.currentPeriodEnd
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">
                        Trial ends
                      </span>

                      <span className="font-semibold">
                        {formatDate(trialEnd)}
                      </span>
                    </div>

                  </div>
                </div>

              </div>

              {/* PLAN LIMITS */}

              {currentPlan && (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

                  <h2 className="text-lg font-bold">
                    Plan Limits
                  </h2>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">

                    {usageItems.map(
                      ([label, value]) => (
                        <div
                          key={label as string}
                          className="rounded-xl bg-slate-50 p-4"
                        >
                          <div className="text-xs text-slate-500">
                            {label}
                          </div>

                          <div className="mt-1 text-xl font-bold">
                            {typeof value ===
                            "number"
                              ? value.toLocaleString()
                              : "—"}
                          </div>
                        </div>
                      )
                    )}

                  </div>
                </div>
              )}

              {/* AVAILABLE PLANS */}

              <div className="mt-8">

                <div className="mb-5">
                  <h2 className="text-xl font-bold">
                    Available Plans
                  </h2>

                  <p className="mt-1 text-sm text-slate-500">
                    Plans configured in the
                    RENKOO billing system.
                  </p>
                </div>

                {plans.length === 0 ? (

                  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                    No public plans available.
                  </div>

                ) : (

                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">

                    {plans.map(
                      (plan) => {

                        const active =
                          currentPlan?.id ===
                          plan.id;

                        return (
                          <div
                            key={plan.id}
                            className={`relative rounded-2xl border bg-white p-6 shadow-sm ${
                              active
                                ? "border-blue-300 ring-2 ring-blue-50"
                                : "border-slate-200"
                            }`}
                          >

                            {active && (
                              <div className="mb-3 flex items-center gap-1.5 text-xs font-bold text-blue-600">
                                <CheckCircle2
                                  size={15}
                                />

                                Current Plan
                              </div>
                            )}

                            <h3 className="text-lg font-bold">
                              {plan.name}
                            </h3>

                            <p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">
                              {plan.description ||
                                "RENKOO growth plan"}
                            </p>

                            <div className="mt-5">

                              <span className="text-2xl font-black">
                                {money(
                                  plan.monthlyPrice,
                                  plan.currency ||
                                    "USD"
                                )}
                              </span>

                              <span className="text-xs text-slate-400">
                                /month
                              </span>

                            </div>

                            {/* PAYMENT BUTTON */}

                            <button
                              type="button"
                              disabled
                              className="mt-5 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-400"
                            >
                              {active ? (
                                <>
                                  <CheckCircle2
                                    size={16}
                                  />

                                  Current Plan
                                </>
                              ) : (
                                <>
                                  <LockKeyhole
                                    size={15}
                                  />

                                  Payments Coming Soon
                                </>
                              )}
                            </button>

                          </div>
                        );
                      }
                    )}

                  </div>
                )}

              </div>

              {/* BILLING NOTE */}

              <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

                <div className="flex items-start gap-3">

                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                    <CreditCard
                      size={19}
                    />
                  </div>

                  <div>
                    <h3 className="font-bold">
                      Secure online billing
                    </h3>

                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      RENKOO will support secure
                      online subscriptions,
                      automatic renewals,
                      invoices and plan upgrades
                      through Stripe.
                    </p>

                    <p className="mt-2 text-xs font-semibold text-slate-400">
                      Payment gateway setup is
                      currently pending.
                    </p>
                  </div>

                </div>

              </div>

            </>
          )}

        </section>
      </main>
    </div>
  );
}