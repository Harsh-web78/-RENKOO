/*
 * =========================================================
 * RENKOO PLAN CATALOG — FRONTEND SINGLE SOURCE OF TRUTH
 *
 * Mirror of the backend commercial config. The backend
 * remains authoritative for billing and enforcement:
 *   backend/src/billing/plans.config.ts      (prices, limits,
 *     feature capability lists, trial, plan order)
 *   backend/src/billing/billing.service.ts   (FEATURE_TIERS —
 *     the enforced whiteLabel / scheduledReports / agency /
 *     api / advancedMonitoring flags)
 *
 * RULES:
 * - Update this file together with the backend config.
 *   Never invent prices or limits here.
 * - `frontend/scripts/verify-plans-mirror.mjs` checks that
 *   every number below still matches the backend config.
 * - The authenticated /billing page renders live API values
 *   for prices and capacity; this catalog supplies display
 *   copy, capability names, and plan-aware paywall titles.
 * - The public /pricing page renders from this catalog
 *   (no authenticated API is available pre-login).
 * - Capability names listed here cover implemented product
 *   modules only. White-label, API access, scheduled
 *   reports and client-portal claims are intentionally NOT
 *   advertised: no implementation exists behind those
 *   backend flags today.
 * =========================================================
 */

export type PlanCode =
  | 'FREE'
  | 'STARTER'
  | 'GROWTH'
  | 'SCALE'
  | 'AGENCY';

export interface PlanMoney {
  monthly: number;
  yearlyTotal: number;
  yearlyMonthlyEquivalent: number;
}

export interface PlanLimits {
  websites: number;
  keywords: number;
  aiPrompts: number;
  competitors: number;
  reportsPerMonth: number;
  aiGrowthActionsPerMonth: number;
  teamMembers: number;
  clients: number;
  crawlCredits: number;
  apiCalls: number;
  aiScans: number;
}

export interface PlanFlags {
  whiteLabel: boolean;
  scheduledReports: boolean;
  agency: boolean;
  api: boolean;
  advancedMonitoring: boolean;
}

export interface CatalogPlan {
  code: PlanCode;
  name: string;
  audience: string;
  valueProposition: string;
  description: string;
  popular: boolean;
  trialEligible: boolean;
  /** Visual emphasis variant on pricing surfaces. */
  emphasis: 'default' | 'popular' | 'agency';
  usd: PlanMoney;
  inr: PlanMoney;
  limits: PlanLimits;
  /** Enforced flags — mirrors backend FEATURE_TIERS. */
  flags: PlanFlags;
  /** Implemented capabilities, display names. */
  capabilities: string[];
  cta: string;
}

export const TRIAL_PLAN_CODE: PlanCode = 'GROWTH';
export const TRIAL_DAYS = 14;

export const PLAN_ORDER: PlanCode[] = [
  'FREE',
  'STARTER',
  'GROWTH',
  'SCALE',
  'AGENCY',
];

const CORE_CAPABILITIES = [
  'Technical SEO audits',
  'Google Search Console data',
  'Google Analytics (GA4) data',
  'AI search visibility tracking',
  'AEO + GEO insights',
  'Content engine',
  'Competitor intelligence',
  'Backlink intelligence',
  'Local SEO',
  'AI Business Brain',
  'Ranked opportunities + tracked actions',
  'Monitoring + reports',
  'Leads & revenue tracking',
  'ROI reporting',
];

