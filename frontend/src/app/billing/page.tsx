"use client";

/*
 * RENKOO billing page — Razorpay (primary) + Stripe (secondary/legacy).
 *
 * Primary flow (India / INR): plan → POST /billing/razorpay/subscription
 * → Razorpay checkout.js → POST /billing/razorpay/verify → refresh
 * entitlements. Paid success is shown ONLY after backend verification
 * (or a confirming poll) reports ACTIVE. A browser payment callback
 * alone never marks the subscription active.
 *
 * International (USD) stays gated by backend provider-status
 * (internationalCards === 'AVAILABLE'). No frontend flag overrides it.
 * Only the public Key ID from the backend checkout payload reaches the
 * browser; secrets never leave the backend.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  LockKeyhole,
  AlertTriangle,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DataTable from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/badge";
import {
  cancelBillingSubscription,
  cancelRazorpaySubscription,
  changeRazorpayPlan,
  createRazorpaySubscription,
  getBillingEntitlements,
  getBillingInvoices,
  getBillingPlans,
  getBillingProvider,
  getBillingSubscription,
  getBillingUsage,
  getCurrentAccount,
  getRazorpayProviderStatus,
  openBillingPortal,
  reactivateRazorpaySubscription,
  startBillingCheckout,
  startBillingTrial,
  syncRazorpaySubscription,
  verifyRazorpayCheckout,
  BillingEntitlements,
  BillingInvoice,
  BillingPlan,
  BillingSubscription,
  BillingUsage,
  RazorpayCurrency,
  RazorpayProviderStatus,
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

function money(value: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat(
      currency === "INR" ? "en-IN" : "en-US",
      {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      },
    ).format(value);
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

/* Minimal Razorpay checkout.js surface (loaded on demand only). */
interface RazorpayPaymentSuccess {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(
    event: "payment.failed",
    handler: (response: {
      error?: { description?: string };
    }) => void,
  ): void;
}

declare global {
  interface Window {
    Razorpay?: new (
      options: Record<string, unknown>,
    ) => RazorpayInstance;
  }
}

let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (
    typeof window !== "undefined" &&
    window.Razorpay
  ) {
    return Promise.resolve();
  }

  if (razorpayScriptPromise) {
    return razorpayScriptPromise;
  }

  razorpayScriptPromise = new Promise<void>(
    (resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        razorpayScriptPromise = null;
        reject(
          new Error(
            "Razorpay payment window could not be loaded. Check your connection and try again.",
          ),
        );
      };
      document.head.appendChild(script);
    },
  );

  return razorpayScriptPromise;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, ms),
  );
}

type PayPhase =
  | "idle"
  | "creating"
  | "awaiting-payment"
  | "verifying"
  | "confirming";

