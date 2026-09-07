"use client";

/*
 * RENKOO billing page — Razorpay (primary) + Stripe (secondary/legacy).
 *
 * Primary flow (India / INR): plan ? POST /billing/razorpay/subscription
 * ? Razorpay checkout.js ? POST /billing/razorpay/verify ? refresh
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

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function money(value: number, currency = "INR"): string {
  try {
    const key =
      currency === "INR" ? "en-IN:INR" : `en-US:${currency}`;

    let formatter = moneyFormatters.get(key);

    if (!formatter) {
      formatter = new Intl.NumberFormat(
        currency === "INR" ? "en-IN" : "en-US",
        {
          style: "currency",
          currency,
          maximumFractionDigits: 0,
        },
      );

      moneyFormatters.set(key, formatter);
    }

    return formatter.format(value);
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
        try {
          await cancelRazorpaySubscription();
          setNotice("Payment cancelled. You can choose a plan again anytime.");
          await loadBilling();
        } catch {
          setNotice("Payment window closed. Refreshing billing status...");
          await loadBilling();
        }
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
      <section className="rk-page mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="rk-label">Billing &amp; Plans</p>
              <h1 className="mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.03em] text-rk-ink sm:text-[30px]">
                Subscription
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-rk-secondary">
                Plan, usage, limits and payment history for
                this workspace. Downgrades never delete
                data.
              </p>
            </div>

            <button
              type="button"
              onClick={() => loadBilling()}
              disabled={loading}
              className="rk-focusable flex h-9 shrink-0 items-center gap-2 self-start rounded-rk-md border border-rk-border bg-rk-surface px-4 text-[13px] font-bold text-rk-ink shadow-rk-sm transition-all hover:border-rk-strong hover:shadow-rk-md disabled:opacity-60 disabled:shadow-none"
            >
              <RefreshCw
                size={15}
                className={loading ? "animate-spin" : ""}
                aria-hidden
              />
              Refresh
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-rk-md border border-red-200 bg-red-50 p-4 text-sm text-red-700"
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
              className="mt-5 rounded-rk-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
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
              className="mt-5 flex items-start gap-2 rounded-rk-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
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
              className="mt-5 flex items-start gap-2 rounded-rk-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
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
                className="mt-5 flex items-start gap-2 rounded-rk-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
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
            <div className="mt-6 flex items-center gap-3 rounded-rk-lg border border-rk-border bg-rk-surface p-10 text-sm text-rk-secondary">
              <Loader2 size={20} className="animate-spin" />
              Loading billing...
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-rk-muted">
                    Current plan
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {entitlements?.planName || "Free"}
                  </div>
                  <div className="mt-1 text-xs text-rk-secondary">
                    Status:{" "}
                    <span className="font-bold text-rk-ink">
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
                    <div className="mt-1 text-xs text-rk-secondary">
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
                    <div className="mt-1 text-xs text-rk-secondary">
                      Trial ends{" "}
                      {formatDate(entitlements.trialEnd)}
                    </div>
                  )}
                  {entitlements?.currentPeriodEnd && (
                    <div className="mt-1 text-xs text-rk-secondary">
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
                        className="rounded-rk-md bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60"
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
                        className="rounded-rk-md bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60"
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
                          className="rounded-rk-md border border-rk-border px-4 py-2 text-xs font-bold text-slate-600 hover:bg-rk-soft disabled:opacity-60"
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
                      className="rounded-rk-md border border-rk-border px-4 py-2 text-xs font-bold text-slate-600 hover:bg-rk-soft disabled:opacity-60"
                    >
                      {busy === "portal"
                        ? "Opening..."
                        : "Customer portal"}
                    </button>
                  </div>
                </div>

                <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm lg:col-span-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-rk-muted">
                    Usage & limits
                  </div>

                  {!usage ? (
                    <p className="mt-3 text-sm text-rk-muted">
                      Usage unavailable.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {Object.entries(usage.usage).map(
                        ([metric, item]) => (
                          <div
                            key={metric}
                            className="rounded-rk-md border border-slate-100 px-4 py-3"
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
                              <div className="mt-2 text-[11px] text-rk-muted">
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
                <div className="mt-6 rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-rk-muted">
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
                            : "bg-slate-100 text-rk-secondary"
                        }`}
                      >
                        {FEATURE_LABELS[feature] || feature}:{" "}
                        {allowed ? "ON" : "OFF"}
                      </span>
                    ))}
                  </div>
                  {entitlements.customPricing && (
                    <p className="mt-3 text-xs text-rk-secondary">
                      Custom Enterprise pricing — contact
                      sales for terms.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 overflow-hidden rounded-rk-lg border border-rk-border bg-rk-surface shadow-sm">
                <div className="border-b border-rk-border bg-rk-soft/70 px-6 py-6">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-rk-secondary">
                        Choose your growth engine
                      </div>
                      <h2 className="mt-1 text-2xl font-bold tracking-tight text-rk-ink">
                        Plans built around growth, not just SEO
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-rk-secondary">
                        Start with the essentials, then unlock deeper intelligence,
                        automation and agency workflows as your growth operation scales.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <fieldset>
                        <legend className="sr-only">Checkout currency</legend>
                        <div
                          className="flex items-center gap-1 rounded-rk-md border border-rk-border bg-rk-surface p-1 shadow-sm"
                          role="radiogroup"
                          aria-label="Checkout currency"
                        >
                          {(["INR", "USD"] as const).map((option) => (
                            <button
                              key={option}
                              type="button"
                              role="radio"
                              aria-checked={currency === option}
                              onClick={() => setCurrency(option)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                currency === option
                                  ? "bg-rk-ink text-white shadow-sm"
                                  : "text-rk-secondary hover:bg-rk-soft"
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </fieldset>

                      <label className="flex cursor-pointer items-center gap-2 rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-xs font-bold text-rk-secondary shadow-sm">
                        <input
                          type="checkbox"
                          checked={yearly}
                          onChange={(e) => setYearly(e.target.checked)}
                          className="h-4 w-4 rounded border-rk-border"
                        />
                        Yearly billing
                        <span className="rounded-full bg-rk-successSoft px-2 py-0.5 text-[10px] font-bold text-rk-success">
                          Save
                        </span>
                      </label>
                    </div>
                  </div>

                  <p className="mt-4 text-xs leading-5 text-rk-secondary" id="currency-help">
                    {currency === "INR" ? (
                      <>
                        INR checkout via Razorpay
                        {razorpayConfigured
                          ? " is available."
                          : " activates once Razorpay is configured."}{" "}
                        Prices are served by the billing service.
                      </>
                    ) : usdAvailable ? (
                      <>
                        USD checkout via Razorpay is available. USD billing uses
                        Razorpay USD plan pricing.
                      </>
                    ) : (
                      <>
                        International card payments are currently being activated.
                        USD checkout stays disabled until Razorpay confirms activation;
                        INR checkout remains available.
                      </>
                    )}
                  </p>
                </div>

                {plans.length === 0 ? (
                  <p className="p-6 text-sm text-rk-muted">
                    No public plans configured.
                  </p>
                ) : (
                  <>
                    <div className="grid gap-0 xl:grid-cols-4">
                      {plans
                        .filter((plan) => plan.code !== "FREE")
                        .map((plan) => {
                          const isCurrent = plan.code === currentCode;
                          const price = yearly ? plan.yearlyPrice : plan.monthlyPrice;
                          const action = planAction(plan);
                          const isBusy = busy === plan.code;
                          const isPopular = plan.code === "GROWTH";
                          const isAgency = plan.code === "AGENCY";

                          const features =
                            plan.code === "STARTER"
                              ? [
                                  "Technical SEO",
                                  "Search Console + GA4",
                                  "AI visibility tracking",
                                  "AEO + GEO",
                                  "Content engine",
                                  "Competitor intelligence",
                                  "Business Brain",
                                  "Opportunities + actions",
                                  "Monitoring + reports",
                                ]
                              : plan.code === "GROWTH"
                                ? [
                                    "Everything in Starter",
                                    "1,500 tracked keywords",
                                    "10 competitors",
                                    "50 crawl credits",
                                    "500 growth actions",
                                    "AI workers + intelligence",
                                    "Leads ? Revenue",
                                    "ROI measurement",
                                    "3 team seats + 5 clients",
                                  ]
                                : plan.code === "SCALE"
                                  ? [
                                      "Everything in Growth",
                                      "10 websites",
                                      "5,000 tracked keywords",
                                      "25 competitors",
                                      "200 crawl credits",
                                      "2,000 growth actions",
                                      "White label + API access",
                                      "25 client workspaces",
                                      "10 team seats",
                                    ]
                                  : [
                                      "Everything in Scale",
                                      "30 websites",
                                      "15,000 tracked keywords",
                                      "100 competitors",
                                      "1,000 crawl credits",
                                      "10,000 growth actions",
                                      "Agency OS + client portal",
                                      "White label + API access",
                                      "25 team seats + 100 clients",
                                    ];

                          return (
                            <div
                              key={plan.code}
                              className={`relative flex min-h-[560px] flex-col border-b border-rk-border p-6 xl:border-b-0 xl:border-r ${
                                isPopular
                                  ? "bg-rk-ink text-white"
                                  : isCurrent
                                    ? "bg-rk-soft"
                                    : "bg-rk-surface"
                              } ${isAgency ? "xl:border-r-0" : ""}`}
                            >
                              {isPopular && (
                                <div className="absolute inset-x-0 top-0 h-1 bg-rk-surface" />
                              )}

                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-rk-muted">
                                    {plan.description || "Plan"}
                                  </div>
                                  <h3
                                    className={`mt-2 text-xl font-bold ${
                                      isPopular ? "text-white" : "text-rk-ink"
                                    }`}
                                  >
                                    {plan.name}
                                  </h3>
                                </div>

                                {isPopular ? (
                                  <span className="rounded-full bg-rk-surface px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-rk-ink">
                                    Most popular
                                  </span>
                                ) : isCurrent ? (
                                  <span className="flex items-center gap-1 rounded-full bg-rk-ink px-2.5 py-1 text-[10px] font-extrabold text-white">
                                    <CheckCircle2 size={11} />
                                    Current
                                  </span>
                                ) : null}
                              </div>

                              <p
                                  className={`mt-3 min-h-[48px] text-xs leading-5 ${
                                    isPopular ? "text-white/70" : "text-rk-secondary"
                                  }`}
                              >
                                {plan.description}
                              </p>

                              <div className="mt-5">
                                <div className="flex items-end gap-1">
                                  <span
                                    className={`text-4xl font-extrabold tracking-tight ${
                                      isPopular ? "text-white" : "text-rk-ink"
                                    }`}
                                  >
                                    {money(price, plan.currency || "INR")}
                                  </span>
                                  <span className="mb-1 text-xs font-semibold text-rk-muted">
                                    /{yearly ? "yr" : "mo"}
                                  </span>
                                </div>
                                {yearly && plan.monthlyPrice > 0 && (
                                  <p className="mt-1 text-[11px] text-rk-muted">
                                    Billed annually · monthly equivalent shown by billing service
                                  </p>
                                )}
                              </div>

                              <div
                                className={`mt-5 grid grid-cols-2 gap-2 rounded-rk-md p-3 ${
                                  isPopular
                                    ? "bg-rk-surface/10"
                                    : "border border-slate-100 bg-rk-soft"
                                }`}
                              >
                                {[
                                  ["Websites", plan.maxWebsites],
                                  ["Keywords", plan.maxKeywords],
                                  ["Competitors", plan.maxCompetitors],
                                  ["Crawls", plan.maxCrawlCredits],
                                ].map(([label, value]) => (
                                  <div key={String(label)}>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-rk-muted">
                                      {label}
                                    </div>
                                    <div
                                      className={`mt-0.5 text-sm font-bold ${
                                        isPopular ? "text-white" : "text-slate-900"
                                      }`}
                                    >
                                      {value}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="mt-5 flex-1">
                                <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-rk-muted">
                                  Includes
                                </div>
                                <ul className="mt-3 space-y-2.5">
                                  {features.map((feature) => (
                                    <li
                                      key={feature}
                                      className={`flex items-start gap-2 text-xs leading-4 ${
                                        isPopular ? "text-slate-200" : "text-slate-600"
                                      }`}
                                    >
                                      <CheckCircle2
                                        size={14}
                                        className={`mt-0.5 shrink-0 ${
                                          isPopular ? "text-white" : "text-slate-900"
                                        }`}
                                      />
                                      <span>{feature}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>

                              {!isCurrent && action.kind !== "none" ? (
                                <button
                                  type="button"
                                  disabled={isBusy || !!busy}
                                  aria-describedby="currency-help"
                                  onClick={() => {
                                    if (action.kind === "change") {
                                      void handleChangePlan(plan.code);
                                    } else if (action.kind === "legacy") {
                                      void handleLegacyStripeCheckout(plan.code);
                                    } else {
                                      void handleRazorpayCheckout(plan.code);
                                    }
                                  }}
                                  className={`mt-6 w-full rounded-rk-md px-4 py-3 text-xs font-extrabold transition disabled:opacity-60 ${
                                    isPopular
                                      ? "bg-rk-surface text-rk-ink hover:bg-rk-soft"
                                      : "bg-rk-ink text-white hover:opacity-90"
                                  }`}
                                >
                                  {isBusy
                                    ? payPhase === "awaiting-payment"
                                      ? "Waiting for payment..."
                                      : payPhase === "verifying"
                                        ? "Verifying payment..."
                                        : payPhase === "confirming"
                                          ? "Confirming subscription..."
                                          : "Processing..."
                                    : action.label}
                                </button>
                              ) : isCurrent ? (
                                <div
                                  className={`mt-6 flex items-center justify-center gap-2 rounded-rk-md px-4 py-3 text-xs font-extrabold ${
                                    isPopular
                                      ? "bg-rk-surface/10 text-white"
                                      : "bg-rk-soft text-rk-secondary"
                                  }`}
                                >
                                  <CheckCircle2 size={14} />
                                  Current plan
                                </div>
                              ) : action.label ? (
                                <div
                                  className="mt-6 w-full rounded-rk-md bg-rk-soft px-4 py-3 text-center text-xs font-extrabold text-rk-muted"
                                  title={action.reason}
                                >
                                  {action.label}
                                </div>
                              ) : null}

                              {!isCurrent && (
                                <div
                                  className={`mt-2 text-center text-[10px] font-semibold ${
                                    isPopular ? "text-white/60" : "text-rk-muted"
                                  }`}
                                >
                                  14-day trial available
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    {plans.some((plan) => plan.code === "FREE") && (
                      <div className="border-t border-rk-border bg-rk-soft/70 px-6 py-4">
                        {plans
                          .filter((plan) => plan.code === "FREE")
                          .map((plan) => (
                            <div
                              key={plan.code}
                              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <div className="text-sm font-bold text-rk-ink">
                                  {plan.name}
                                </div>
                                <p className="mt-0.5 text-xs text-rk-secondary">
                                  {plan.description}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-rk-secondary">
                                <span className="rounded-full border border-rk-border bg-rk-surface px-3 py-1.5">
                                  {plan.maxWebsites} website
                                </span>
                                <span className="rounded-full border border-rk-border bg-rk-surface px-3 py-1.5">
                                  {plan.maxKeywords} keywords
                                </span>
                                <span className="rounded-full border border-rk-border bg-rk-surface px-3 py-1.5">
                                  {plan.maxCrawlCredits} crawl credits
                                </span>
                                <span className="rounded-full border border-rk-border bg-rk-surface px-3 py-1.5">
                                  No card required
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}

                    <div className="border-t border-rk-border px-6 py-7">
                      <div className="mb-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-rk-muted">
                          Compare capacity
                        </div>
                        <h3 className="mt-1 text-lg font-bold text-rk-ink">
                          More room to execute as you scale
                        </h3>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] border-collapse text-left">
                          <thead>
                            <tr className="border-b border-rk-border">
                              <th className="px-3 py-3 text-xs font-bold text-rk-secondary">
                                Capacity
                              </th>
                              {plans
                                .filter((plan) => plan.code !== "FREE")
                                .map((plan) => (
                                  <th
                                    key={plan.code}
                                    className="px-3 py-3 text-right text-xs font-extrabold text-slate-600"
                                  >
                                    {plan.name}
                                  </th>
                                ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ["Websites", "maxWebsites"],
                              ["Keywords", "maxKeywords"],
                              ["AI prompts", "maxAiPrompts"],
                              ["Competitors", "maxCompetitors"],
                              ["Reports / month", "maxReports"],
                              ["Growth actions / month", "maxAiGrowthActions"],
                              ["Team seats", "maxTeamMembers"],
                              ["Clients", "maxClients"],
                              ["Crawl credits", "maxCrawlCredits"],
                              ["API calls", "maxApiCalls"],
                            ].map(([label, key]) => (
                              <tr key={label} className="border-b border-slate-100 last:border-0">
                                <td className="px-3 py-3 text-xs font-semibold text-slate-600">
                                  {label}
                                </td>
                                {plans
                                  .filter((plan) => plan.code !== "FREE")
                                  .map((plan) => {
                                    const value = (plan as unknown as Record<string, number | null>)[key];
                                    return (
                                      <td
                                        key={`${plan.code}-${key}`}
                                        className="px-3 py-3 text-right text-xs font-bold tabular-nums text-slate-900"
                                      >
                                        {value === null || value === undefined
                                          ? "Unlimited"
                                          : value.toLocaleString()}
                                      </td>
                                    );
                                  })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6 rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm">
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



