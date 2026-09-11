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
 *
 * PRESENTATION NOTE: this file's billing logic (handlers, routing,
 * verification, provider gating, API contracts) is authoritative and
 * untouched. Only the JSX presentation below was redesigned.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  RefreshCw,
  LockKeyhole,
  AlertTriangle,
  ShieldCheck,
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
import {
  TRIAL_DAYS,
  coreLimitBullets,
  formatCount,
  getCatalogPlan,
} from "@/lib/plans";

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

/* =========================================================
 * Presentation-only helpers. Every number rendered below
 * comes from the live backend plan row (`plans`) or the
 * verified catalog mirror (display copy + enforced flags).
 * Nothing commercial is hardcoded here.
 * ========================================================= */

const PAID_ORDER = [
  "STARTER",
  "GROWTH",
  "SCALE",
  "AGENCY",
] as const;

function paidRank(code: string): number {
  const index = PAID_ORDER.indexOf(
    code as (typeof PAID_ORDER)[number],
  );
  return index === -1 ? 99 : index;
}

/*
 * Card eyebrows (outcome labels). The positioning sentence under
 * each plan name renders the live backend plan description
 * verbatim — never reworded here.
 */
const AUDIENCE: Record<string, string> = {
  STARTER: "Solo marketer",
  GROWTH: "Growing business",
  SCALE: "Multi-site team",
  AGENCY: "Client operation",
};

/*
 * Value progression, computed from the verified catalog mirror
 * (which tracks backend plans.config.ts). No numbers hardcoded.
 */
interface UpgradeStep {
  from: string;
  to: string;
  toCode: string;
  points: string[];
}

function upgradeSteps(): UpgradeStep[] {
  const growth = getCatalogPlan("GROWTH")?.limits;
  const scale = getCatalogPlan("SCALE")?.limits;
  const agency = getCatalogPlan("AGENCY")?.limits;
  const steps: UpgradeStep[] = [];

  if (growth) {
    steps.push({
      from: "Starter",
      to: "Growth",
      toCode: "GROWTH",
      points: [
        `${formatCount(growth.websites)} websites`,
        `${formatCount(growth.keywords)} tracked keywords`,
        `${formatCount(growth.competitors)} competitors`,
        `${formatCount(growth.crawlCredits)} crawl credits / month`,
        `${formatCount(growth.aiGrowthActionsPerMonth)} growth actions / month`,
      ],
    });
  }

  if (scale) {
    steps.push({
      from: "Growth",
      to: "Scale",
      toCode: "SCALE",
      points: [
        `${formatCount(scale.websites)} websites`,
        `${formatCount(scale.keywords)} tracked keywords`,
        `${formatCount(scale.competitors)} competitors`,
        `${formatCount(scale.teamMembers)} team seats`,
        `${formatCount(scale.clients)} client workspaces`,
      ],
    });
  }

  if (agency) {
    steps.push({
      from: "Scale",
      to: "Agency",
      toCode: "AGENCY",
      points: [
        `${formatCount(agency.websites)} websites`,
        `${formatCount(agency.keywords)} tracked keywords`,
        `${formatCount(agency.clients)} client workspaces`,
        `${formatCount(agency.teamMembers)} team seats`,
        "Agency reporting",
      ],
    });
  }

  return steps;
}

/* One supported differentiator per plan (capability/flag-backed). */
const DIFFERENTIATORS: Record<string, string[]> = {
  STARTER: ["AEO + GEO insights", "AI Business Brain"],
  GROWTH: ["14-day trial eligible", "Monitoring + reports"],
  SCALE: ["Advanced monitoring", "Higher capacity on every limit"],
  AGENCY: ["Agency reporting", "Advanced monitoring"],
};

/*
 * Card facts: 4–6 items max. Capacity numbers come from the live
 * backend row; the differentiator is display copy for an
 * implemented capability. Detailed features live in the
 * comparison section, not here.
 */
function cardFacts(plan: BillingPlan): string[] {
  const limits = coreLimitBullets(plan).slice(0, 4);
  const extras = DIFFERENTIATORS[plan.code] ?? [];
  return [...limits, ...extras].slice(0, 6);
}

/* Real savings from authoritative backend values — never invented. */
function savingsFor(plan: BillingPlan): {
  save: number;
  pct: number;
} | null {
  if (plan.monthlyPrice <= 0 || plan.yearlyPrice <= 0) {
    return null;
  }
  const annual = plan.monthlyPrice * 12;
  const save = annual - plan.yearlyPrice;
  if (save <= 0) return null;
  return { save, pct: Math.round((save / annual) * 100) };
}

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

interface CompareRow {
  label: string;
  values: Record<string, string>;
}

interface CompareGroup {
  group: string;
  hint?: string;
  rows: CompareRow[];
}

function liveCount(
  plan: BillingPlan,
  key: keyof BillingPlan,
): string {
  const value = plan[key];
  if (value === null || value === undefined) {
    return "Unlimited";
  }
  if (typeof value === "number") {
    if (
      (key === "maxClients" || key === "maxUsers") &&
      value === 0
    ) {
      return "—";
    }
    return value.toLocaleString();
  }
  return "—";
}

