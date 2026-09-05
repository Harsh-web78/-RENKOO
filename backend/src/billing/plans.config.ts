/*
 * =========================================================
 * CENTRALIZED COMMERCIAL PRICING — SINGLE SOURCE OF TRUTH
 *
 * Change prices, limits, features or positioning here.
 * No controller, component or service may hardcode
 * commercial amounts. DB Plan rows are synced from
 * this file (syncPlansFromConfig); Razorpay amounts
 * and the frontend pricing surface resolve here.
 *
 * Currency note: Plan rows are canonical in INR.
 * USD amounts below are planned commercial pricing;
 * USD checkout stays disabled until the Razorpay
 * account confirms international-cards activation.
 * =========================================================
 */

export type BillingInterval =
  | 'MONTHLY'
  | 'YEARLY';

export type PlanCurrency = 'INR' | 'USD';

export interface PlanPrice {
  monthly: number;
  yearlyTotal: number;
  yearlyMonthlyEquivalent: number;
}

export interface PlanEntitlements {
  websites: number;
  keywords: number;
  aiPrompts: number;
  competitors: number;
  reportsPerMonth: number;
  aiGrowthActionsPerMonth: number;
  teamMembers: number;
  aiGenerationsPerMonth: number | null;
  clients: number;
  crawlCredits: number;
  apiCalls: number;
  aiScans: number;
}

export interface CommercialPlan {
  code: string;
  name: string;
  tagline: string;
  description: string;
  popular: boolean;
  trialEligible: boolean;
  inr: PlanPrice;
  usd: PlanPrice;
  entitlements: PlanEntitlements;
  features: string[];
}

export const TRIAL_PLAN_CODE = 'GROWTH';
export const TRIAL_DAYS = 14;

export const FREE_AI_GENERATIONS_PER_MONTH = 5;

export const PLAN_ORDER = [
  'FREE',
  'STARTER',
  'GROWTH',
  'SCALE',
  'AGENCY',
] as const;