export default function BillingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [subscription, setSubscription] =
    useState<BillingSubscription | null>(null);
  const [entitlements, setEntitlements] =
    useState<BillingEntitlements | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(
    null,
  );
  const [stripeProvider, setStripeProvider] =
    useState(false);
  const [razorpayStatus, setRazorpayStatus] =
    useState<RazorpayProviderStatus | null>(null);
  const [razorpayStatusFailed, setRazorpayStatusFailed] =
    useState(false);
  const [invoices, setInvoices] = useState<BillingInvoice[]>(
    [],
  );
  const [invoicesNote, setInvoicesNote] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [yearly, setYearly] = useState(false);
  const [currency, setCurrency] =
    useState<RazorpayCurrency>("INR");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [payPhase, setPayPhase] =
    useState<PayPhase>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] =
    useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const loadBilling = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const account = await getCurrentAccount();
      const orgId = account.organization.id;
      setOrganizationId(orgId);
      setAccountEmail(account.user.email ?? "");

      const [
        plansData,
        entitlementsData,
        usageData,
        stripeProviderData,
        razorpayProviderData,
        subscriptionData,
        invoiceData,
      ] = await Promise.all([
        getBillingPlans(),
        getBillingEntitlements(),
        getBillingUsage(),
        getBillingProvider().catch(() => ({
          provider: false,
        })),
        getRazorpayProviderStatus()
          .then((status) => {
            setRazorpayStatusFailed(false);
            return status;
          })
          .catch(() => {
            setRazorpayStatusFailed(true);
            return null;
          }),
        getBillingSubscription(orgId).catch(() => null),
        getBillingInvoices().catch(() => ({
          provider: false,
          invoices: [],
          reason: "Payment history unavailable.",
        })),
      ]);

      if (!aliveRef.current) return;

      setPlans(
        Array.isArray(plansData) ? plansData : [],
      );
      setEntitlements(entitlementsData);
      setUsage(usageData);
      setStripeProvider(stripeProviderData.provider);
      setRazorpayStatus(razorpayProviderData);
      setSubscription(subscriptionData);
      setInvoices(invoiceData.invoices ?? []);
      setInvoicesNote(invoiceData.reason ?? "");
    } catch (err: any) {
      if (!aliveRef.current) return;
      setError(
        err?.message || "Unable to load billing information.",
      );
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const razorpayConfigured =
    razorpayStatus?.razorpayConfigured ?? false;
  const internationalCards =
    razorpayStatus?.internationalCards ?? "NOT_CONFIGURED";
  const usdAvailable =
    razorpayConfigured &&
    internationalCards === "AVAILABLE";
  const usdBlocked =
    currency === "USD" && !usdAvailable;
  const subscriptionProvider =
    entitlements?.provider ??
    subscription?.provider ??
    null;
  const isRazorpayRow =
    subscriptionProvider === "RAZORPAY";
  const rawStatus = subscription?.status ?? null;

  async function handleRazorpayCheckout(
    planCode: string,
  ) {
    if (!organizationId || busy) return;

    if (!razorpayConfigured) {
      setError(
        "Razorpay billing is not configured for this installation yet. Your current plan and data are unchanged.",
      );
      return;
    }

    if (usdBlocked) {
      setError(
        "International card payments are currently being activated. USD checkout is unavailable until Razorpay confirms activation — INR checkout remains available.",
      );
      return;
    }

    try {
      setBusy(planCode);
      setPayPhase("creating");
      setError("");
      setNotice("");

      const payload = await createRazorpaySubscription(
        planCode,
        yearly ? "YEARLY" : "MONTHLY",
        currency,
      );

      if (
        !payload?.subscriptionId ||
        !payload?.keyId
      ) {
        throw new Error(
          "Checkout could not be created. Please try again — no payment was started.",
        );
      }

      await loadRazorpayScript();

      if (!aliveRef.current) return;
      if (!window.Razorpay) {
        throw new Error(
          "Razorpay payment window could not be loaded. Check your connection and try again.",
        );
      }

      setPayPhase("awaiting-payment");

      const completed = await new Promise<{
        subscriptionId: string;
        paymentId: string;
        signature: string;
      }>((resolve, reject) => {
        let settled = false;

        const checkout = new window.Razorpay!({
          key: payload.keyId,
          subscription_id: payload.subscriptionId,
          name: "RENKOO",
          description: `${payload.planCode} ${payload.interval} (${payload.currency} ${payload.amount})`,
          ...(accountEmail
            ? {
                prefill: { email: accountEmail },
              }
            : {}),
          theme: { color: "#0f172a" },
          modal: {
            ondismiss: () => {
              if (settled) return;
              settled = true;
              reject(
                new Error(
                  "__DISMISSED__Payment window closed before completion. No subscription was activated.",
                ),
              );
            },
          },
          handler: (
            response: RazorpayPaymentSuccess,
          ) => {
            if (settled) return;
            settled = true;
            resolve({
              subscriptionId:
                response.razorpay_subscription_id,
              paymentId:
                response.razorpay_payment_id,
              signature:
                response.razorpay_signature,
            });
          },
        });

        checkout.on("payment.failed", (response) => {
          if (settled) return;
          settled = true;
          reject(
            new Error(
              response?.error?.description ||
                "Payment failed. No subscription was activated — you can try again.",
            ),
          );
        });

        checkout.open();
      });

      if (!aliveRef.current) return;
      setPayPhase("verifying");

      const result = await verifyRazorpayCheckout(
        completed.subscriptionId,
        completed.paymentId,
        completed.signature,
      );

      if (!aliveRef.current) return;

      if (result.status === "ACTIVE") {
        setNotice(
          `Payment verified — ${result.planCode} subscription is ACTIVE.`,
        );
        setPayPhase("idle");
        await loadBilling();
        return;
      }

      /*
       * Signature/payment accepted but provider state
       * still pending (e.g. webhook in flight). Poll the
       * backend sync — never invent ACTIVE locally.
       */
      setPayPhase("confirming");
      setNotice(
        "Payment received — confirming subscription. This usually takes a few seconds.",
      );

      let active = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(4000);
        if (!aliveRef.current) return;

        try {
          await syncRazorpaySubscription();
        } catch {
          /* Sync failure is non-fatal; re-read state below. */
        }

        try {
          const refreshed =
            await getBillingEntitlements();
          if (!aliveRef.current) return;
          setEntitlements(refreshed);
          if (refreshed.status === "ACTIVE") {
            active = true;
            break;
          }
        } catch {
          /* Entitlement refresh failure is reported below. */
        }
      }

      if (!aliveRef.current) return;

      if (active) {
        setNotice(
          "Payment verified — subscription is ACTIVE.",
        );
        await loadBilling();
      } else {
        setNotice(
          "Payment received — confirming subscription. If it is not ACTIVE yet, press Refresh in a moment; nothing was lost.",
        );
        await loadBilling();
      }
    } catch (err: any) {
      if (!aliveRef.current) return;
      const message =
        typeof err?.message === "string"
          ? err.message
          : "Checkout failed.";

      if (message.startsWith("__DISMISSED__")) {
        setNotice(message.slice("__DISMISSED__".length));
      } else if (
        /not connected|not configured|BILLING_PROVIDER_NOT_CONFIGURED/i.test(
          message,
        )
      ) {
        setError(
          "Razorpay billing is not configured for this installation yet. Your current plan and data are unchanged.",
        );
      } else if (
        /international|USD checkout is unavailable|CURRENCY_NOT_SUPPORTED/i.test(
          message,
        )
      ) {
        setError(
          "International card payments are currently being activated. USD checkout is unavailable until Razorpay confirms activation — INR checkout remains available.",
        );
      } else if (
        /already has an active billing|SUBSCRIPTION_ALREADY_ACTIVE/i.test(
          message,
        )
      ) {
        setError(
          "This workspace already has an active billing state. Cancel or wait for expiry before starting a new subscription.",
        );
      } else {
        setError(message);
      }
    } finally {
      if (aliveRef.current) {
        setBusy(null);
        setPayPhase("idle");
      }
    }
  }

  async function handleChangePlan(planCode: string) {
    if (!organizationId || busy) return;

    try {
      setBusy(planCode);
      setError("");
      setNotice("");

      const result = await changeRazorpayPlan(
        planCode,
        true,
      );

      setNotice(
        result.message ??
          `Plan change to ${result.planCode} applied (${result.effective}).`,
      );
      await loadBilling();
    } catch (err: any) {
      setError(
        err?.message || "Plan change failed.",
      );
    } finally {
      if (aliveRef.current) setBusy(null);
    }
  }

  async function handleLegacyStripeCheckout(
    planCode: string,
  ) {
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
      if (aliveRef.current) setBusy(null);
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
      if (aliveRef.current) setBusy(null);
    }
  }

  async function handleConfirmCancel() {
    if (busy) return;

    try {
      setBusy("cancel");
      setError("");

      if (isRazorpayRow) {
        const result =
          await cancelRazorpaySubscription();
        setNotice(
          result.message ??
            (result.effective === "immediate"
              ? "Subscription cancelled immediately; no billing cycle had started. All data is preserved."
              : "Subscription will cancel at the end of the current period. All data is preserved."),
        );
      } else {
        const updated =
          await cancelBillingSubscription();
        setSubscription(updated);
        setNotice(
          "Subscription will cancel at the end of the current period. All data is preserved.",
        );
      }

      setCancelOpen(false);
      await loadBilling();
    } catch (err: any) {
      const message =
        typeof err?.message === "string"
          ? err.message
          : "Cancellation failed.";

      if (
        /Use the Razorpay cancel endpoint/i.test(message)
      ) {
        setError(
          "This is a Razorpay subscription — please try again; the Razorpay cancellation path is now selected automatically.",
        );
        try {
          const result =
            await cancelRazorpaySubscription();
          setError("");
          setNotice(
            result.message ??
              "Subscription cancellation processed. All data is preserved.",
          );
          setCancelOpen(false);
          await loadBilling();
        } catch (retryErr: any) {
          setError(
            retryErr?.message || "Cancellation failed.",
          );
        }
      } else {
        setError(message);
      }
    } finally {
      if (aliveRef.current) setBusy(null);
    }
  }

  async function handleConfirmReactivate() {
    if (busy) return;

    try {
      setBusy("reactivate");
      setError("");

      const result =
        await reactivateRazorpaySubscription();
      setNotice(
        result.message ??
          "Subscription reactivated.",
      );
      setReactivateOpen(false);
      await loadBilling();
    } catch (err: any) {
      setError(
        err?.message || "Reactivation failed.",
      );
    } finally {
      if (aliveRef.current) setBusy(null);
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
      if (aliveRef.current) setBusy(null);
    }
  }

  const currentCode =
    entitlements?.planCode ||
    subscription?.plan?.code ||
    "FREE";

  /*
   * Per-plan action routing. Razorpay rows with a live
   * subscription use change-plan; workspaces without a
   * blocking subscription start a new Razorpay checkout.
   * Trial and pending rows are never given a button that
   * the backend would reject.
   */
  function planAction(plan: BillingPlan): {
    kind: "none" | "checkout" | "change" | "legacy";
    label: string;
    disabled: boolean;
    reason?: string;
  } {
    if (plan.code === currentCode || plan.code === "FREE") {
      return { kind: "none", label: "", disabled: true };
    }

    if (!razorpayConfigured) {
      if (stripeProvider) {
        return {
          kind: "legacy",
          label: "Upgrade",
          disabled: false,
        };
      }
      return {
        kind: "none",
        label: "Razorpay unavailable",
        disabled: true,
        reason:
          "Razorpay billing is not configured for this installation yet.",
      };
    }

    if (usdBlocked) {
      return {
        kind: "none",
        label: "USD pending approval",
        disabled: true,
        reason:
          "International card payments are currently being activated.",
      };
    }

    if (!subscription || !rawStatus) {
      return {
        kind: "checkout",
        label: "Upgrade",
        disabled: false,
      };
    }

    if (rawStatus === "TRIALING") {
      return {
        kind: "none",
        label: "Trial active",
        disabled: true,
        reason:
          "Your trial is active. Paid checkout becomes available when the trial ends or is replaced — existing trial access is unchanged.",
      };
    }

    if (rawStatus === "PENDING") {
      if (
        isRazorpayRow &&
        subscription.plan?.code === plan.code
      ) {
        return {
          kind: "checkout",
          label: "Resume payment",
          disabled: false,
        };
      }
      return {
        kind: "none",
        label: "Payment pending",
        disabled: true,
        reason:
          "A payment is already pending for this workspace. Complete or cancel it before starting a new one.",
      };
    }

    if (
      isRazorpayRow &&
      (rawStatus === "ACTIVE" || rawStatus === "PAUSED")
    ) {
      return {
        kind: "change",
        label: "Switch plan",
        disabled: false,
      };
    }

    if (
      rawStatus === "CANCELED" ||
      rawStatus === "CANCELLED" ||
      rawStatus === "COMPLETED" ||
      rawStatus === "EXPIRED" ||
      rawStatus === "INCOMPLETE" ||
      rawStatus === "INCOMPLETE_EXPIRED" ||
      rawStatus === "UNPAID"
    ) {
      return {
        kind: "checkout",
        label: "Upgrade",
        disabled: false,
      };
    }

    return {
      kind: "checkout",
      label: "Upgrade",
      disabled: false,
    };
  }

  const showReactivate =
    isRazorpayRow &&
    (rawStatus === "PAUSED" ||
      entitlements?.status === "PAUSED");

  return (
    <AppShell
      mobileOpen={open}
      onClose={() => setOpen(false)}
      onMenu={() => setOpen(true)}
    >
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
                Plan, usage, limits and payment history for
                this workspace. Downgrades never delete
                data.
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
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0"
              />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
            >
              {payPhase === "confirming" ? (
                <span className="flex items-center gap-2">
                  <Loader2
                    size={15}
                    className="animate-spin"
                  />
                  {notice}
                </span>
              ) : (
                notice
              )}
            </div>
          )}

          {razorpayStatusFailed && (
            <div
              role="status"
              className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            >
              <LockKeyhole
                size={17}
                className="mt-0.5 shrink-0"
              />
              <span>
                Billing provider status could not be
                loaded. Plans, usage and limits below are
                real; checkout availability is unknown
                until the status loads — press Refresh.
              </span>
            </div>
          )}

          {!razorpayStatusFailed && !razorpayConfigured && (
            <div
              role="status"
              className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            >
              <LockKeyhole
                size={17}
                className="mt-0.5 shrink-0"
              />
              <span>
                Razorpay billing is not configured for
                this installation. Plans, usage and limits
                below are real; checkout activates once
                Razorpay credentials are configured on the
                backend.
              </span>
            </div>
          )}

          {!razorpayStatusFailed &&
            razorpayConfigured &&
            currency === "USD" && (
              <div
                role="status"
                className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
              >
                <LockKeyhole
                  size={17}
                  className="mt-0.5 shrink-0"
                />
                <span>
                  {usdAvailable ? (
                    <>
                      USD checkout via Razorpay is
                      available for this installation.
                    </>
                  ) : (
                    <>
                      International card payments are
                      currently being activated. USD
                      checkout is unavailable until
                      Razorpay confirms activation — INR
                      checkout remains available.
                    </>
                  )}
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
                  {rawStatus === "PENDING" && (
                    <div className="mt-1 text-xs font-semibold text-amber-700">
                      Payment pending — complete checkout
                      to activate paid access.
                    </div>
                  )}
                  {entitlements?.provider && (
                    <div className="mt-1 text-xs text-slate-500">
                      Provider: {entitlements.provider}
                      {entitlements.currency
                        ? ` · ${entitlements.currency}`
                        : ""}
                      {razorpayStatus
                        ? ` · ${razorpayStatus.razorpayMode}`
                        : ""}
                    </div>
                  )}
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
                    {showReactivate && (
                      <button
                        type="button"
                        disabled={busy === "reactivate"}
                        onClick={() =>
                          setReactivateOpen(true)
                        }
                        className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60"
                      >
                        {busy === "reactivate"
                          ? "Reactivating..."
                          : "Reactivate subscription"}
                      </button>
                    )}
                    {subscription &&
                      !subscription.cancelAtPeriodEnd &&
                      rawStatus !== "PENDING" && (
                        <button
                          type="button"
                          disabled={busy === "cancel"}
                          onClick={() =>
                            setCancelOpen(true)
                          }
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
                                unavailable, never
                                zero-filled.
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
                      Custom Enterprise pricing — contact
                      sales for terms.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-bold">
                    Plans
                  </h2>
                  <div className="flex flex-wrap items-center gap-4">
                    <fieldset>
                      <legend className="sr-only">
                        Checkout currency
                      </legend>
                      <div
                        className="flex items-center gap-1 rounded-xl border border-slate-200 p-1"
                        role="radiogroup"
                        aria-label="Checkout currency"
                      >
                        {(
                          ["INR", "USD"] as const
                        ).map((option) => (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={
                              currency === option
                            }
                            onClick={() =>
                              setCurrency(option)
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                              currency === option
                                ? "bg-slate-900 text-white"
                                : "text-slate-500 hover:bg-slate-50"
                            }`}
                          >
                            {option === "INR"
                              ? "🇮🇳 INR"
                              : "🌍 USD"}
                          </button>
                        ))}
                      </div>
                    </fieldset>
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
                </div>
                <p
                  className="mt-2 text-xs text-slate-500"
                  id="currency-help"
                >
                  {currency === "INR" ? (
                    <>
                      INR checkout via Razorpay
                      {razorpayConfigured
                        ? " is available."
                        : " activates once Razorpay is configured."}{" "}
                      Prices below are INR list prices from
                      the billing service.
                    </>
                  ) : usdAvailable ? (
                    <>
                      USD checkout via Razorpay is
                      available. USD billing uses Razorpay
                      USD plan pricing; INR list prices are
                      shown below for reference.
                    </>
                  ) : (
                    <>
                      International card payments are
                      currently being activated — USD
                      checkout stays disabled until
                      Razorpay confirms activation. Prices
                      below are INR list prices.
                    </>
                  )}
                </p>

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
                      const action = planAction(plan);
                      const isBusy =
                        busy === plan.code;

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
                              plan.currency || "INR",
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

                          {!isCurrent &&
                            action.kind !== "none" && (
                              <button
                                type="button"
                                disabled={
                                  isBusy || !!busy
                                }
                                aria-describedby="currency-help"
                                onClick={() => {
                                  if (
                                    action.kind ===
                                    "change"
                                  ) {
                                    void handleChangePlan(
                                      plan.code,
                                    );
                                  } else if (
                                    action.kind ===
                                    "legacy"
                                  ) {
                                    void handleLegacyStripeCheckout(
                                      plan.code,
                                    );
                                  } else {
                                    void handleRazorpayCheckout(
                                      plan.code,
                                    );
                                  }
                                }}
                                className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60"
                              >
                                {isBusy
                                  ? payPhase ===
                                    "awaiting-payment"
                                    ? "Waiting for payment..."
                                    : payPhase ===
                                        "verifying"
                                      ? "Verifying payment..."
                                      : payPhase ===
                                          "confirming"
                                        ? "Confirming subscription..."
                                        : "Processing..."
                                  : action.label}
                              </button>
                            )}
                          {!isCurrent &&
                            action.kind === "none" &&
                            action.label && (
                              <div
                                className="mt-4 w-full rounded-xl bg-slate-100 px-4 py-2 text-center text-xs font-bold text-slate-400"
                                title={action.reason}
                              >
                                {action.label}
                              </div>
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

                <div className="mt-3">
                  <DataTable<BillingInvoice>
                    caption="Payment history"
                    rows={invoices}
                    keyOf={(row) => row.id}
                    emptyTitle="Invoice history unavailable"
                    emptyDescription={
                      invoicesNote ||
                      "No payment history. Invoices appear here once billing is connected."
                    }
                    columns={[
                      {
                        key: "invoice",
                        label: "Invoice",
                        render: (row) => (
                          <span className="font-semibold">
                            {row.id}
                          </span>
                        ),
                      },
                      {
                        key: "date",
                        label: "Date",
                        render: (row) =>
                          formatDate(row.created),
                      },
                      {
                        key: "amount",
                        label: "Amount",
                        align: "right",
                        render: (row) =>
                          money(
                            row.amount,
                            row.currency,
                          ),
                      },
                      {
                        key: "status",
                        label: "Status",
                        render: (row) => (
                          <StatusBadge
                            status={
                              row.status ?? "UNKNOWN"
                            }
                          />
                        ),
                      },
                      {
                        key: "receipt",
                        label: "Receipt",
                        align: "right",
                        render: (row) =>
                          row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-blue-700 hover:underline"
                            >
                              View invoice
                            </a>
                          ) : (
                            "—"
                          ),
                      },
                    ]}
                  />
                </div>
              </div>

              <ConfirmDialog
                open={cancelOpen}
                title="Cancel subscription at period end?"
                description={
                  isRazorpayRow
                    ? "Your Razorpay subscription will be cancelled (at period end once billed, immediately if no billing cycle started). Your websites, clients, reports and history are preserved — only new usage is limited afterward."
                    : "Your subscription will cancel at the end of the current period. Your websites, clients, reports and history are preserved — only new usage is limited afterward."
                }
                confirmLabel="Cancel subscription"
                cancelLabel="Keep subscription"
                confirming={busy === "cancel"}
                onConfirm={() =>
                  void handleConfirmCancel()
                }
                onCancel={() => {
                  if (busy !== "cancel") {
                    setCancelOpen(false);
                  }
                }}
              />

              <ConfirmDialog
                open={reactivateOpen}
                title="Reactivate paused subscription?"
                description="Your paused Razorpay subscription will be resumed. Billing continues per the provider plan."
                confirmLabel="Reactivate"
                cancelLabel="Keep paused"
                tone="neutral"
                confirming={busy === "reactivate"}
                onConfirm={() =>
                  void handleConfirmReactivate()
                }
                onCancel={() => {
                  if (busy !== "reactivate") {
                    setReactivateOpen(false);
                  }
                }}
              />
            </>
          )}
        </section>
    </AppShell>
  );
}