/*
 * Grouped comparison. Capacity cells come from live backend rows;
 * capability cells come from the verified catalog mirror (which
 * tracks backend FEATURE_TIERS). No commercial claim is invented.
 */
function buildComparison(
  paidPlans: BillingPlan[],
): CompareGroup[] {
  const codes = paidPlans.map((plan) => plan.code);
  const flag = (
    code: string,
    key: "advancedMonitoring" | "scheduledReports",
  ): boolean =>
    getCatalogPlan(code)?.flags[key] ?? false;
  const agencyReporting = (code: string): boolean =>
    /* Phase 41 (Group H): single flag source — the
     * catalog mirror of PLAN_FEATURE_TIERS.agency
     * (AGENCY + SCALE), never a local code rule. */
    getCatalogPlan(code)?.flags.agency ?? false;

  const uniform = (
    label: string,
    value: string,
  ): CompareRow => ({
    label,
    values: Object.fromEntries(
      codes.map((code) => [code, value]),
    ),
  });

  const perPlan = (
    label: string,
    fn: (plan: BillingPlan) => string,
  ): CompareRow => ({
    label,
    values: Object.fromEntries(
      paidPlans.map((plan) => [plan.code, fn(plan)]),
    ),
  });

  return [
    {
      group: "Core",
      hint: "Enforced capacity on every plan",
      rows: [
        perPlan("Websites", (plan) =>
          liveCount(plan, "maxWebsites"),
        ),
        perPlan("Tracked keywords", (plan) =>
          liveCount(plan, "maxKeywords"),
        ),
        perPlan("Crawl credits / month", (plan) =>
          liveCount(plan, "maxCrawlCredits"),
        ),
        perPlan("AI scans / month", (plan) =>
          liveCount(plan, "maxAiScans"),
        ),
      ],
    },
    {
      group: "SEO",
      rows: [
        uniform(
          "Technical SEO audits",
          "Yes",
        ),
        uniform("Google Search Console + GA4", "Yes"),
        uniform("Local SEO", "Yes"),
        uniform("Content engine", "Yes"),
      ],
    },
    {
      group: "AI Visibility",
      rows: [
        uniform("AI search visibility tracking", "Yes"),
        uniform("AI Business Brain", "Yes"),
        perPlan("AI prompts tracked", (plan) =>
          liveCount(plan, "maxAiPrompts"),
        ),
      ],
    },
    {
      group: "GEO / AEO",
      rows: [uniform("AEO + GEO insights", "Yes")],
    },
    {
      group: "Competitors",
      rows: [
        perPlan("Competitors tracked", (plan) =>
          liveCount(plan, "maxCompetitors"),
        ),
        uniform(
          "Competitor + backlink intelligence",
          "Yes",
        ),
      ],
    },
    {
      group: "Monitoring",
      rows: [
        {
          label: "Monitoring depth",
          values: Object.fromEntries(
            codes.map((code) => [
              code,
              flag(code, "advancedMonitoring")
                ? "Advanced"
                : "Standard",
            ]),
          ),
        },
      ],
    },
    {
      group: "Actions",
      rows: [
        uniform(
          "Ranked opportunities + tracked actions",
          "Yes",
        ),
        perPlan("AI credits", (plan) =>
          liveCount(plan, "maxAiCredits"),
        ),
      ],
    },
    {
      group: "Leads & Revenue",
      rows: [
        uniform("Leads & revenue tracking", "Yes"),
        uniform("ROI reporting", "Yes"),
      ],
    },
    {
      group: "Reporting",
      rows: [
        perPlan("Reports / month", (plan) =>
          liveCount(plan, "maxReports"),
        ),
        /* Phase 40 paid-tier honesty: runtime answers
         * supported:false for scheduled delivery, so the
         * comparison must not print "Yes". Runtime
         * truth wins over entitlement flags. */
        {
          label: "Scheduled reports",
          values: Object.fromEntries(
            codes.map((code) => [
              code,
              "Coming soon",
            ]),
          ),
        },
      ],
    },
    {
      group: "Team",
      rows: [
        perPlan("Team seats", (plan) =>
          liveCount(plan, "maxUsers"),
        ),
        uniform("Team collaboration", "Yes"),
      ],
    },
    {
      group: "Clients",
      hint: "Where agency work separates from single-site plans",
      rows: [
        perPlan("Client workspaces", (plan) =>
          liveCount(plan, "maxClients"),
        ),
      ],
    },
    {
      group: "Agency",
      rows: [
        {
          label: "Agency reporting",
          values: Object.fromEntries(
            codes.map((code) => [
              code,
              agencyReporting(code) ? "Yes" : "—",
            ]),
          ),
        },
      ],
    },
    {
      /* Phase 41 (Group H): apiCalls is internal
       * provider/data metering (DataForSEO + Google
       * reads RENKOO performs), NOT a customer-facing
       * public API — no public API exists
       * (deliveryTruth.apiAccess is UNAVAILABLE).
       * Never label this row as API access. */
      group: "Data & provider usage",
      hint: "Internal metering for data RENKOO fetches — not a public API",
      rows: [
        perPlan("Provider data credits / month", (plan) =>
          liveCount(plan, "maxApiCalls"),
        ),
      ],
    },
  ];
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

  const paidPlans = [...plans]
    .filter((plan) => plan.code !== "FREE")
    .sort(
      (a, b) => paidRank(a.code) - paidRank(b.code),
    );
  const freePlan = plans.find(
    (plan) => plan.code === "FREE",
  );
  const comparison = buildComparison(paidPlans);
  const maxYearlyPct = paidPlans.reduce(
    (max, plan) => {
      const saving = savingsFor(plan);
      return saving && saving.pct > max
        ? saving.pct
        : max;
    },
    0,
  );
  const currentPlanName =
    entitlements?.planName ||
    subscription?.plan?.name ||
    "Free";
  const currentStatus =
    entitlements?.status || rawStatus || "FREE";
  const displayCurrency =
    paidPlans[0]?.currency || "INR";

  return (
    <AppShell
      mobileOpen={open}
      onClose={() => setOpen(false)}
      onMenu={() => setOpen(true)}
    >
      <section className="rk-page mx-auto w-full max-w-6xl overflow-x-clip">
        {/* 1 — Pricing hero */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-2xl">
            <p className="rk-label">Billing &amp; Plans</p>
            <h1 className="mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.03em] text-rk-ink sm:text-[30px]">
              Pricing that scales with your growth
            </h1>
            <p className="mt-2 text-sm leading-6 text-rk-secondary">
              SEO, AI visibility and growth operations in
              one command center — with real limits,
              verified billing and no surprises.
              Downgrades never delete data.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rk-border bg-rk-surface px-3 py-1 text-xs font-bold text-rk-ink">
                <BadgeCheck
                  size={14}
                  className="text-rk-success"
                  aria-hidden
                />
                Current plan: {currentPlanName}
                <span className="font-semibold text-rk-muted">
                  · {currentStatus}
                </span>
              </span>
              {entitlements?.cancelAtPeriodEnd && (
                <span className="rounded-full bg-rk-warningSoft px-2.5 py-1 text-[11px] font-bold text-rk-warning">
                  Canceling at period end
                </span>
              )}
              {!subscription && (
                <span className="rounded-full bg-rk-accentSoft px-2.5 py-1 text-[11px] font-bold text-rk-accent">
                  {TRIAL_DAYS}-day trial available on
                  Growth
                </span>
              )}
            </div>
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
            {/* B — Manage your subscription (status, usage, entitlements) */}
            <div className="mt-8">
              <p className="rk-label">
                Manage your subscription
              </p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-rk-ink">
                Your current billing status
              </h2>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-rk-muted">
                  Current plan
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-rk-ink">
                  {entitlements?.planName || "Free"}
                  {(entitlements?.isInternal ||
                    entitlements?.planCode ===
                      "INTERNAL") && (
                    <span className="rounded-full border border-dashed border-slate-300 bg-slate-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Internal Test
                    </span>
                  )}
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
                      className="rk-focusable inline-flex min-h-[40px] items-center rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {busy === "trial"
                        ? "Starting..."
                        : `Start ${TRIAL_DAYS}-day free trial`}
                    </button>
                  )}
                  {showReactivate && (
                    <button
                      type="button"
                      disabled={busy === "reactivate"}
                      onClick={() =>
                        setReactivateOpen(true)
                      }
                      className="rk-focusable inline-flex min-h-[40px] items-center rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
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
                        className="rk-focusable inline-flex min-h-[40px] items-center rounded-rk-md border border-red-200 bg-rk-surface px-4 py-2 text-xs font-bold text-rk-danger hover:bg-rk-dangerSoft disabled:opacity-60"
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
                    className="rk-focusable inline-flex min-h-[40px] items-center rounded-rk-md border border-rk-border px-4 py-2 text-xs font-bold text-slate-600 hover:bg-rk-soft disabled:opacity-60"
                  >
                    {busy === "portal"
                      ? "Opening..."
                      : "Customer portal"}
                  </button>
                </div>
              </div>

              <div className="rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm lg:col-span-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-rk-muted">
                    Usage &amp; limits
                  </div>
                  <div className="text-[11px] font-semibold text-rk-muted">
                    Hitting a limit never deletes data —
                    upgrade to raise it.
                  </div>
                </div>

                {!usage ? (
                  <p className="mt-3 text-sm text-rk-muted">
                    Usage unavailable.
                  </p>
                ) : (
                  <dl className="mt-2 divide-y divide-slate-100">
                    {Object.entries(usage.usage).map(
                      ([metric, item]) => {
                        const used = item.used;
                        const limit = item.limit;
                        const measurable =
                          used !== null &&
                          limit !== null;
                        const pct =
                          used !== null &&
                          limit !== null
                            ? Math.min(
                                100,
                                Math.round(
                                  (used /
                                    Math.max(
                                      limit,
                                      1,
                                    )) *
                                    100,
                                ),
                              )
                            : 0;
                        const tone =
                          used === null ||
                          limit === null
                            ? "none"
                            : item.remaining === 0 ||
                                pct >= 100
                              ? "exhausted"
                              : pct >= 80
                                ? "near"
                                : "normal";
                        return (
                          <div
                            key={metric}
                            className="py-2.5"
                          >
                            <div className="flex items-baseline justify-between gap-3">
                              <dt className="text-[13px] font-semibold text-rk-ink">
                                {USAGE_LABELS[metric] ||
                                  metric}
                              </dt>
                              <dd className="shrink-0 text-[13px] font-bold tabular-nums text-rk-ink">
                                {used === null ? (
                                  <span className="font-semibold text-rk-muted">
                                    —
                                  </span>
                                ) : limit === null ? (
                                  <span>
                                    {used.toLocaleString()}{" "}
                                    <span className="font-semibold text-rk-success">
                                      · Unlimited
                                    </span>
                                  </span>
                                ) : (
                                  <span>
                                    {used.toLocaleString()}{" "}
                                    <span className="font-semibold text-rk-muted">
                                      /{" "}
                                      {limit.toLocaleString()}
                                    </span>
                                  </span>
                                )}
                              </dd>
                            </div>
                            {measurable ? (
                              <div className="mt-1.5 flex items-center gap-2">
                                <div
                                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                                  role="presentation"
                                >
                                  <div
                                    className={`rk-usage-bar h-full rounded-full ${
                                      tone === "exhausted"
                                        ? "bg-rk-danger"
                                        : tone === "near"
                                          ? "bg-amber-500"
                                          : "bg-rk-accent"
                                    }`}
                                    style={{
                                      width: `${pct}%`,
                                    }}
                                  />
                                </div>
                                <span
                                  className={`w-10 shrink-0 text-right text-[11px] font-bold tabular-nums ${
                                    tone === "exhausted"
                                      ? "text-rk-danger"
                                      : tone === "near"
                                        ? "text-rk-warning"
                                        : "text-rk-muted"
                                  }`}
                                >
                                  {pct}%
                                </span>
                              </div>
                            ) : (
                              <p className="mt-1 text-[12px] text-rk-muted">
                                {used !== null
                                  ? "Unlimited on this plan — usage is not metered."
                                  : "Not reliably measurable — unavailable, never zero-filled."}
                              </p>
                            )}
                          </div>
                        );
                      },
                    )}
                  </dl>
                )}
              </div>
            </div>

            {entitlements && (
              <div className="mt-4 rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-rk-muted">
                  Entitlements
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(
                    entitlements.features,
                  ).map(([feature, allowed]) => {
                    /* Phase 40 paid-tier honesty: these
                     * entitlements have no runtime
                     * delivery (see /first-value delivery
                     * truth). Never render them ON. */
                    const undelivered =
                      feature === "whiteLabel" ||
                      feature === "scheduledReports" ||
                      feature === "api";
                    return (
                      <span
                        key={feature}
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          allowed && !undelivered
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-rk-secondary"
                        }`}
                        title={
                          undelivered
                            ? "Entitled on this plan; delivery coming soon — not marketed as available."
                            : undefined
                        }
                      >
                        {FEATURE_LABELS[feature] || feature}:{" "}
                        {undelivered
                          ? "Coming soon"
                          : allowed
                            ? "ON"
                            : "OFF"}
                      </span>
                    );
                  })}
                </div>
                {entitlements.customPricing && (
                  <p className="mt-3 text-xs text-rk-secondary">
                    Custom Enterprise pricing — contact
                    sales for terms.
                  </p>
                )}
              </div>
            )}

            {/* 2/3/4 — Plans: toggle + currency + cards */}
            <div className="mt-6 overflow-hidden rounded-rk-lg border border-rk-border bg-rk-surface shadow-sm">
              <div className="border-b border-rk-border bg-rk-soft px-6 py-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-rk-secondary">
                      Choose a plan
                    </div>
                    <h2 className="mt-1 text-xl font-extrabold tracking-tight text-rk-ink sm:text-2xl">
                      Plans built around growth, not just
                      SEO
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-rk-secondary">
                      Start with the essentials, then
                      unlock deeper intelligence and
                      agency workflows as your growth
                      operation scales. Prices are served
                      by the billing service.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Monthly / yearly toggle */}
                    <div
                      className="flex items-center gap-1 rounded-rk-md border border-rk-border bg-rk-surface p-1 shadow-sm"
                      role="group"
                      aria-label="Billing period"
                    >
                      {(
                        [
                          { key: false, label: "Monthly" },
                          { key: true, label: "Yearly" },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          aria-pressed={
                            yearly === option.key
                          }
                          onClick={() =>
                            setYearly(option.key)
                          }
                          className={`rk-focusable rounded-lg px-4 py-2 text-xs font-bold transition ${
                            yearly === option.key
                              ? "bg-rk-ink text-white shadow-sm"
                              : "text-rk-secondary hover:bg-rk-soft"
                          }`}
                        >
                          {option.label}
                          {option.key &&
                            maxYearlyPct > 0 && (
                              <span className="ml-1.5 rounded-full bg-rk-successSoft px-1.5 py-0.5 text-[10px] font-bold text-rk-success">
                                −{maxYearlyPct}%
                              </span>
                            )}
                        </button>
                      ))}
                    </div>

                    {/* INR / USD checkout currency */}
                    <div
                      className="flex items-center gap-1 rounded-rk-md border border-rk-border bg-rk-surface p-1 shadow-sm"
                      role="radiogroup"
                      aria-label="Checkout currency"
                    >
                      {(["INR", "USD"] as const).map(
                        (option) => {
                          const pending =
                            option === "USD" &&
                            !usdAvailable;
                          return (
                            <button
                              key={option}
                              type="button"
                              role="radio"
                              aria-checked={
                                currency === option
                              }
                              title={
                                pending
                                  ? "USD checkout is pending Razorpay international-cards activation"
                                  : `${option} checkout via Razorpay`
                              }
                              onClick={() =>
                                setCurrency(option)
                              }
                              className={`rk-focusable flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition ${
                                currency === option
                                  ? "bg-rk-ink text-white shadow-sm"
                                  : "text-rk-secondary hover:bg-rk-soft"
                              }`}
                            >
                              {option}
                              {pending && (
                                <span
                                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                                  aria-hidden
                                />
                              )}
                            </button>
                          );
                        },
                      )}
                    </div>
                  </div>
                </div>

                <p
                  className="mt-4 text-xs leading-5 text-rk-secondary"
                  id="currency-help"
                >
                  Prices shown in {displayCurrency} ·
                  checkout in {currency}.{" "}
                  {currency === "INR" ? (
                    <>
                      INR checkout via Razorpay
                      {razorpayConfigured
                        ? " is available."
                        : " activates once Razorpay is configured."}{" "}
                      {yearly
                        ? "Yearly totals below are charged once per year."
                        : "Monthly billing, cancel anytime."}
                    </>
                  ) : usdAvailable ? (
                    <>
                      USD checkout via Razorpay is
                      available. USD billing uses Razorpay
                      USD plan pricing.
                    </>
                  ) : (
                    <>
                      International card payments are
                      currently being activated. USD
                      checkout stays disabled until
                      Razorpay confirms activation; INR
                      checkout remains available.
                    </>
                  )}
                </p>
              </div>

              {paidPlans.length === 0 ? (
                <p className="p-6 text-sm text-rk-muted">
                  No public plans configured.
                </p>
              ) : (
                <>
                  {/* Desktop 4-col · tablet 2-col · mobile 1-col */}
                  <div className="grid gap-4 bg-rk-bg p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
                    {paidPlans.map((plan) => {
                      const isCurrent =
                        plan.code === currentCode;
                      const price = yearly
                        ? plan.yearlyPrice
                        : plan.monthlyPrice;
                      const saving = savingsFor(plan);
                      const action = planAction(plan);
                      const isBusy = busy === plan.code;
                      const catalog = getCatalogPlan(
                        plan.code,
                      );
                      const isPopular =
                        catalog?.popular ?? false;
                      const audience =
                        AUDIENCE[plan.code];
                      const facts = cardFacts(plan);

                      return (
                        <div
                          key={plan.code}
                           className={`rk-plan-card relative flex flex-col rounded-rk-lg border bg-rk-surface p-6 sm:p-7 ${
                            isPopular
                              ? "rk-plan-popular xl:-translate-y-1"
                              : isCurrent
                                ? "border-rk-strong"
                                : "border-rk-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-rk-muted">
                              {audience ||
                                plan.description ||
                                "Plan"}
                            </div>
                            {isPopular ? (
                              <span className="rk-badge-in rounded-full bg-rk-accent px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                                Most popular
                              </span>
                            ) : isCurrent ? (
                              <span className="rk-badge-in flex items-center gap-1 rounded-full bg-rk-ink px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                                <CheckCircle2 size={11} />
                                Current
                              </span>
                            ) : null}
                          </div>

                          <h3 className="mt-2 text-xl font-extrabold tracking-tight text-rk-ink">
                            {plan.name}
                          </h3>
                          <p className="mt-1.5 min-h-[40px] text-[14px] font-medium leading-5 text-rk-ink">
                            {plan.description}
                          </p>

                          {/* Price region animates only (150–250ms) */}
                          <div className="mt-4" aria-live="polite">
                            <div
                              key={`${plan.code}-${yearly}-${price}`}
                              className="rk-price-swap flex items-end gap-1"
                            >
                              <span className="text-[36px] font-extrabold leading-none tracking-tight tabular-nums text-rk-ink sm:text-[40px]">
                                {money(
                                  price,
                                  plan.currency || "INR",
                                )}
                              </span>
                              <span className="mb-1 text-xs font-semibold text-rk-muted">
                                /{yearly ? "yr" : "mo"}
                              </span>
                            </div>
                            <div className="mt-1 min-h-[32px] text-[11px] leading-4 text-rk-muted">
                              {yearly ? (
                                saving ? (
                                  <>
                                    Billed annually ·{" "}
                                    {money(
                                      plan.yearlyPrice,
                                      plan.currency ||
                                        "INR",
                                    )}
                                    /year ·{" "}
                                    <span className="font-bold text-rk-success">
                                      Save{" "}
                                      {money(
                                        saving.save,
                                        plan.currency ||
                                          "INR",
                                      )}{" "}
                                      ({saving.pct}%)
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    Billed annually ·{" "}
                                    {money(
                                      plan.yearlyPrice,
                                      plan.currency ||
                                        "INR",
                                    )}
                                    /year
                                  </>
                                )
                              ) : saving ? (
                                <>
                                  or{" "}
                                  {money(
                                    plan.yearlyPrice,
                                    plan.currency || "INR",
                                  )}
                                  /year ·{" "}
                                  <span className="font-bold text-rk-success">
                                    save {saving.pct}%
                                  </span>
                                </>
                              ) : (
                                <>Billed monthly</>
                              )}
                            </div>
                          </div>

                          {plan.code === "AGENCY" &&
                            catalog && (
                              <p className="mt-3 rounded-rk-md bg-rk-soft px-3 py-2 text-[11px] font-semibold leading-4 tabular-nums text-rk-secondary">
                                Run your client growth
                                operation from one
                                workspace ·{" "}
                                {formatCount(
                                  catalog.limits.clients,
                                )}{" "}
                                client workspaces ·{" "}
                                {formatCount(
                                  catalog.limits.teamMembers,
                                )}{" "}
                                team seats · agency
                                reporting.
                              </p>
                            )}

                          <ul className="mt-4 flex-1 space-y-2 border-t border-rk-border pt-4">
                            {facts.map((fact) => (
                              <li
                                key={fact}
                                className="flex items-start gap-2 text-[13px] font-medium leading-5 text-rk-ink"
                              >
                                <CheckCircle2
                                  size={15}
                                  aria-hidden
                                  className="mt-0.5 shrink-0 text-rk-success"
                                />
                                {fact}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-3 text-[11px] font-semibold text-rk-muted">
                            Full limits in the comparison
                            below.
                          </p>

                          {!isCurrent &&
                          action.kind !== "none" ? (
                            <button
                              type="button"
                              disabled={isBusy || !!busy}
                              aria-describedby="currency-help"
                              onClick={() => {
                                if (
                                  action.kind === "change"
                                ) {
                                  void handleChangePlan(
                                    plan.code,
                                  );
                                } else if (
                                  action.kind === "legacy"
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
                              className={`rk-focusable mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-rk-md px-4 py-2.5 text-[14px] font-bold transition disabled:opacity-60 ${
                                isPopular
                                  ? "bg-rk-accent text-white hover:bg-rk-ink"
                                  : "bg-rk-ink text-white hover:opacity-90"
                              }`}
                            >
                              {isBusy
                                ? payPhase ===
                                  "awaiting-payment"
                                  ? "Waiting for payment..."
                                  : payPhase === "verifying"
                                    ? "Verifying payment..."
                                    : payPhase ===
                                        "confirming"
                                      ? "Confirming subscription..."
                                      : "Processing..."
                                : action.label}
                            </button>
                          ) : isCurrent ? (
                            <div className="mt-4 flex items-center justify-center gap-2 rounded-rk-md bg-rk-soft px-4 py-2.5 text-[13px] font-bold text-rk-secondary">
                              <CheckCircle2 size={14} />
                              Current plan
                            </div>
                          ) : action.label ? (
                            <div
                              className="mt-4 w-full rounded-rk-md bg-rk-soft px-4 py-2.5 text-center text-[13px] font-bold text-rk-muted"
                              title={action.reason}
                            >
                              {action.label}
                            </div>
                          ) : null}

                          {!isCurrent &&
                            catalog?.trialEligible && (
                              <div className="mt-2 text-center text-[11px] font-semibold text-rk-muted">
                                {TRIAL_DAYS}-day trial
                                available
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>

                  {freePlan && (
                    <div className="border-t border-rk-border bg-rk-surface px-6 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-bold text-rk-ink">
                            {freePlan.name}
                          </div>
                          <p className="mt-0.5 text-xs text-rk-secondary">
                            {freePlan.description} No card
                            required.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-rk-secondary">
                          <span className="rounded-full border border-rk-border bg-rk-surface px-3 py-1.5">
                            {freePlan.maxWebsites} website
                          </span>
                          <span className="rounded-full border border-rk-border bg-rk-surface px-3 py-1.5">
                            {freePlan.maxKeywords} keywords
                          </span>
                          <span className="rounded-full border border-rk-border bg-rk-surface px-3 py-1.5">
                            {freePlan.maxCrawlCredits} crawl
                            credits
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* F — Why upgrade? Value progression from real catalog limits */}
            <div className="mt-6 rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm sm:p-7">
              <p className="rk-label">Why upgrade?</p>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-rk-ink">
                More room to execute at every step
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-rk-secondary">
                Every number below is an enforced plan
                limit from the billing catalog — not
                marketing copy. Downgrades never delete
                data, and canceling keeps access until
                the end of the period.
              </p>
              <ol className="mt-5 grid gap-4 md:grid-cols-3">
                {upgradeSteps().map((step) => (
                  <li
                    key={`${step.from}-${step.to}`}
                    className={`rounded-rk-md border p-5 ${
                      step.toCode === currentCode
                        ? "border-rk-strong bg-rk-soft"
                        : "border-rk-border bg-rk-surface"
                    }`}
                  >
                    <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-rk-muted">
                      {step.from}
                      <ArrowRight
                        size={14}
                        aria-hidden
                        className="text-rk-accent"
                      />
                      <span className="text-rk-ink">
                        {step.to}
                      </span>
                      {step.toCode === currentCode && (
                        <span className="rounded-full bg-rk-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-white">
                          Current
                        </span>
                      )}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {step.points.map((point) => (
                        <li
                          key={point}
                          className="flex items-start gap-2 text-[13px] font-semibold leading-5 tabular-nums text-rk-ink"
                        >
                          <CheckCircle2
                            size={15}
                            aria-hidden
                            className="mt-0.5 shrink-0 text-rk-success"
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>

            {/* 6 — Detailed feature comparison */}
            <div className="mt-6 overflow-hidden rounded-rk-lg border border-rk-border bg-rk-surface shadow-sm">
              <div className="border-b border-rk-border px-6 py-6">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-rk-secondary">
                  Compare in detail
                </div>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight text-rk-ink">
                  Every limit, side by side
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-rk-secondary">
                  Capacity numbers are enforced backend
                  limits. Bold values differ between
                  plans; muted values are the same
                  everywhere.
                </p>
              </div>

              <div
                className="rk-compare-reveal rk-scroll-region overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Plan comparison by feature group. Use arrow keys to scroll horizontally."
              >
                <table className="w-full min-w-[680px] border-collapse text-left">
                  <caption className="sr-only">
                    Capacity and feature limits by plan
                  </caption>
                  <thead className="sticky top-0 z-10 bg-rk-surface">
                    <tr className="border-b border-rk-border">
                      <th
                        scope="col"
                        className="min-w-[180px] px-6 py-3.5 text-xs font-bold text-rk-secondary"
                      >
                        <span className="sr-only">
                          Feature
                        </span>
                      </th>
                      {paidPlans.map((plan) => (
                        <th
                          key={plan.code}
                          scope="col"
                          className={`px-3 py-3.5 text-right ${
                            getCatalogPlan(plan.code)
                              ?.popular
                              ? "bg-rk-accentSoft"
                              : ""
                          }`}
                        >
                          {getCatalogPlan(plan.code)
                            ?.popular && (
                            <span
                              className="mx-auto mb-1 block h-0.5 w-8 rounded-full bg-rk-accent"
                              aria-hidden
                            />
                          )}
                          <span className="block text-[13px] font-extrabold text-rk-ink">
                            {plan.name}
                          </span>
                          <span className="block text-[11px] font-semibold text-rk-muted">
                            {money(
                              yearly
                                ? plan.yearlyPrice
                                : plan.monthlyPrice,
                              plan.currency || "INR",
                            )}
                            /{yearly ? "yr" : "mo"}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  {comparison.map((section) => (
                    <tbody key={section.group}>
                      <tr>
                        <td
                          colSpan={paidPlans.length + 1}
                          className="bg-rk-soft px-6 pb-1 pt-4"
                        >
                          <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-rk-accent">
                            {section.group}
                          </span>
                          {section.hint && (
                            <span className="ml-2 text-[11px] font-medium text-rk-muted">
                              {section.hint}
                            </span>
                          )}
                        </td>
                      </tr>
                      {section.rows.map((row) => {
                        const varied =
                          new Set(
                            Object.values(row.values),
                          ).size > 1;
                        return (
                          <tr
                            key={row.label}
                            className="rk-table-row border-b border-slate-100 last:border-b-0"
                          >
                            <th
                              scope="row"
                              className="px-6 py-2.5 text-[13px] font-semibold text-rk-secondary"
                            >
                              {row.label}
                            </th>
                            {paidPlans.map((plan) => (
                              <td
                                key={`${plan.code}-${row.label}`}
                                className={`px-3 py-2.5 text-right text-[13px] tabular-nums ${
                                  varied
                                    ? "font-bold text-rk-ink"
                                    : "font-medium text-rk-muted"
                                } ${
                                  plan.code ===
                                    currentCode &&
                                  varied
                                    ? "bg-rk-accentSoft"
                                    : ""
                                }`}
                              >
                                {row.values[plan.code] ??
                                  "—"}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>

            {/* 7 — Billing reassurance */}
            <div className="mt-6 rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={16}
                  className="text-rk-success"
                  aria-hidden
                />
                <h2 className="text-sm font-bold text-rk-ink">
                  Billing, honestly
                </h2>
              </div>
              <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                {[
                  "Secure checkout via Razorpay. Only the public Key ID reaches your browser — secrets never leave the backend.",
                  "Paid access activates only after backend verification. A payment popup alone never marks a subscription active.",
                  `Growth includes a ${TRIAL_DAYS}-day trial. Nothing is charged unless you subscribe.`,
                  "Cancel anytime — access continues until the end of the billing period.",
                  "Hitting a limit never deletes data. Upgrade to raise the limit and continue.",
                  "Yearly billing is charged once per year at the annual total shown. Taxes depend on provider settings and appear at checkout.",
                ].map((note) => (
                  <li
                    key={note}
                    className="flex items-start gap-2 text-[13px] font-medium leading-5 text-rk-ink"
                  >
                    <CheckCircle2
                      size={15}
                      aria-hidden
                      className="mt-0.5 shrink-0 text-rk-success"
                    />
                    {note}
                  </li>
                ))}
              </ul>
            </div>

            {/* Payment history (preserved functionality) */}
            <div className="mt-6 rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm">
              <h2 className="text-sm font-bold text-rk-ink">
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
                            className="rk-focusable text-xs font-bold text-rk-accent hover:underline"
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

            {/* 8 — FAQ (only supported, existing behavior) */}
            <div className="mt-6 rounded-rk-lg border border-rk-border bg-rk-surface p-6 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-rk-secondary">
                Help
              </div>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-rk-ink">
                Frequently asked questions
              </h2>
              <div className="mt-4 divide-y divide-slate-100">
                {[
                  {
                    q: "How does the free trial work?",
                    a: `Growth includes a ${TRIAL_DAYS}-day trial. Nothing is charged unless you subscribe — expired trials return to free limits and your data stays intact.`,
                  },
                  {
                    q: "When is my subscription activated?",
                    a: "Only after backend verification reports ACTIVE. If payment succeeds but confirmation is still in flight, the page polls and asks you to press Refresh — nothing is lost.",
                  },
                  {
                    q: "What happens if I upgrade or switch plans?",
                    a: "Use Switch plan on your card. The change is applied immediately or at the cycle boundary as confirmed in the success message, and your data is preserved.",
                  },
                  {
                    q: "What happens if I downgrade or cancel?",
                    a: "Cancellation takes effect at the end of the current period with full access until then. Downgrades never delete websites, clients, reports or history.",
                  },
                  {
                    q: "Can I pay in USD?",
                    a: "USD checkout depends on Razorpay international-cards activation for this installation. While pending, USD shows an unavailable state and INR checkout remains fully available.",
                  },
                  {
                    q: "What happens when I hit a limit?",
                    a: "New usage is limited but nothing is deleted. Upgrade to raise the limit and continue — usage meters above show exactly where you stand.",
                  },
                ].map((item) => (
                  <details
                    key={item.q}
                    className="group py-3"
                  >
                    <summary className="rk-focusable cursor-pointer list-none text-sm font-bold text-rk-ink marker:hidden [&::-webkit-details-marker]:hidden">
                      <span className="flex items-center justify-between gap-3">
                        {item.q}
                        <ArrowRight
                          size={14}
                          aria-hidden
                          className="shrink-0 rotate-90 text-rk-muted transition-transform group-open:-rotate-90"
                        />
                      </span>
                    </summary>
                    <p className="mt-1.5 text-[13px] leading-5 text-rk-secondary">
                      {item.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>

            {/* 9 — Final CTA */}
            <div className="mt-6 flex flex-col gap-4 rounded-rk-lg border border-rk-border bg-rk-ink p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-7">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight">
                  {subscription
                    ? "Your growth operation is funded. Scale it."
                    : "Find your biggest growth issue today."}
                </h2>
                <p className="mt-1 text-[13px] leading-5 text-white/70">
                  {subscription
                    ? "Compare capacity above and switch plans when your usage demands it."
                    : `Start with a ${TRIAL_DAYS}-day Growth trial — no card required to explore.`}
                </p>
              </div>
              {!subscription ? (
                <button
                  type="button"
                  disabled={busy === "trial"}
                  onClick={handleTrial}
                  className="rk-focusable inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-rk-md bg-white px-6 text-sm font-bold text-rk-ink hover:bg-rk-soft disabled:opacity-60"
                >
                  {busy === "trial"
                    ? "Starting..."
                    : `Start ${TRIAL_DAYS}-day trial`}
                  <ArrowRight size={15} aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy === "portal"}
                  onClick={handlePortal}
                  className="rk-focusable inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-rk-md bg-white px-6 text-sm font-bold text-rk-ink hover:bg-rk-soft disabled:opacity-60"
                >
                  {busy === "portal"
                    ? "Opening..."
                    : "Manage billing"}
                  <ArrowRight size={15} aria-hidden />
                </button>
              )}
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
