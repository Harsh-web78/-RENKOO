/*
 * =========================================================
 * INTEGRATION HUB + DATA CONNECTIVITY 1.0 — pure
 * capability registry (Phase 21).
 *
 * "Connect once. Unlock more of RENKOO."
 * CONNECTION → CAPABILITY → EVIDENCE → DECISION.
 *
 * Rules:
 * - Capabilities are a pure registry + composition.
 *   No CapabilityScore model, no polling, no secrets.
 * - Unavailable is never zero. Approval is never
 *   promised. Freshness is never faked.
 * - Tokens, secrets and raw provider errors never
 *   reach users; error UX names what failed, why,
 *   what still works, and what to do.
 * =========================================================
 */

export type ConnectionState =
  | 'NOT_CONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'PARTIALLY_CONNECTED'
  | 'REAUTH_REQUIRED'
  | 'ACCESS_DENIED'
  | 'NOT_APPROVED'
  | 'CONFIGURATION_REQUIRED'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_UNAVAILABLE'
  | 'DISCONNECTED';

export type CapabilityStatus =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'NOT_CONNECTED'
  | 'NOT_APPROVED'
  | 'REQUIRES_CONFIGURATION'
  | 'PROVIDER_UNAVAILABLE';

export type FreshnessState =
  | 'FRESH'
  | 'RECENT'
  | 'STALE'
  | 'NEVER_SYNCED'
  | 'UNAVAILABLE';

export type ProviderKey =
  | 'GOOGLE_SEARCH_CONSOLE'
  | 'GOOGLE_ANALYTICS'
  | 'GOOGLE_BUSINESS_PROFILE'
  | 'BING_WEBMASTER'
  | 'DATAFORSEO'
  | 'BACKLINK_PROVIDER'
  | 'AI_PROVIDERS'
  | 'AI_MONITORING'
  | 'RESEND';

export interface CapabilityDefinition {
  key: string;
  label: string;
  provider: ProviderKey;
  unlocks: string;
  limitation: string;
}

/* Source-specific freshness thresholds (days),
 * documented per provider data reality. */
export const FRESHNESS_THRESHOLDS: Record<
  string,
  { freshDays: number; recentDays: number }
> = {
  GOOGLE_SEARCH_CONSOLE: { freshDays: 4, recentDays: 10 },
  GOOGLE_ANALYTICS: { freshDays: 3, recentDays: 8 },
  GOOGLE_BUSINESS_PROFILE: { freshDays: 8, recentDays: 21 },
  BING_WEBMASTER: { freshDays: 4, recentDays: 10 },
  DATAFORSEO: { freshDays: 15, recentDays: 30 },
  BACKLINK_PROVIDER: { freshDays: 15, recentDays: 45 },
  AI_PROVIDERS: { freshDays: 8, recentDays: 21 },
  AI_MONITORING: { freshDays: 8, recentDays: 21 },
  RESEND: { freshDays: 31, recentDays: 90 },
};