export const COMMERCIAL_PLANS: CommercialPlan[] =
  [
    {
      code: 'FREE',
      name: 'Explore RENKOO',
      tagline: 'Free',
      description:
        'For discovering RENKOO and understanding your growth opportunities.',
      popular: false,
      trialEligible: false,
      inr: {
        monthly: 0,
        yearlyTotal: 0,
        yearlyMonthlyEquivalent: 0,
      },
      usd: {
        monthly: 0,
        yearlyTotal: 0,
        yearlyMonthlyEquivalent: 0,
      },
      entitlements: {
        websites: 1,
        keywords: 50,
        aiPrompts: 10,
        competitors: 1,
        reportsPerMonth: 3,
        aiGrowthActionsPerMonth: 3,
        teamMembers: 1,
        aiGenerationsPerMonth: 5,
        clients: 0,
        crawlCredits: 5,
        apiCalls: 200,
        aiScans: 5,
      },
      features: [
        'TECHNICAL_SEO',
        'SEARCH_CONSOLE',
        'GA4',
        'AI_VISIBILITY',
        'BUSINESS_BRAIN',
        'OPPORTUNITIES',
        'ACTIONS',
        'LEADS_REVENUE',
        'ROI',
        'REPORTS',
      ],
    },
    {
      code: 'STARTER',
      name: 'Starter',
      tagline: 'Start Growing',
      description:
        'For solo marketers and small businesses.',
      popular: false,
      trialEligible: false,
      inr: {
        monthly: 1999,
        yearlyTotal: 17988,
        yearlyMonthlyEquivalent: 1499,
      },
      usd: {
        monthly: 29,
        yearlyTotal: 288,
        yearlyMonthlyEquivalent: 24,
      },
      entitlements: {
        websites: 1,
        keywords: 500,
        aiPrompts: 50,
        competitors: 3,
        reportsPerMonth: 5,
        aiGrowthActionsPerMonth: 100,
        teamMembers: 1,
        aiGenerationsPerMonth: null,
        clients: 0,
        crawlCredits: 10,
        apiCalls: 1000,
        aiScans: 10,
      },
      features: [
        'TECHNICAL_SEO',
        'SEARCH_CONSOLE',
        'GA4',
        'AI_VISIBILITY',
        'AEO',
        'GEO',
        'CONTENT_ENGINE',
        'COMPETITOR_INTELLIGENCE',
        'BACKLINK_INTELLIGENCE',
        'LOCAL_SEO',
        'BUSINESS_BRAIN',
        'OPPORTUNITIES',
        'ACTIONS',
        'MONITORING',
        'INTELLIGENCE',
        'AI_WORKERS',
        'LEADS_REVENUE',
        'ROI',
        'REPORTS',
        'TEAM_COLLABORATION',
      ],
    },
    {
      code: 'GROWTH',
      name: 'Growth',
      tagline: 'Start 14-Day Trial',
      description:
        'For businesses serious about organic and AI growth.',
      popular: true,
      trialEligible: true,
      inr: {
        monthly: 4999,
        yearlyTotal: 44988,
        yearlyMonthlyEquivalent: 3749,
      },
      usd: {
        monthly: 79,
        yearlyTotal: 792,
        yearlyMonthlyEquivalent: 66,
      },
      entitlements: {
        websites: 3,
        keywords: 1500,
        aiPrompts: 150,
        competitors: 10,
        reportsPerMonth: 20,
        aiGrowthActionsPerMonth: 500,
        teamMembers: 3,
        aiGenerationsPerMonth: null,
        clients: 5,
        crawlCredits: 50,
        apiCalls: 5000,
        aiScans: 50,
      },
      features: [
        'TECHNICAL_SEO',
        'SEARCH_CONSOLE',
        'GA4',
        'AI_VISIBILITY',
        'AEO',
        'GEO',
        'CONTENT_ENGINE',
        'COMPETITOR_INTELLIGENCE',
        'BACKLINK_INTELLIGENCE',
        'LOCAL_SEO',
        'BUSINESS_BRAIN',
        'OPPORTUNITIES',
        'ACTIONS',
        'MONITORING',
        'INTELLIGENCE',
        'AI_WORKERS',
        'LEADS_REVENUE',
        'ROI',
        'REPORTS',
        'TEAM_COLLABORATION',
      ],
    },
    {
      code: 'SCALE',
      name: 'Scale',
      tagline: 'Scale Growth',
      description:
        'For teams managing multiple websites and growth workflows.',
      popular: false,
      trialEligible: false,
      inr: {
        monthly: 9999,
        yearlyTotal: 89988,
        yearlyMonthlyEquivalent: 7499,
      },
      usd: {
        monthly: 149,
        yearlyTotal: 1488,
        yearlyMonthlyEquivalent: 124,
      },
      entitlements: {
        websites: 10,
        keywords: 5000,
        aiPrompts: 500,
        competitors: 25,
        reportsPerMonth: 100,
        aiGrowthActionsPerMonth: 2000,
        teamMembers: 10,
        aiGenerationsPerMonth: null,
        clients: 25,
        crawlCredits: 200,
        apiCalls: 20000,
        aiScans: 200,
      },
      features: [
        'TECHNICAL_SEO',
        'SEARCH_CONSOLE',
        'GA4',
        'AI_VISIBILITY',
        'AEO',
        'GEO',
        'CONTENT_ENGINE',
        'COMPETITOR_INTELLIGENCE',
        'BACKLINK_INTELLIGENCE',
        'LOCAL_SEO',
        'BUSINESS_BRAIN',
        'OPPORTUNITIES',
        'ACTIONS',
        'MONITORING',
        'INTELLIGENCE',
        'AI_WORKERS',
        'LEADS_REVENUE',
        'ROI',
        'REPORTS',
        'TEAM_COLLABORATION',
        'WHITE_LABEL',
        'API_ACCESS',
      ],
    },
    {
      code: 'AGENCY',
      name: 'Agency',
      tagline: 'Run Your Agency',
      description:
        'For agencies managing client growth at scale.',
      popular: false,
      trialEligible: false,
      inr: {
        monthly: 24999,
        yearlyTotal: 224988,
        yearlyMonthlyEquivalent: 18749,
      },
      usd: {
        monthly: 399,
        yearlyTotal: 3984,
        yearlyMonthlyEquivalent: 332,
      },
      entitlements: {
        websites: 30,
        keywords: 15000,
        aiPrompts: 1500,
        competitors: 100,
        reportsPerMonth: 500,
        aiGrowthActionsPerMonth: 10000,
        teamMembers: 25,
        aiGenerationsPerMonth: null,
        clients: 100,
        crawlCredits: 1000,
        apiCalls: 100000,
        aiScans: 1000,
      },
      features: [
        'TECHNICAL_SEO',
        'SEARCH_CONSOLE',
        'GA4',
        'AI_VISIBILITY',
        'AEO',
        'GEO',
        'CONTENT_ENGINE',
        'COMPETITOR_INTELLIGENCE',
        'BACKLINK_INTELLIGENCE',
        'LOCAL_SEO',
        'BUSINESS_BRAIN',
        'OPPORTUNITIES',
        'ACTIONS',
        'MONITORING',
        'INTELLIGENCE',
        'AI_WORKERS',
        'LEADS_REVENUE',
        'ROI',
        'REPORTS',
        'AGENCY_OS',
        'CLIENT_PORTAL',
        'WHITE_LABEL',
        'TEAM_COLLABORATION',
        'API_ACCESS',
      ],
    },
  ];

export function getCommercialPlan(
  code: string,
): CommercialPlan | null {
  return (
    COMMERCIAL_PLANS.find(
      (plan) => plan.code === code,
    ) ?? null
  );
}

export function priceFor(
  code: string,
  interval: BillingInterval,
  currency: PlanCurrency,
): number | null {
  const plan = getCommercialPlan(code);

  if (!plan || code === 'FREE') {
    return null;
  }

  const book =
    currency === 'INR' ? plan.inr : plan.usd;

  return interval === 'MONTHLY'
    ? book.monthly
    : book.yearlyTotal;
}

export function planRank(code: string): number {
  const index = PLAN_ORDER.indexOf(
    code as (typeof PLAN_ORDER)[number],
  );

  return index === -1 ? -1 : index;
}