export const CATALOG_PLANS: CatalogPlan[] = [
  {
    code: 'FREE',
    name: 'Explore RENKOO',
    audience: 'Trying RENKOO',
    valueProposition:
      'Discover your growth opportunities before you pay.',
    description:
      'For discovering RENKOO and understanding your growth opportunities.',
    popular: false,
    trialEligible: false,
    emphasis: 'default',
    usd: { monthly: 0, yearlyTotal: 0, yearlyMonthlyEquivalent: 0 },
    inr: { monthly: 0, yearlyTotal: 0, yearlyMonthlyEquivalent: 0 },
    limits: {
      websites: 1,
      keywords: 50,
      aiPrompts: 10,
      competitors: 1,
      reportsPerMonth: 3,
      aiGrowthActionsPerMonth: 3,
      teamMembers: 1,
      clients: 0,
      crawlCredits: 5,
      apiCalls: 200,
      aiScans: 5,
    },
    flags: {
      whiteLabel: false,
      scheduledReports: false,
      agency: false,
      api: false,
      advancedMonitoring: false,
    },
    capabilities: [
      'Technical SEO audits',
      'Google Search Console data',
      'Google Analytics (GA4) data',
      'AI search visibility tracking',
      'Ranked opportunities',
    ],
    cta: 'Get started free',
  },
  {
    code: 'STARTER',
    name: 'Starter',
    audience: 'Founders & small businesses',
    valueProposition: 'Start building your growth system.',
    description: 'For solo marketers and small businesses.',
    popular: false,
    trialEligible: false,
    emphasis: 'default',
    usd: { monthly: 29, yearlyTotal: 288, yearlyMonthlyEquivalent: 24 },
    inr: { monthly: 1999, yearlyTotal: 17988, yearlyMonthlyEquivalent: 1499 },
    limits: {
      websites: 1,
      keywords: 500,
      aiPrompts: 50,
      competitors: 3,
      reportsPerMonth: 5,
      aiGrowthActionsPerMonth: 100,
      teamMembers: 1,
      clients: 0,
      crawlCredits: 10,
      apiCalls: 1000,
      aiScans: 10,
    },
    flags: {
      whiteLabel: false,
      scheduledReports: false,
      agency: false,
      api: false,
      advancedMonitoring: false,
    },
    capabilities: CORE_CAPABILITIES,
    cta: 'Get started',
  },
  {
    code: 'GROWTH',
    name: 'Growth',
    audience: 'Growing businesses & SEO operators',
    valueProposition:
      'Turn SEO insights into a repeatable growth workflow.',
    description:
      'For businesses serious about organic and AI growth.',
    popular: true,
    trialEligible: true,
    emphasis: 'popular',
    usd: { monthly: 79, yearlyTotal: 792, yearlyMonthlyEquivalent: 66 },
    inr: { monthly: 4999, yearlyTotal: 44988, yearlyMonthlyEquivalent: 3749 },
    limits: {
      websites: 3,
      keywords: 1500,
      aiPrompts: 150,
      competitors: 10,
      reportsPerMonth: 20,
      aiGrowthActionsPerMonth: 500,
      teamMembers: 3,
      clients: 5,
      crawlCredits: 50,
      apiCalls: 5000,
      aiScans: 50,
    },
    flags: {
      whiteLabel: false,
      scheduledReports: false,
      agency: false,
      api: false,
      advancedMonitoring: false,
    },
    capabilities: [
      ...CORE_CAPABILITIES,
      '3 team seats',
      '5 client workspaces',
    ],
    cta: 'Start 14-day trial',
  },
  {
    code: 'SCALE',
    name: 'Scale',
    audience: 'Teams managing multiple websites',
    valueProposition:
      'High-volume growth intelligence for serious teams.',
    description:
      'For teams managing multiple websites and growth workflows.',
    popular: false,
    trialEligible: false,
    emphasis: 'default',
    usd: { monthly: 149, yearlyTotal: 1488, yearlyMonthlyEquivalent: 124 },
    inr: { monthly: 9999, yearlyTotal: 89988, yearlyMonthlyEquivalent: 7499 },
    limits: {
      websites: 10,
      keywords: 5000,
      aiPrompts: 500,
      competitors: 25,
      reportsPerMonth: 100,
      aiGrowthActionsPerMonth: 2000,
      teamMembers: 10,
      clients: 25,
      crawlCredits: 200,
      apiCalls: 20000,
      aiScans: 200,
    },
    flags: {
      whiteLabel: true,
      scheduledReports: true,
      agency: true,
      api: true,
      advancedMonitoring: true,
    },
    capabilities: [
      ...CORE_CAPABILITIES,
      '10 team seats',
      '25 client workspaces',
      'Advanced monitoring',
    ],
    cta: 'Scale up',
  },
  {
    code: 'AGENCY',
    name: 'Agency',
    audience: 'Agencies & multi-client operators',
    valueProposition:
      'Run your client SEO operation from one command center.',
    description: 'For agencies managing client growth at scale.',
    popular: false,
    trialEligible: false,
    emphasis: 'agency',
    usd: { monthly: 399, yearlyTotal: 3984, yearlyMonthlyEquivalent: 332 },
    inr: {
      monthly: 24999,
      yearlyTotal: 224988,
      yearlyMonthlyEquivalent: 18749,
    },
    limits: {
      websites: 30,
      keywords: 15000,
      aiPrompts: 1500,
      competitors: 100,
      reportsPerMonth: 500,
      aiGrowthActionsPerMonth: 10000,
      teamMembers: 25,
      clients: 100,
      crawlCredits: 1000,
      apiCalls: 100000,
      aiScans: 1000,
    },
    flags: {
      whiteLabel: true,
      scheduledReports: true,
      agency: true,
      api: false,
      advancedMonitoring: true,
    },
    capabilities: [
      ...CORE_CAPABILITIES,
      '25 team seats',
      '100 client workspaces',
      'Agency reporting',
      'Advanced monitoring',
    ],
    cta: 'Run your agency',
  },
];