export const CAPABILITY_REGISTRY: readonly CapabilityDefinition[] =
  [
    {
      key: 'SEARCH_BASELINE',
      label: 'Search demand baseline',
      provider: 'GOOGLE_SEARCH_CONSOLE',
      unlocks: 'Search demand, query and page performance windows',
      limitation: 'GSC data ends ~2 days before today; never treated as zero.',
    },
    {
      key: 'QUERY_DATA',
      label: 'Query performance',
      provider: 'GOOGLE_SEARCH_CONSOLE',
      unlocks: 'Query impressions, clicks, CTR and estimated position',
      limitation: 'Impression-weighted estimated position, not exact rank.',
    },
    {
      key: 'PAGE_DATA',
      label: 'Page performance',
      provider: 'GOOGLE_SEARCH_CONSOLE',
      unlocks: 'Page impressions, clicks, CTR and query×page rows',
      limitation: 'Row limit applies; capped sets are labeled.',
    },
    {
      key: 'CTR_INTELLIGENCE',
      label: 'CTR intelligence',
      provider: 'GOOGLE_SEARCH_CONSOLE',
      unlocks: 'High-visibility low-capture and commercial CTR gaps',
      limitation: 'Low CTR is never proven zero-click.',
    },
    {
      key: 'RANK_GSC_HISTORY',
      label: 'GSC ranking history',
      provider: 'GOOGLE_SEARCH_CONSOLE',
      unlocks: 'Windowed position history for tracked queries',
      limitation: 'Window averages, not live SERP positions.',
    },
    {
      key: 'TRAFFIC',
      label: 'Site traffic',
      provider: 'GOOGLE_ANALYTICS',
      unlocks: 'Users, sessions and engagement from GA4',
      limitation: 'GA4 traffic and GSC clicks are different measurements.',
    },
    {
      key: 'LANDING_PAGE_SESSIONS',
      label: 'Landing-page sessions',
      provider: 'GOOGLE_ANALYTICS',
      unlocks: 'Page-level session and engagement context',
      limitation: 'Keyword-level attribution is not exposed by GA4.',
    },
    {
      key: 'CONVERSION_EVENTS',
      label: 'Conversion events',
      provider: 'GOOGLE_ANALYTICS',
      unlocks: 'GA4 conversion and event context',
      limitation: 'Only events the property actually collects.',
    },
    {
      key: 'BUSINESS_PROFILE',
      label: 'Business profile data',
      provider: 'GOOGLE_BUSINESS_PROFILE',
      unlocks: 'Profile, location and supported business data',
      limitation: 'Requires approved access and user authorization.',
    },
    {
      key: 'PROFILE_PERFORMANCE',
      label: 'Profile performance',
      provider: 'GOOGLE_BUSINESS_PROFILE',
      unlocks: 'Supported performance insights where the API provides them',
      limitation: 'Metrics unavailable unless the API returns them.',
    },
    {
      key: 'REVIEWS',
      label: 'Review data',
      provider: 'GOOGLE_BUSINESS_PROFILE',
      unlocks: 'Supported review data where the API provides it',
      limitation: 'No review score is ever computed.',
    },
    {
      key: 'CALL_INSIGHTS',
      label: 'Call insights',
      provider: 'GOOGLE_BUSINESS_PROFILE',
      unlocks: 'Supported call insights where the API provides them',
      limitation: 'Calls are never inferred from lead phone fields.',
    },
    {
      key: 'BING_SEARCH_PERFORMANCE',
      label: 'Bing search performance',
      provider: 'BING_WEBMASTER',
      unlocks: 'Bing rank, traffic and keyword data via REST',
      limitation: 'Never merged with Google rank.',
    },
    {
      key: 'BING_CRAWL',
      label: 'Bing crawl data',
      provider: 'BING_WEBMASTER',
      unlocks: 'Bing crawl statistics for verified sites',
      limitation: 'REST endpoints only; no legacy SOAP.',
    },
    {
      key: 'BING_LINK_DATA',
      label: 'Bing link data',
      provider: 'BING_WEBMASTER',
      unlocks: 'Bing link data for verified sites',
      limitation: 'Completeness depends on Bing coverage.',
    },
    {
      key: 'KEYWORD_RESEARCH',
      label: 'Keyword research data',
      provider: 'DATAFORSEO',
      unlocks: 'Volume, difficulty, CPC, SERP features and clustering',
      limitation: 'Metered usage; allowance limits apply.',
    },
    {
      key: 'BACKLINK_INDEX',
      label: 'Backlink index',
      provider: 'BACKLINK_PROVIDER',
      unlocks: 'Complete backlink and referring-domain coverage',
      limitation: 'RENKOO builds no own index; manual evidence otherwise.',
    },
    {
      key: 'COMPETITOR_LINK_GAP',
      label: 'Competitor link gaps',
      provider: 'BACKLINK_PROVIDER',
      unlocks: 'Competitor referring-domain intersections',
      limitation: 'Completeness unavailable without a provider.',
    },
    {
      key: 'AI_VISIBILITY',
      label: 'AI visibility monitoring',
      provider: 'AI_MONITORING',
      unlocks: 'Mentions, citations and prompt history',
      limitation: 'A visit is never a citation; citation is never traffic.',
    },
    {
      key: 'AI_GENERATION',
      label: 'AI-assisted generation',
      provider: 'AI_PROVIDERS',
      unlocks: 'Briefs, drafts and prompt execution where configured',
      limitation: 'Metered; generated prose never invents metrics.',
    },
    {
      key: 'REPORT_EMAIL_DELIVERY',
      label: 'Report email delivery',
      provider: 'RESEND',
      unlocks: 'Secure report share links by email',
      limitation: 'No PDF attachment; link-based delivery only.',
    },
  ];

export function capabilitiesFor(
  provider: ProviderKey,
): CapabilityDefinition[] {
  return CAPABILITY_REGISTRY.filter(
    (entry) => entry.provider === provider,
  );
}

export function freshnessOf(
  provider: string,
  lastSuccessfulSync: string | null,
): FreshnessState {
  if (!lastSuccessfulSync) return 'NEVER_SYNCED';
  const sync = new Date(lastSuccessfulSync);
  if (Number.isNaN(sync.getTime())) return 'UNAVAILABLE';
  const ageDays =
    (Date.now() - sync.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < 0) return 'UNAVAILABLE';
  const thresholds = FRESHNESS_THRESHOLDS[provider] ?? {
    freshDays: 7,
    recentDays: 21,
  };
  if (ageDays <= thresholds.freshDays) return 'FRESH';
  if (ageDays <= thresholds.recentDays) return 'RECENT';
  return 'STALE';
}

export function connectionAction(
  state: ConnectionState,
): 'CONNECT' | 'RECONNECT' | 'CONFIGURE' | 'REQUEST_ACCESS' | 'IMPORT_DATA' | 'NONE' {
  switch (state) {
    case 'NOT_CONNECTED':
    case 'DISCONNECTED':
      return 'CONNECT';
    case 'REAUTH_REQUIRED':
    case 'ACCESS_DENIED':
    case 'PROVIDER_ERROR':
      return 'RECONNECT';
    case 'CONFIGURATION_REQUIRED':
      return 'CONFIGURE';
    case 'NOT_APPROVED':
      return 'REQUEST_ACCESS';
    case 'PARTIALLY_CONNECTED':
      return 'CONNECT';
    case 'PROVIDER_UNAVAILABLE':
      return 'IMPORT_DATA';
    default:
      return 'NONE';
  }
}

export function errorUx(input: {
  provider: string;
  code: string | null;
  hasPriorData: boolean;
}): {
  what: string;
  why: string;
  action: string;
  dataNote: string;
} {
  const name = String(input.provider).replace(/_/g, ' ');
  const reason =
    input.code === 'TOKEN_REVOKED' || input.code === 'REAUTH_REQUIRED'
      ? 'Authorization expired or was revoked.'
      : input.code === 'ACCESS_DENIED'
        ? 'Access was denied for the requested data.'
        : input.code === 'NOT_APPROVED'
          ? 'Provider approval is required and not granted.'
          : input.code === 'PROVIDER_ERROR'
            ? 'The provider returned an error.'
            : 'The last synchronization attempt did not complete.';
  return {
    what: `${name} synchronization did not complete.`,
    why: reason,
    action: 'Reconnect the integration to restore fresh data.',
    dataNote: input.hasPriorData
      ? 'Existing data remains available with its original evidence state.'
      : 'No prior data is available for this integration.',
  };
}

/* Onboarding personalization from business context. */
export function onboardingIntegrations(input: {
  isLocal: boolean;
  isAgency: boolean;
}): ProviderKey[] {
  if (input.isAgency)
    return [
      'GOOGLE_SEARCH_CONSOLE',
      'GOOGLE_ANALYTICS',
      'GOOGLE_BUSINESS_PROFILE',
      'BING_WEBMASTER',
      'AI_MONITORING',
      'DATAFORSEO',
      'BACKLINK_PROVIDER',
    ];
  if (input.isLocal)
    return [
      'GOOGLE_SEARCH_CONSOLE',
      'GOOGLE_ANALYTICS',
      'GOOGLE_BUSINESS_PROFILE',
    ];
  return [
    'GOOGLE_SEARCH_CONSOLE',
    'GOOGLE_ANALYTICS',
    'AI_MONITORING',
  ];
}

export function permissionPurpose(
  provider: ProviderKey,
): string {
  switch (provider) {
    case 'GOOGLE_SEARCH_CONSOLE':
      return 'Read your Search Console performance data.';
    case 'GOOGLE_ANALYTICS':
      return 'Read your Analytics reporting data.';
    case 'GOOGLE_BUSINESS_PROFILE':
      return 'Access the business profiles you authorize so RENKOO can read supported location and performance data. Google approval may be required.';
    case 'BING_WEBMASTER':
      return 'Read webmaster data for sites you verify.';
    case 'DATAFORSEO':
      return 'Use configured SEO data allowance for research.';
    case 'BACKLINK_PROVIDER':
      return 'Read backlink index data where a provider is configured.';
    case 'AI_PROVIDERS':
      return 'Execute AI-assisted generation within allowance.';
    case 'AI_MONITORING':
      return 'Run scheduled AI visibility observations.';
    case 'RESEND':
      return 'Deliver report share links by email.';
    default:
      return 'Read the data you authorize.';
  }
}