export function getCatalogPlan(
  code: string | null | undefined,
): CatalogPlan | null {
  return (
    CATALOG_PLANS.find((plan) => plan.code === code) ??
    null
  );
}

export function planDisplayName(
  code: string | null | undefined,
): string {
  return getCatalogPlan(code)?.name ?? 'Current';
}

/**
 * Plan-aware paywall title. Uses the real plan code from
 * backend LIMIT_REACHED details — never hardcodes "Free".
 */
export function limitTitle(
  planCode: string | null | undefined,
): string {
  const plan = getCatalogPlan(planCode);

  if (!plan || plan.code === 'FREE') {
    return 'Free plan limit reached';
  }

  return `${plan.name} plan limit reached`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function pluralize(
  value: number,
  singular: string,
  plural?: string,
): string {
  return `${formatCount(value)} ${value === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/**
 * Capacity bullets from live API numbers (billing page).
 * Rendered from the backend plan row — never hardcoded.
 */
export function coreLimitBullets(plan: {
  maxWebsites?: number | null;
  maxKeywords?: number | null;
  maxCompetitors?: number | null;
  maxCrawlCredits?: number | null;
  maxClients?: number | null;
  maxUsers?: number | null;
}): string[] {
  const bullets: string[] = [];

  if (typeof plan.maxWebsites === 'number') {
    bullets.push(pluralize(plan.maxWebsites, 'website'));
  }

  if (typeof plan.maxKeywords === 'number') {
    bullets.push(
      `${pluralize(plan.maxKeywords, 'tracked keyword')}`,
    );
  }

  if (typeof plan.maxCompetitors === 'number') {
    bullets.push(pluralize(plan.maxCompetitors, 'competitor'));
  }

  if (typeof plan.maxCrawlCredits === 'number') {
    bullets.push(
      pluralize(plan.maxCrawlCredits, 'crawl credit'),
    );
  }

  if (
    typeof plan.maxClients === 'number' &&
    plan.maxClients > 0
  ) {
    bullets.push(
      pluralize(plan.maxClients, 'client workspace'),
    );
  }

  if (
    typeof plan.maxUsers === 'number' &&
    plan.maxUsers > 1
  ) {
    bullets.push(pluralize(plan.maxUsers, 'team seat'));
  }

  return bullets;
}

/** Paid plans for pricing surfaces (excludes FREE). */
export function paidCatalogPlans(): CatalogPlan[] {
  return CATALOG_PLANS.filter(
    (plan) => plan.code !== 'FREE',
  );
}
