/*
 * Production safety: the localhost fallback is dev-only.
 * In a real browser on a non-local host, a missing
 * NEXT_PUBLIC_API_URL throws an explicit configuration
 * error instead of silently calling a backend that can
 * never exist there. SSR/prerender (no window) keeps the
 * localhost default so builds never break.
 */
function resolveApiUrl(): string {
  const configured = (
    process.env.NEXT_PUBLIC_API_URL ?? ''
  ).replace(/\/+$/, '');

  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;

    if (host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(
        'RENKOO backend URL is not configured (NEXT_PUBLIC_API_URL).',
      );
    }
  }

  return 'http://localhost:4000/api';
}

const API_URL = resolveApiUrl();

/*
 * =========================================================
 * TYPES
 * =========================================================
 */

export interface User {
  userId: string;
  email: string;
  organizationId: string;
}

export interface Website {
  id: string;
  organizationId: string;
  clientId?: string | null;
  name: string;
  url: string;
  industry?: string | null;
  country?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthResponse {
  accessToken: string;
}

export interface Crawl {
  id: string;
  websiteId: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface CrawlSummary {
  crawlId: string;
  websiteId: string;

  score: number;
  pages: number;

  totalIssues: number;

  critical: number;
  high: number;
  medium: number;
  low: number;

  open: number;
  resolved: number;
  ignored: number;
  fixed: number;
}

export interface StartCrawlResponse {
  crawl: Crawl;
  pagesCrawled: number;
  pagesDiscovered: number;
  /*
   * Present on backends with per-page crawl
   * resilience. Optional to stay compatible
   * with responses from older deployments.
   */
  pagesFailed?: number;
  summary: CrawlSummary;
}

/*
 * =========================================================
 * SEO ISSUE TYPES
 * =========================================================
 */

export type SeoIssueStatus =
  | 'OPEN'
  | 'FIXED'
  | 'IGNORED';

export interface SeoIssuePage {
  id: string;
  url: string;
  statusCode?: number | null;
  title?: string | null;
  metaDescription?: string | null;
  canonical?: string | null;
}

export interface SeoIssue {
  id: string;

  code: string;
  category: string;
  severity: string;

  title: string;
  description: string;
  recommendation: string;

  status: SeoIssueStatus;

  createdAt: string;
  updatedAt?: string;

  crawlPage: SeoIssuePage;
}

export interface SeoIssuesResponse {
  crawlId: string;
  status: string;
  count: number;
  issues: SeoIssue[];
}

/*
 * =========================================================
 * GOOGLE SEARCH CONSOLE
 * =========================================================
 */

export interface GoogleProperty {
  siteUrl: string;
  permissionLevel: string | null;
}

export interface GoogleConnection {
  id?: string;
  organizationId?: string;

  googleUserId?: string;
  googleEmail?: string | null;
  googleName?: string | null;
  googlePicture?: string | null;

  accessToken?: string | null;
  refreshToken?: string | null;

  tokenExpiry?: string | null;
  scope?: string | null;

  selectedProperty?: string | null;
  selectedAnalyticsProperty?: string | null;

  createdAt?: string;
  updatedAt?: string;
}

export interface GoogleConnectionStatus {
  connected: boolean;

  selectedProperty: string | null;
  selectedAnalyticsProperty: string | null;

  googleEmail: string | null;
  googleName: string | null;
  googlePicture?: string | null;

  tokenExpiry?: string | null;
  scope?: string | null;
}

/*
 * =========================================================
 * GOOGLE SEARCH CONSOLE ANALYTICS
 * =========================================================
 */

export interface GoogleAnalyticsRow {
  keys?: string[] | null;

  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
}

export interface GoogleAnalytics {
  property: string;

  startDate: string;
  endDate: string;

  clicks: number;
  impressions: number;
  /* Phase 41 — null when the window has no measurable
   * rows/impressions (missing data, never measured
   * zero). Render '—'/unavailable, never 0. */
  ctr: number | null;
  averagePosition: number | null;
  state?: 'MEASURED' | 'INSUFFICIENT_DATA';

  rows: GoogleAnalyticsRow[];
}

/*
 * =========================================================
 * GOOGLE QUERY DATA
 * =========================================================
 */

export interface GoogleQueryRow {
  query: string;

  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GoogleQueriesResponse {
  property: string;

  startDate: string;
  endDate: string;

  rows: GoogleQueryRow[];
}

/*
 * =========================================================
 * GOOGLE PAGE DATA
 * =========================================================
 */

export interface GooglePageRow {
  page: string;

  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GooglePagesResponse {
  property: string;

  startDate: string;
  endDate: string;

  rows: GooglePageRow[];
}

/*
 * =========================================================
 * GOOGLE SEO OPPORTUNITIES
 * =========================================================
 */

export interface GoogleOpportunityRow {
  query: string;

  page: string | null;

  clicks: number;
  impressions: number;
  ctr: number;
  position: number;

  score: number;

  type: string;

  recommendation: string;
}

export interface GoogleOpportunitiesResponse {
  property: string;

  startDate: string;
  endDate: string;

  total: number;

  opportunities: GoogleOpportunityRow[];
}

/*
 * =========================================================
 * GOOGLE OPPORTUNITY ANALYSIS
 * =========================================================
 */

export interface GoogleOpportunityAnalysisCheck {
  status: string;

  impressions?: number;
  position?: number;
  clicks?: number;
  ctr?: number;
  page?: string | null;
}

export interface GoogleOpportunityAnalysis {
  property: string;

  startDate: string;
  endDate: string;

  query: string;

  page: string | null;

  clicks: number;
  impressions: number;
  ctr: number;
  position: number;

  priority: string;

  opportunityType: string;

  rankingStage: string;

  checks: {
    searchVisibility: GoogleOpportunityAnalysisCheck;
    ranking: GoogleOpportunityAnalysisCheck;
    clicks: GoogleOpportunityAnalysisCheck;
    ctr: GoogleOpportunityAnalysisCheck;
    pageMapping: GoogleOpportunityAnalysisCheck;
  };

  recommendations: string[];
}

/*
 * =========================================================
 * TOKEN
 * =========================================================
 */

function getToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem('renkoo_access_token');
}

function saveToken(token: string) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(
    'renkoo_access_token',
    token,
  );
}

export function clearToken() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('renkoo_access_token');
  invalidateSessionCache();
}

/*
 * Auth session helpers. Token lives in localStorage
 * (key renkoo_access_token); there is no cookie
 * session, so route protection must consult these
 * helpers client-side (see components/AuthGate).
 */
export function isAuthenticated() {
  return getToken() !== null;
}

export function logout() {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem('renkoo_access_token');
  // Persona is a per-device view preference; clear it
  // so the next account starts from the default view.
  localStorage.removeItem(
    'renkoo_persona_effective',
  );
  invalidateSessionCache();
}

export interface LimitDetails {
  metric?: string;
  used?: number;
  limit?: number;
  planCode?: string;
}

/*
 * Billing-limit recognition. Backend limit
 * rejections carry `code: 'LIMIT_REACHED'` plus
 * `details: { metric, used, limit, planCode }`.
 * Everything else (expired token, no crawl,
 * disconnected integration, provider outage)
 * must keep its own error state — never render
 * those as paywalls.
 */
export function isLimitError(
  error: unknown,
) {
  return (
    error instanceof Error &&
    (error as Error & { code?: string })
      .code === 'LIMIT_REACHED'
  );
}

export function limitDetails(
  error: unknown,
): LimitDetails {
  if (!(error instanceof Error)) {
    return {};
  }

  const details = (
    error as Error & {
      details?: unknown;
    }
  ).details;

  if (!details || typeof details !== 'object') {
    return {};
  }

  const record = details as Record<
    string,
    unknown
  >;

  return {
    metric:
      typeof record.metric === 'string'
        ? record.metric
        : undefined,
    used:
      typeof record.used === 'number'
        ? record.used
        : undefined,
    limit:
      typeof record.limit === 'number'
        ? record.limit
        : undefined,
    planCode:
      typeof record.planCode === 'string'
        ? record.planCode
        : undefined,
  };
}

export function limitUsageText(
  error: unknown,
) {
  const { used, limit } = limitDetails(error);

  if (
    typeof used === 'number' &&
    typeof limit === 'number'
  ) {
    return `Current usage: ${used} / ${limit}`;
  }

  return undefined;
}

/*
 * =========================================================
 * GENERIC API REQUEST
 * =========================================================
 */

/*
 * In-flight GET deduplication. When several mounted
 * components request the same resource concurrently
 * (e.g. AuthGate + AppShell both validating the
 * session, or a page + WebsiteSelector both listing
 * websites), they share one network call instead of
 * firing duplicates.
 *
 * Safety: entries live only while the request is in
 * flight and are deleted the moment it settles, so
 * sequential navigations always revalidate. Only GET
 * is deduplicated — mutations always hit the network.
 *
 * The token-scoped cached reads below (getMe,
 * getPersona, getWebsites, getCurrentAccount) route
 * through request() rather than doRequest() so that
 * concurrent cache misses for the same path — e.g.
 * AuthGate + AppShell both validating the session on
 * one mount, or a page + WebsiteSelector both listing
 * websites — share a single flight.
 */
const inflightRequests = new Map<
  string,
  Promise<unknown>
>();

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (
    options.method || 'GET'
  ).toUpperCase();

  if (method !== 'GET') {
    return doRequest<T>(path, options);
  }

  const key = `GET ${path}`;
  const pending = inflightRequests.get(key);

  if (pending) {
    return pending as Promise<T>;
  }

  const promise = doRequest<T>(
    path,
    options,
  ).finally(() => {
    if (inflightRequests.get(key) === promise) {
      inflightRequests.delete(key);
    }
  });

  inflightRequests.set(key, promise);

  return promise;
}

/*
 * Short-lived, token-scoped session cache for a
 * small set of slow-changing reads (session
 * validation, persona preference, website list,
 * account identity). Every entry records the token
 * it was fetched with: signing out, switching
 * account, or clearing the token can never serve
 * another session's data.
 *
 * Invalidation is wired into the matching mutations
 * in this same file (logout/clearToken clear
 * everything; login/register store a new token,
 * which mismatches older entries; create/update/
 * deleteWebsite drop the website list; setPersona
 * drops the persona; updateProfile drops the
 * account), so same-tab flows always read fresh
 * data after a change. Cross-tab staleness is
 * bounded by the TTL.
 */
interface SessionCacheEntry {
  token: string | null;
  expiresAt: number;
  value: unknown;
}

const sessionCache = new Map<
  string,
  SessionCacheEntry
>();

const SESSION_CACHE_TTL_MS = 60_000;

function cachedSessionRead<T>(
  key: string,
  loader: () => Promise<T>,
): Promise<T> {
  const token = getToken();
  const entry = sessionCache.get(key);

  if (
    entry &&
    entry.token === token &&
    Date.now() < entry.expiresAt
  ) {
    return Promise.resolve(
      entry.value as T,
    );
  }

  return loader().then((value) => {
    sessionCache.set(key, {
      token: getToken(),
      expiresAt:
        Date.now() + SESSION_CACHE_TTL_MS,
      value,
    });

    return value;
  });
}

export function invalidateSessionCache(
  key?: string,
) {
  if (key) {
    sessionCache.delete(key);
  } else {
    sessionCache.clear();
  }
}

/*
 * Prime one session entry with data already in
 * hand (e.g. from the dashboard bootstrap, which
 * returns the exact payloads these endpoints
 * serve). Entries are token-scoped with the same
 * TTL as fetched reads, so mutation invalidation
 * and sign-out semantics are unchanged — this
 * only skips a duplicate network round trip.
 */
export function primeSessionCache<T>(
  key: string,
  value: T,
) {
  sessionCache.set(key, {
    token: getToken(),
    expiresAt:
      Date.now() + SESSION_CACHE_TTL_MS,
    value,
  });
}

async function doRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const headers = new Headers(options.headers);

  headers.set('Accept', 'application/json');

  if (options.body) {
    headers.set(
      'Content-Type',
      'application/json',
    );
  }

  if (token) {
    headers.set(
      'Authorization',
      `Bearer ${token}`,
    );
  }

  const url = `${API_URL}${path}`;

  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
    });
  } catch (error) {
    console.error(
      'RENKOO API FETCH ERROR:',
      {
        url,
        error,
      },
    );

    // Lightweight monitoring: sanitized, no-op without DSN. Never throws.
    try {
      const { captureApiError } = await import('./monitoring');
      captureApiError({ url, method: options.method || 'GET' });
    } catch {
      // monitoring must never break API calls
    }

    throw new Error(
      `Cannot connect to RENKOO backend at ${API_URL}. Make sure NestJS is running on port 4000 and CORS is enabled.`,
    );
  }

  const contentType =
    response.headers.get('content-type') || '';

  let data: any = null;

  try {
    if (
      contentType.includes(
        'application/json',
      )
    ) {
      data = await response.json();
    } else {
      const text = await response.text();

      data = text
        ? { message: text }
        : null;
    }
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.message;

    const errorMessage =
      Array.isArray(message)
        ? message.join(', ')
        : typeof message === 'string'
          ? message
          : data?.error && typeof data.error === 'string'
            ? data.error
            : `Request failed with status ${response.status}`;

    console.error(
      'RENKOO API ERROR:',
      {
        url,
        method: options.method || 'GET',
        status: response.status,
        statusText: response.statusText,
        data,
      },
    );

    // Important API failures are also forwarded to lightweight monitoring
    // (sanitized path/method/status only; no bodies, tokens, or PII).
    // Only 5xx and network-level failures are reported to avoid noise.
    if (response.status >= 500) {
      try {
        const { captureApiError } = await import('./monitoring');
        captureApiError({
          url,
          method: options.method || 'GET',
          status: response.status,
        });
      } catch {
        // monitoring must never break API calls
      }
    }

    /*
     * Preserve machine-readable billing/limit
     * context. Plain `message` handling above is
     * unchanged, so every existing
     * `catch (err) { err.message }` keeps working;
     * pages that understand limits branch on
     * `err.code === 'LIMIT_REACHED'` and render
     * LimitReachedState with real usage numbers.
     */

    const limitError = new Error(
      errorMessage,
    ) as Error & {
      code?: string;
      status?: number;
      details?: unknown;
    };

    limitError.status = response.status;

    if (
      data &&
      typeof data === 'object' &&
      typeof (data as any).code ===
        'string'
    ) {
      limitError.code = (data as any).code;
      limitError.details = (data as any)
        .details;
    }

    throw limitError;
  }

  // 204 No Content is a valid successful response.
  if (response.status === 204) {
    return undefined as T;
  }

  return data as T;
}

/*
 * =========================================================
 * AUTH
 * =========================================================
 */

export async function register(
  data: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
  },
) {
  const response =
    await request<AuthResponse>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );

  saveToken(response.accessToken);

  return response;
}

export async function login(
  data: {
    email: string;
    password: string;
  },
) {
  const response =
    await request<AuthResponse>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );

  saveToken(response.accessToken);

  return response;
}

export async function getMe() {
  /*
   * Validated on every route change by AuthGate, so a
   * short token-scoped cache keeps navigation fast.
   * Revocation is still detected on revalidation
   * (≤60s) and immediately on any failed request.
   */
  return cachedSessionRead<User>(
    'me',
    () => request<User>('/auth/me'),
  );
}

/*
 * Email verification + password reset. Responses
 * mirror the backend's honest states: success
 * means the backend accepted/confirmed the
 * request, never a claim of inbox delivery.
 */
export async function verifyEmail(
  token: string,
): Promise<{
  verified: boolean;
  message: string;
}> {
  return request('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function resendVerification(
  email: string,
): Promise<{
  sent: boolean;
  message: string;
}> {
  return request('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function forgotPassword(
  email: string,
): Promise<{
  sent: boolean;
  message: string;
}> {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{
  success: boolean;
  message: string;
}> {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({
      token,
      newPassword,
    }),
  });
}

/*
 * Persona preference (experience only — never
 * authorization). The backend resolves a safe
 * default from the org role when unset.
 */
export interface PersonaResponse {
  persona: string | null;
  effectivePersona: string;
  suggestedPersona: string;
  source: 'selected' | 'default';
  role: string | null;
  personaSelectedAt: string | null;
}

export async function getPersona(): Promise<PersonaResponse> {
  // Read on nearly every page mount via usePersona.
  return cachedSessionRead<PersonaResponse>(
    'persona',
    () =>
      request<PersonaResponse>(
        '/auth/persona',
      ),
  );
}

export async function setPersona(
  persona: string | null,
): Promise<PersonaResponse> {
  try {
    return await request<PersonaResponse>(
      '/auth/persona',
      {
        method: 'POST',
        body: JSON.stringify({ persona }),
      },
    );
  } finally {
    invalidateSessionCache('persona');
  }
}

/*
 * =========================================================
 * WEBSITES
 * =========================================================
 */

export async function getWebsites() {
  /*
   * Requested by ~20 pages plus WebsiteSelector on
   * every mount. The list only changes through the
   * mutations below, which invalidate it.
   */
  return cachedSessionRead<Website[]>(
    'websites',
    () => request<Website[]>('/websites'),
  );
}

export async function createWebsite(
  data: {
    name: string;
    url: string;
    industry?: string;
    country?: string;
  },
) {
  try {
    return await request<Website>(
      '/websites',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  } finally {
    invalidateSessionCache('websites');
  }
}

export async function updateWebsite(
  id: string,
  data: {
    name?: string;
    url?: string;
    industry?: string;
    country?: string;
    isActive?: boolean;
  },
) {
  try {
    return await request<Website>(
      `/websites/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  } finally {
    invalidateSessionCache('websites');
  }
}

export async function deleteWebsite(
  id: string,
) {
  try {
    return await request(
      `/websites/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      },
    );
  } finally {
    invalidateSessionCache('websites');
  }
}

/*
 * =========================================================
 * CRAWL
 * =========================================================
 */

export async function startCrawl(
  websiteId: string,
) {
  return request<StartCrawlResponse>(
    '/crawl',
    {
      method: 'POST',
      body: JSON.stringify({
        websiteId,
      }),
    },
  );
}

export async function getCrawl(
  crawlId: string,
) {
  return request<Crawl>(
    `/crawl/${encodeURIComponent(crawlId)}`,
  );
}

export async function getCrawlSummary(
  crawlId: string,
) {
  return request<CrawlSummary>(
    `/crawl/${encodeURIComponent(crawlId)}/summary`,
  );
}

export async function getCrawlAnalysis(
  crawlId: string,
) {
  return request<any>(
    `/crawl/${encodeURIComponent(crawlId)}/analysis`,
  );
}

export async function getLatestCrawlSummary(
  websiteId: string,
) {
  return request<CrawlSummary>(
    `/crawl/latest/${encodeURIComponent(websiteId)}/summary`,
  );
}

/*
 * =========================================================
 * SEO ISSUES
 * =========================================================
 */

export async function getCrawlIssues(
  crawlId: string,
) {
  return request<SeoIssuesResponse>(
    `/issues/crawl/${encodeURIComponent(crawlId)}`,
  );
}

export async function getOpenCrawlIssues(
  crawlId: string,
) {
  return request<SeoIssuesResponse>(
    `/issues/crawl/${encodeURIComponent(crawlId)}/open`,
  );
}

export async function getFixedCrawlIssues(
  crawlId: string,
) {
  return request<SeoIssuesResponse>(
    `/issues/crawl/${encodeURIComponent(crawlId)}/fixed`,
  );
}

export async function getIgnoredCrawlIssues(
  crawlId: string,
) {
  return request<SeoIssuesResponse>(
    `/issues/crawl/${encodeURIComponent(crawlId)}/ignored`,
  );
}

export async function getSeoIssue(
  issueId: string,
) {
  return request<SeoIssue>(
    `/issues/${encodeURIComponent(issueId)}`,
  );
}

export async function updateSeoIssueStatus(
  issueId: string,
  status: SeoIssueStatus,
) {
  return request<SeoIssue>(
    `/issues/${encodeURIComponent(issueId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
      }),
    },
  );
}

export async function resolveSeoIssue(
  issueId: string,
) {
  return request<SeoIssue>(
    `/issues/${encodeURIComponent(issueId)}/resolve`,
    {
      method: 'POST',
    },
  );
}

export async function ignoreSeoIssue(
  issueId: string,
) {
  return request<SeoIssue>(
    `/issues/${encodeURIComponent(issueId)}/ignore`,
    {
      method: 'POST',
    },
  );
}

export async function reopenSeoIssue(
  issueId: string,
) {
  return request<SeoIssue>(
    `/issues/${encodeURIComponent(issueId)}/reopen`,
    {
      method: 'POST',
    },
  );
}

/*
 * =========================================================
 * GOOGLE CONNECTION STATUS
 * =========================================================
 */

export async function getGoogleConnectionStatus() {
  /*
   * Read on nearly every dashboard mount. Short
   * token-scoped cache; cleared by disconnect and
   * property selection below so connection changes
   * are never served stale.
   */
  return cachedSessionRead<GoogleConnectionStatus>(
    'google-status',
    () =>
      request<GoogleConnectionStatus>(
        '/google/status',
      ),
  );
}

export interface GoogleIntegrationHealth {
  provider: string;
  status: string;
  connected: boolean;
  reconnectRequired: boolean;
  limitation?: string | null;
  gsc?: {
    provider: string;
    status: string;
    connected: boolean;
    property?: string | null;
    dataAvailable: boolean;
    reconnectRequired: boolean;
    limitation?: string | null;
    [key: string]: any;
  };
  ga4?: {
    provider: string;
    status: string;
    connected: boolean;
    property?: string | null;
    dataAvailable: boolean;
    reconnectRequired: boolean;
    limitation?: string | null;
    [key: string]: any;
  };
  gbp?: {
    provider: string;
    status: string;
    connected: boolean;
    dataAvailable: boolean;
    limitation?: string | null;
    [key: string]: any;
  };
  lastSuccessfulRequestAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorAt?: string | null;
  [key: string]: any;
}

export async function getGoogleHealth(): Promise<GoogleIntegrationHealth> {
  return request<GoogleIntegrationHealth>(
    '/google/health',
  );
}

export async function getGbpStatus(): Promise<{
  provider: string;
  status: string;
  connected: boolean;
  dataAvailable: boolean;
  limitation?: string | null;
  [key: string]: any;
}> {
  return request('/google/gbp/status');
}

export async function disconnectGoogle(): Promise<{
  connected: boolean;
  disconnected: boolean;
  message?: string;
  [key: string]: any;
}> {
  try {
    return request('/google/disconnect', {
      method: 'POST',
    });
  } finally {
    invalidateSessionCache('google-status');
  }
}

export interface BusinessLocation {
  id: string;
  organizationId?: string;
  websiteId?: string | null;
  name: string;
  address?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  category?: string | null;
  source?: string | null;
  [key: string]: any;
}

export async function listBusinessLocations(
  websiteId?: string,
): Promise<{
  total: number;
  gbp?: Record<string, any> | null;
  locations: BusinessLocation[];
  [key: string]: any;
}> {
  const suffix = websiteId
    ? `?websiteId=${encodeURIComponent(websiteId)}`
    : '';

  return request(
    `/local-seo/locations/all${suffix}`,
  );
}

export async function createBusinessLocation(data: {
  websiteId?: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  websiteUrl?: string;
  category?: string;
  isPrimary?: boolean;
}): Promise<BusinessLocation> {
  return request<BusinessLocation>(
    '/local-seo/locations',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function updateBusinessLocation(
  id: string,
  data: Record<string, any>,
): Promise<BusinessLocation> {
  return request<BusinessLocation>(
    `/local-seo/locations/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteBusinessLocation(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request(
    `/local-seo/locations/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export interface LocalHealthArea {
  key: string;
  title: string;
  state:
    | 'GOOD'
    | 'ATTENTION'
    | 'DATA_GAP'
    | 'NOT_AVAILABLE';
  evidence: string;
  limitation?: string | null;
  [key: string]: any;
}

export interface LocalHealth {
  websiteId: string;
  overall: LocalHealthArea['state'];
  overallNote?: string;
  areas: LocalHealthArea[];
  categories: string[];
  opportunities: Array<Record<string, any>>;
  [key: string]: any;
}

export async function getLocalHealth(
  websiteId: string,
): Promise<LocalHealth> {
  return request<LocalHealth>(
    `/local-seo/${encodeURIComponent(websiteId)}/health`,
  );
}

export interface TrackedLocalQuery {
  id: string;
  query: string;
  category?: string | null;
  locationId?: string | null;
  isActive: boolean;
  [key: string]: any;
}

export async function listTrackedLocalQueries(
  websiteId: string,
): Promise<{
  total: number;
  active: number;
  rankingData: string;
  rankingNote?: string;
  queries: TrackedLocalQuery[];
  [key: string]: any;
}> {
  return request(
    `/local-seo/${encodeURIComponent(websiteId)}/tracked-queries`,
  );
}

export async function createTrackedLocalQuery(
  websiteId: string,
  data: {
    locationId?: string;
    query: string;
    category?: string;
  },
): Promise<TrackedLocalQuery> {
  return request<TrackedLocalQuery>(
    `/local-seo/${encodeURIComponent(websiteId)}/tracked-queries`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteTrackedLocalQuery(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request(
    `/local-seo/tracked-queries/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export interface LocalCitation {
  id: string;
  source: string;
  sourceUrl?: string | null;
  businessName?: string | null;
  address?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  status?: string | null;
  [key: string]: any;
}

export async function listLocalCitations(
  websiteId?: string,
): Promise<{
  total: number;
  status: string;
  note?: string;
  citations: LocalCitation[];
  [key: string]: any;
}> {
  const suffix = websiteId
    ? `?websiteId=${encodeURIComponent(websiteId)}`
    : '';

  return request(
    `/local-seo/citations/all${suffix}`,
  );
}

export async function createLocalCitation(data: {
  websiteId?: string;
  locationId?: string;
  source: string;
  sourceUrl?: string;
  businessName?: string;
  address?: string;
  phone?: string;
  websiteUrl?: string;
  status?: string;
}): Promise<LocalCitation> {
  return request<LocalCitation>(
    '/local-seo/citations',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteLocalCitation(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request(
    `/local-seo/citations/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function listLocalCompetitors(
  websiteId: string,
  locationId?: string,
): Promise<{
  total: number;
  competitors: Array<Record<string, any>>;
  [key: string]: any;
}> {
  const suffix = locationId
    ? `?locationId=${encodeURIComponent(locationId)}`
    : '';

  return request(
    `/local-seo/${encodeURIComponent(websiteId)}/local-competitors${suffix}`,
  );
}

export async function attachLocalCompetitor(
  competitorId: string,
  locationId: string | null,
): Promise<Record<string, any>> {
  return request(
    `/local-seo/competitors/${encodeURIComponent(competitorId)}/attach`,
    {
      method: 'POST',
      body: JSON.stringify({ locationId }),
    },
  );
}

/*
 * =========================================================
 * GOOGLE CONNECT
 * =========================================================
 */

export async function connectGoogle(
  origin?: string,
) {
  const suffix = origin
    ? `?origin=${encodeURIComponent(origin)}`
    : '';
  return request<{
    authorizationUrl: string;
  }>(`/google/connect${suffix}`);
}

/*
 * =========================================================
 * GOOGLE SEARCH CONSOLE PROPERTIES
 * =========================================================
 */

export async function getGoogleProperties() {
  return request<GoogleProperty[]>(
    '/google/properties',
  );
}

export async function selectGoogleProperty(
  siteUrl: string,
) {
  try {
    return request<GoogleConnection>(
      `/google/select-property?siteUrl=${encodeURIComponent(siteUrl)}`,
    );
  } finally {
    invalidateSessionCache('google-status');
  }
}

/*
 * =========================================================
 * GOOGLE SEARCH CONSOLE ANALYTICS
 * =========================================================
 */

export async function getGoogleAnalytics(
  startDate: string,
  endDate: string,
) {
  return request<GoogleAnalytics>(
    `/google/analytics?startDate=${encodeURIComponent(
      startDate,
    )}&endDate=${encodeURIComponent(endDate)}`,
  );
}

/*
 * =========================================================
 * GOOGLE SEARCH QUERIES
 * =========================================================
 */

export async function getGoogleQueries(
  startDate: string,
  endDate: string,
) {
  return request<GoogleQueriesResponse>(
    `/google/queries?startDate=${encodeURIComponent(
      startDate,
    )}&endDate=${encodeURIComponent(endDate)}`,
  );
}

/*
 * =========================================================
 * GOOGLE SEARCH PAGES
 * =========================================================
 */

export async function getGooglePages(
  startDate: string,
  endDate: string,
) {
  return request<GooglePagesResponse>(
    `/google/pages?startDate=${encodeURIComponent(
      startDate,
    )}&endDate=${encodeURIComponent(endDate)}`,
  );
}

/*
 * =========================================================
 * GOOGLE SEO OPPORTUNITIES
 * =========================================================
 */

export async function getGoogleOpportunities(
  startDate: string,
  endDate: string,
) {
  return request<GoogleOpportunitiesResponse>(
    `/google/opportunities?startDate=${encodeURIComponent(
      startDate,
    )}&endDate=${encodeURIComponent(endDate)}`,
  );
}

/*
 * =========================================================
 * GOOGLE OPPORTUNITY ANALYSIS
 * =========================================================
 */

export async function analyzeGoogleOpportunity(
  startDate: string,
  endDate: string,
  query: string,
  page?: string,
) {
  const params = new URLSearchParams({
    startDate,
    endDate,
    query,
  });

  if (page) {
    params.set('page', page);
  }

  return request<GoogleOpportunityAnalysis>(
    `/google/opportunities/analyze?${params.toString()}`,
  );
}

/*
 * =========================================================
 * KEYWORD RESEARCH 2.0
 * Real corpus only — volume/KD/CPC/traffic/SERP are
 * returned as null with explicit availability metadata.
 * =========================================================
 */

export interface MonthlyPoint {
  year: number;
  month: number;
  searchVolume: number | null;
}

export interface ResearchIdea {
  keyword: string;
  intent: string;
  intentSource?: 'PROVIDER' | 'RENKOO';
  categories: string[];
  sources: string[];
  sitePages: number;
  siteRelevance: number;
  siteUrls: string[];
  competitorCount: number;
  competitorPages: number;
  competitorRelevance: number;
  opportunityScore: number;
  opportunityReasons: string[];
  targetDecision: string;
  decisionReason: string;
  parentTopic: string;
  parentTopicSource?: string;
  wordCount: number;
  cannibalizationFlag: boolean;
  /* Real provider metrics — null means unavailable. */
  volume: number | null;
  keywordDifficulty: number | null;
  kdLabel?: string | null;
  cpc: number | null;
  competition?: number | null;
  competitionLevel?: string | null;
  monthlySearches?: MonthlyPoint[];
  trend?: string | null;
  trendDetail?: string | null;
  serpFeatures?: string[];
  gscPosition?: number | null;
  gscClicks?: number | null;
  gscImpressions?: number | null;
  gscCtr?: number | null;
  dataSource?: string;
  metricUpdatedAt?: string | null;
  trafficPotential: null;
  [key: string]: any;
}

export interface SerpResultRow {
  position: number | null;
  url: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  resultType: string;
  isOrganic?: boolean;
  isPaid?: boolean;
  contentType?: string | null;
  domainRank?: number | null;
  pageRank?: number | null;
  backlinks?: number | null;
  referringDomains?: number | null;
  estimatedTraffic?: number | null;
  pageStrength?: 'Strong' | 'Medium' | 'Weak' | 'Unknown';
  strengthEvidence?: string[];
}

export interface SerpObservation {
  keyword: string;
  country: string;
  language: string;
  results: SerpResultRow[];
  features: Array<{
    type: string;
    title: string | null;
    count: number;
  }>;
  totalResults: number | null;
  dataSource: string;
  fetchedAt: string;
  competition?: {
    verdict: 'OPPORTUNITY' | 'MODERATE' | 'HARD' | 'UNKNOWN';
    totalResults: number;
    strongCount: number;
    weakCount: number;
    unknownCount: number;
    medianDomainRank: number | null;
    medianPageRank: number | null;
    medianReferringDomains: number | null;
    medianBacklinks: number | null;
    evidence: string[];
  } | null;
  intentCheck?: {
    check: 'MATCH' | 'MIXED' | 'MISMATCH' | 'UNKNOWN';
    keywordIntent: string;
    intentSource: 'PROVIDER' | 'RENKOO';
    detail: string;
  } | null;
  featureOpportunities?: Array<{
    type: string;
    opportunity: string;
  }>;
  aiPresence?: {
    detected: boolean;
    elementTypes: string[];
    referencedDomains: string[];
    detail: string;
  } | null;
}

export interface SerpScoring {
  baseOpportunity: number | null;
  serpAdjustment: number;
  adjustedOpportunity: number | null;
  serpReasons: string[];
  pageDecision: {
    action:
      | 'IMPROVE_EXISTING_PAGE'
      | 'CREATE_NEW_PAGE'
      | 'CONSOLIDATE_PAGES'
      | 'TRACK_ONLY'
      | 'IGNORE';
    reason: string;
    primaryUrl: string | null;
    competingUrls: Array<Record<string, any>>;
    cannibalization: {
      detected: boolean;
      confidence: 'strong' | 'potential';
      urls: Array<Record<string, any>>;
      recommendation: string | null;
    } | null;
  } | null;
}

export interface SerpCluster {
  name: string;
  primaryKeyword: string;
  supportingKeywords: string[];
  serpSimilarity: number | null;
  size: number;
  intent: string;
  intentSource: 'PROVIDER' | 'RENKOO';
  volume: number | null;
  keywordDifficulty: number | null;
  pageDecision: SerpScoring['pageDecision'];
  recommendedPageType: string;
  splitNote: string | null;
}

export interface ResearchCluster {
  cluster: string;
  primaryKeyword: string;
  supportingKeywords: string[];
  size: number;
  intent: string;
  avgOpportunity: number | null;
  recommendedPageType: string;
  groupingReason: string;
}

export interface ResearchCost {
  providerCalls: number;
  cacheHits: number;
  fresh: boolean;
  charged: boolean;
}

export interface ResearchResponse {
  seed?: string;
  provider?: string;
  locationFallback?: boolean;
  cost?: ResearchCost;
  clusteringBasis?: string;
  website?: {
    id: string;
    name: string;
    url: string;
  } | null;
  corpus: {
    sitePhrases: number;
    competitorPhrases: number;
    competitorsCovered: number;
    siteCrawled: boolean;
  };
  summary: {
    total: number;
    highOpportunity: number;
    contentGaps: number;
    quickWins: number;
    commercial: number;
  };
  availability: Array<{
    metric: string;
    availability: string;
    provider: string;
    reason: string;
  }>;
  ideas: ResearchIdea[];
  clusters: ResearchCluster[];
  [key: string]: any;
}

export async function researchKeywords(data: {
  websiteId?: string;
  seed: string;
  mode?: 'keyword' | 'website' | 'competitor';
  country?: string;
  language?: string;
  limit?: number;
  refresh?: boolean;
}): Promise<ResearchResponse> {
  return request<ResearchResponse>(
    '/keywords/research',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function getKeywordUniverse(
  websiteId: string,
  limit = 100,
): Promise<ResearchResponse> {
  return request<ResearchResponse>(
    `/keywords/${encodeURIComponent(websiteId)}/universe?limit=${encodeURIComponent(String(limit))}`,
  );
}

export async function clusterKeywords(
  keywords: string[],
): Promise<{ clusters: ResearchCluster[] }> {
  return request<{ clusters: ResearchCluster[] }>(
    '/keywords/clusters',
    {
      method: 'POST',
      body: JSON.stringify({ keywords }),
    },
  );
}

export async function getKeywordProviders(): Promise<{
  providers: Array<Record<string, any>>;
  metrics: Array<Record<string, any>>;
}> {
  return request('/keywords/providers');
}

export async function getKeywordGap(
  websiteId: string,
  competitorId: string,
): Promise<Record<string, any>> {
  return request(
    `/keywords/${encodeURIComponent(websiteId)}/gap/${encodeURIComponent(competitorId)}`,
  );
}

export async function getKeywordSerp(data: {
  keyword: string;
  country?: string;
  language?: string;
  refresh?: boolean;
  websiteId?: string;
}): Promise<{
  observation: SerpObservation;
  cached: boolean;
  fetchedAt: string;
  previousFetchedAt: string | null;
  cost: ResearchCost;
  scoring: SerpScoring | null;
}> {
  return request('/keywords/serp', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function clusterSerpKeywords(data: {
  websiteId?: string;
  keywords: string[];
  country?: string;
  language?: string;
  maxSerp?: number;
  threshold?: number;
  refresh?: boolean;
}): Promise<{
  threshold: number;
  basis: string;
  analyzed: number;
  fromCache: number;
  fresh: number;
  skipped: number;
  cost: ResearchCost;
  clusters: SerpCluster[];
  unclustered: string[];
}> {
  return request('/keywords/serp/cluster', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function lookupCompetitorKeywords(data: {
  websiteId?: string;
  domain: string;
  country?: string;
  language?: string;
  limit?: number;
  refresh?: boolean;
  includeSerpStrength?: number;
}): Promise<Record<string, any>> {
  return request('/keywords/competitor', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getQuickWins2(data: {
  websiteId: string;
  startDate: string;
  endDate: string;
  country?: string;
  language?: string;
  limit?: number;
}): Promise<Record<string, any>> {
  return request('/keywords/quick-wins', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getKeywordUsage(): Promise<{
  provider: string;
  configured: boolean;
  freeUsed: number;
  freeLimit: number | null;
  apiCalls: any;
}> {
  return request('/keywords/usage');
}

export type StrategyPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type StrategyBucket =
  | 'TARGET_NOW'
  | 'QUICK_WIN'
  | 'GROW'
  | 'PROTECT'
  | 'CREATE'
  | 'CONSOLIDATE'
  | 'MONITOR'
  | 'IGNORE';

export type StrategyPageMapping =
  | 'IMPROVE'
  | 'OPTIMIZE'
  | 'CREATE'
  | 'CONSOLIDATE'
  | 'IGNORE'
  | 'PROTECT';

export interface StrategySignal {
  label: string;
  value: string;
  source: 'OBSERVED' | 'PROVIDER' | 'INFERENCE';
}

export interface StrategyQuickWin {
  isQuickWin: boolean;
  why: string[];
  action: string;
  expectedImpact: string;
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface StrategyOpportunity {
  keyword: string;
  intent: string;
  intentSource: 'PROVIDER' | 'RENKOO';
  position: number | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  volume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
  trend: string | null;
  serpVerdict:
    | 'OPPORTUNITY'
    | 'MODERATE'
    | 'HARD'
    | 'UNKNOWN'
    | null;
  serpWeakCount: number | null;
  targetPage: string | null;
  targetPageSource: 'OBSERVED' | 'INFERENCE' | null;
  pageMapping: StrategyPageMapping;
  mappingReason: string;
  priority: StrategyPriority;
  priorityScore: number;
  priorityReasons: string[];
  opportunityScore: number;
  bucket: StrategyBucket;
  isTargetNow: boolean;
  quickWin: StrategyQuickWin | null;
  signals: StrategySignal[];
}

export interface StrategyCluster {
  topic: string;
  primaryKeyword: string;
  supportingKeywords: string[];
  size: number;
  intent: string;
  existingPages: string[];
  missingPages: number;
  cannibalizationRisk: boolean;
  topOpportunity: number;
  priority: StrategyPriority;
  pillarPage: string | null;
  pillarPageSource: 'OBSERVED' | 'INFERENCE' | null;
  supportingContent: string[];
  recommendedPageType: string;
}

export interface StrategyAction {
  rank: number;
  priority: StrategyPriority;
  actionType:
    | 'IMPROVE_PAGE'
    | 'OPTIMIZE_PAGE'
    | 'CREATE_PAGE'
    | 'CONSOLIDATE_PAGES'
    | 'PROTECT_PAGE'
    | 'TRACK_KEYWORD';
  keyword: string;
  topic: string | null;
  targetUrl: string | null;
  reason: string;
  evidence: string[];
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface StrategyResponse {
  website: { id: string; name: string; url: string };
  period: { startDate: string; endDate: string };
  universe: {
    gscKeywords: number;
    gapCandidates: number;
    total: number;
  };
  dataAvailability: {
    provider: boolean;
    gscConnected: boolean;
    volumeCoverage: number;
    kdCoverage: number;
    serpCached: number;
    notes: string[];
  };
  summary: Record<StrategyBucket, number>;
  opportunities: StrategyOpportunity[];
  clusters: StrategyCluster[];
  nextActions: StrategyAction[];
  aiBrief: {
    website: string;
    generatedAt: string;
    period: { startDate: string; endDate: string };
    counts: Record<StrategyBucket, number>;
    topOpportunities: Array<Record<string, any>>;
    clusterNotes: Array<Record<string, any>>;
    dataGaps: string[];
  };
}

export async function getKeywordStrategy(data: {
  websiteId: string;
  startDate?: string;
  endDate?: string;
  country?: string;
  language?: string;
  limit?: number;
}): Promise<StrategyResponse> {
  return request<StrategyResponse>('/keywords/strategy', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getStrategyBrief(data: {
  websiteId: string;
  provider: 'GEMINI' | 'OPENAI';
  keywords?: string[];
  maxItems?: number;
  startDate?: string;
  endDate?: string;
  country?: string;
  language?: string;
}): Promise<{
  id: string;
  text: string;
  provider: string;
  model: string;
  itemCount: number;
  createdAt: string;
}> {
  return request('/keywords/strategy/brief', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listStrategyBriefs(
  websiteId: string,
): Promise<{
  total: number;
  briefs: Array<{
    id: string;
    provider: string;
    model: string | null;
    itemCount: number;
    createdAt: string;
  }>;
}> {
  return request(
    `/keywords/strategy/briefs?websiteId=${encodeURIComponent(
      websiteId,
    )}`,
  );
}

/*
 * =========================================================
 * CONTENT STRATEGY FOUNDATION 6.0 — persistence +
 * composition reads. These compose existing intelligence
 * (Strategy 5.0, Content Engine, refresh, actions) and
 * never recompute scores. Statuses are honest: missing
 * rows read as not-created, never inferred.
 * =========================================================
 */

export interface StrategyContentStatus {
  keyword: string;
  topic: string | null;
  targetPage: string | null;
  pageMapping: string | null;
  bucket: string | null;
  priority: string | null;
  contentAction: string | null;
  content: {
    exists: boolean;
    id: string | null;
    status: string | null;
  };
  brief: { exists: boolean; id: string | null };
  draft: { exists: boolean; id: string | null };
  action: {
    exists: boolean;
    id: string | null;
    status: string | null;
  };
}

export interface StrategyLinksResponse {
  persistenceAvailable: boolean;
  total: number;
  clusters: Array<Record<string, any>>;
  links: StrategyContentStatus[];
}

export async function getStrategyLinks(
  websiteId: string,
): Promise<StrategyLinksResponse> {
  return request(
    `/keywords/strategy/links?websiteId=${encodeURIComponent(
      websiteId,
    )}`,
  );
}

export async function getStrategyContentOpportunities(data: {
  websiteId: string;
  startDate?: string;
  endDate?: string;
  country?: string;
  language?: string;
  limit?: number;
}): Promise<{
  persistenceAvailable: boolean;
  website: { id: string; name: string; url: string };
  period: { startDate: string; endDate: string };
  dataAvailability: {
    provider: boolean;
    gscConnected: boolean;
    notes: string[];
  };
  total: number;
  clusters: Array<Record<string, any>>;
  opportunities: Array<Record<string, any>>;
  linkRecommendations?: Array<Record<string, any>>;
}> {
  const params = new URLSearchParams({
    websiteId: data.websiteId,
  });
  if (data.startDate) params.set('startDate', data.startDate);
  if (data.endDate) params.set('endDate', data.endDate);
  if (data.country) params.set('country', data.country);
  if (data.language) params.set('language', data.language);
  if (typeof data.limit === 'number')
    params.set('limit', String(data.limit));
  return request(
    `/keywords/strategy/content-opportunities?${params.toString()}`,
  );
}

/*
 * =========================================================
 * INTERNAL LINK RECOMMENDER 6.0 Phase 2A (deterministic,
 * existing data only). Anchors are INFERENCE, never
 * observed — the crawler does not persist anchor text.
 * =========================================================
 */

export interface LinkRecommendation {
  sourceUrl: string;
  targetUrl: string;
  suggestedAnchor: string;
  anchorSource:
    | 'SUPPORTING_KEYWORD'
    | 'PRIMARY_KEYWORD'
    | 'TOPIC_TERM';
  keyword: string;
  topic: string | null;
  reason: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityBand: 'HIGH' | 'MEDIUM' | 'LOW';
  futureContent: boolean;
  evidenceSources: Array<{
    label: string;
    value: string;
    source: 'OBSERVED' | 'INFERENCE' | 'UNAVAILABLE';
  }>;
  action: {
    exists: boolean;
    id: string | null;
    status: string | null;
  };
  verification?: {
    status: 'VERIFIED' | 'NOT_VERIFIED' | 'BROKEN' | 'UNAVAILABLE';
    crawlId: string | null;
    crawlCompletedAt: string | null;
    observedAnchors: string[];
    anchorMatch:
      | 'EXACT_MATCH'
      | 'RELATED_MATCH'
      | 'DIFFERENT'
      | 'UNKNOWN';
    linkAttributes: {
      nofollow: boolean;
      sponsored: boolean;
      ugc: boolean;
    } | null;
    linkLost: boolean | null;
    reason: string;
  };
  [key: string]: any;
}

export async function getLinkRecommendations(data: {
  websiteId: string;
  keyword?: string;
  targetUrl?: string;
  limit?: number;
}): Promise<{
  persistenceAvailable: boolean;
  total: number;
  recommendations: LinkRecommendation[];
}> {
  const params = new URLSearchParams({
    websiteId: data.websiteId,
  });
  if (data.keyword) params.set('keyword', data.keyword);
  if (data.targetUrl) params.set('targetUrl', data.targetUrl);
  if (typeof data.limit === 'number')
    params.set('limit', String(data.limit));
  return request(
    `/keywords/strategy/link-recommendations?${params.toString()}`,
  );
}

export async function syncLinkRecommendations(data: {
  websiteId: string;
  limit?: number;
}): Promise<{
  persisted: boolean;
  computed: number;
  created: number;
  updated: number;
  skippedDismissed: number;
}> {
  return request(
    '/keywords/strategy/link-recommendations/sync',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

/*
 * =========================================================
 * SEARCH BASELINE 1.0 — canonical "Where am I now?"
 * composition. One request: GSC period comparison +
 * strategy + content + crawl evidence, each section
 * degrading independently. Evidence states travel with
 * every metric (never zero for unavailable).
 * =========================================================
 */

export interface SearchBaselineResponse {
  website: { id: string; name: string; url: string };
  generatedAt: string;
  period: {
    days: number;
    current: { startDate: string; endDate: string };
    previous: { startDate: string; endDate: string };
  };
  gscConnected: boolean;
  evidence: Record<string, string>;
  unavailable: Record<string, string>;
  summary: Record<
    string,
    {
      value: number | null;
      delta?: number | null;
      deltaPct?: number | null;
      deltaPp?: number | null;
      evidence: string;
    }
  > | null;
  visibility: {
    top3: number;
    top10: number;
    top20: number;
    top100: number;
  } | null;
  trend: {
    available: boolean;
    points: Array<{
      label: string;
      current: number | null;
      previous: number | null;
    }>;
  };
  aha: { title: string; body: string; kind: string };
  striking: Array<Record<string, any>>;
  winners: Array<Record<string, any>>;
  losers: Array<Record<string, any>>;
  pages: Array<Record<string, any>>;
  opportunities: Array<Record<string, any>>;
  nextMoves: Array<Record<string, any>>;
  health: Array<Record<string, any>>;
}

export async function getSearchBaseline(data: {
  websiteId: string;
  days?: number;
}): Promise<SearchBaselineResponse> {
  const params = new URLSearchParams({
    websiteId: data.websiteId,
  });
  if (typeof data.days === 'number')
    params.set('days', String(data.days));
  return request(
    `/keywords/baseline?${params.toString()}`,
  );
}

/*
 * =========================================================
 * WHY-NOT-#1 DIAGNOSIS 1.0 — evidence-backed "why am I
 * not ranking higher". Composes GSC + strategy + SERP
 * cache + crawl + links; scores nothing new. Evidence
 * states travel with every claim.
 * =========================================================
 */

export interface KeywordDiagnosis {
  keyword: string;
  website: { id: string; name: string; url: string };
  generatedAt: string;
  currentRanking: {
    position: number | null;
    prevPosition: number | null;
    positionDelta: number | null;
    page: string | null;
    pageCertainty: string;
    clicks: number | null;
    impressions: number | null;
    ctr: number | null;
    evidence: string;
  };
  primaryDiagnosis: string;
  secondaryDiagnoses: string[];
  explanation: { title: string; body: string };
  checklist: Array<{
    label: string;
    state: string;
    detail: string;
  }>;
  subDiagnoses: Array<Record<string, any>>;
  recommendedAction: {
    action: string;
    label: string;
    href: string;
    purpose: string;
  };
  strategy: Record<string, any> | null;
  serp: Record<string, any>;
  technical: Record<string, any>;
  internalLinks: {
    inboundCount: number | null;
    opportunities: Array<Record<string, any>>;
    persistedCount: number;
    evidence: string;
  };
  content: {
    mapping: string | null;
    brief: Record<string, any> | null;
    item: Record<string, any> | null;
    refresh: Record<string, any> | null;
  };
  pages: Array<Record<string, any>>;
  evidence: Array<Record<string, any>>;
  rankHistory?: {
    statement: string;
    evidenceState: string;
    observations: number;
    current: number | null;
    previous: number | null;
  } | null;
  [key: string]: any;
}

export async function diagnoseKeyword(data: {
  websiteId: string;
  keyword: string;
  country?: string;
  language?: string;
}): Promise<KeywordDiagnosis> {
  const params = new URLSearchParams({
    websiteId: data.websiteId,
    keyword: data.keyword,
  });
  if (data.country) params.set('country', data.country);
  if (data.language) params.set('language', data.language);
  return request(
    `/keywords/diagnose?${params.toString()}`,
  );
}

export async function diagnoseKeywordBatch(data: {
  websiteId: string;
  keywords?: string[];
  limit?: number;
  country?: string;
  language?: string;
}): Promise<{
  website: { id: string; name: string; url: string };
  total: number;
  diagnoses: Array<Record<string, any>>;
}> {
  return request('/keywords/diagnose/batch', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/*
 * =========================================================
 * SEARCH GROWTH ROADMAP 1.0 — "What exactly should I do
 * next?" Composes strategy + diagnosis + content + links
 * + recommendations + actions + crawl blockers into an
 * ordered, executable roadmap. Scores nothing new,
 * guarantees nothing — planning objectives only
 * ("Target: Top 3", "Evidence suggests").
 * =========================================================
 */

export interface RoadmapEvidenceRef {
  source: string;
  label: string;
  evidenceType: string;
}

export interface RoadmapItem {
  id: string;
  kind: string;
  title: string;
  keyword: string | null;
  targetPage: string | null;
  topic: string | null;
  why: string;
  evidence: RoadmapEvidenceRef[];
  evidenceState: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  impact: string;
  effort: string;
  dependsOn: string[];
  executionStatus: string;
  action: { id: string; status: string } | null;
  recommendation: { id: string; status: string } | null;
  cta: { label: string; href: string } | null;
  planNote: string | null;
  ranking: { current: number | null; target: string } | null;
  observedChange: string | null;
  measurement: {
    keyword: string | null;
    targetPage: string | null;
    identityKey: string;
  };
}

export interface RoadmapResponse {
  website: { id: string; url?: string | null; name?: string | null };
  generatedAt: string;
  scope: {
    keyword: string | null;
    page: string | null;
    topic: string | null;
  };
  goal: string;
  currentState: {
    candidates: number;
    highPriority: number;
    horizons: {
      now: number;
      next7Days: number;
      next30Days: number;
      ongoing: number;
    };
  };
  doThisFirst: { item: RoadmapItem | null; reason: string };
  priorities: RoadmapItem[];
  horizons: {
    now: RoadmapItem[];
    next7Days: RoadmapItem[];
    next30Days: RoadmapItem[];
    ongoing: RoadmapItem[];
  };
  dependencies: Array<{ from: string; to: string; reason: string }>;
  progress: {
    total: number;
    open: number;
    completed: number;
    inProgress: number;
    searchResult: string;
    searchResultNote: string;
  };
  evidence: RoadmapEvidenceRef[];
  unavailable: Array<{ key: string; reason: string; unlocks: string }>;
}

export async function getRoadmap(data: {
  websiteId: string;
  keyword?: string;
  page?: string;
  topic?: string;
  limit?: number;
}): Promise<RoadmapResponse> {
  const params = new URLSearchParams({
    websiteId: data.websiteId,
  });
  if (data.keyword) params.set('keyword', data.keyword);
  if (data.page) params.set('page', data.page);
  if (data.topic) params.set('topic', data.topic);
  if (typeof data.limit === 'number')
    params.set('limit', String(data.limit));
  return request(
    `/keywords/roadmap?${params.toString()}`,
  );
}

export interface OrphanCandidate {
  url: string;
  title: string | null;
  label: 'POTENTIAL_ORPHAN';
  inboundCount: 0;
  crawlId: string;
  crawlCompletedAt: string | null;
  strategy: {
    keyword: string;
    topic: string | null;
    priority: string | null;
    priorityScore: number | null;
    pageMapping: string | null;
    bucket: string | null;
    contentAction: string | null;
  } | null;
  explanation: string;
}

export async function getOrphanCandidates(data: {
  websiteId: string;
  limit?: number;
}): Promise<{
  persistenceAvailable: boolean;
  crawlId: string | null;
  crawlCompletedAt: string | null;
  totalCandidates: number;
  excludedCount: number;
  candidates: OrphanCandidate[];
}> {
  const params = new URLSearchParams({
    websiteId: data.websiteId,
  });
  if (typeof data.limit === 'number')
    params.set('limit', String(data.limit));
  return request(
    `/keywords/strategy/orphan-candidates?${params.toString()}`,
  );
}

/*
 * =========================================================
 * TECHNICAL SEO
 * =========================================================
 */

export interface TechnicalSeoCategory {
  category: string;
  label: string;
  score: number;
  openIssues: number;
  affectedPages: number;
  status: string;
}

export interface TechnicalSeoIssuePage {
  id: string;
  url: string;
}

export interface TechnicalSeoIssueGroup {
  code: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  affectedPages: number;
  affectedPercentage: number;
  priorityScore: number;
  pages: TechnicalSeoIssuePage[];
}

export interface TechnicalSeoTopIssue {
  id: string;

  code: string;
  category: string;
  severity: string;

  title: string;
  description: string;
  recommendation: string;

  page: {
    id: string;
    url: string;
    statusCode: number | null;
    title: string | null;
    metaDescription: string | null;
    canonical: string | null;
    loadTimeMs: number | null;
  };
}

export interface TechnicalSeoPageIntelligence {
  id: string;
  url: string;

  title: string | null;

  statusCode: number | null;
  loadTimeMs: number | null;

  issueCount: number;

  critical: number;
  high: number;
  medium: number;
  low: number;

  score: number;

  priority: string;
  priorityScore: number;

  issueCodes: string[];
}

export interface TechnicalSeoResponse {
  website: {
    id: string;
    name: string;
    url: string;
  };

  crawl: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  };

  score: {
    value: number;
    label: string;
  };

  pages: {
    total: number;
    withErrors: number;
    notIndexable: number;
    withoutCanonical: number;
    withoutTitle: number;
    withoutMetaDescription: number;
    slow: number;
  };

  issues: {
    total: number;
    open: number;
    fixed: number;
    ignored: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };

  categories: TechnicalSeoCategory[];
  issueGroups: TechnicalSeoIssueGroup[];
  topIssues: TechnicalSeoTopIssue[];
  pageIntelligence: TechnicalSeoPageIntelligence[];
}

export async function getTechnicalSeoByCrawl(
  crawlId: string,
) {
  return request<any>(`/technical-seo/crawl/${encodeURIComponent(crawlId)}`);
}
export async function getTechnicalSeoLatest(
  websiteId: string,
) {
  return request<TechnicalSeoResponse>(
    `/technical-seo/latest/${encodeURIComponent(websiteId)}`,
  );
}

/*
 * =========================================================
 * CONTENT ENGINE
 * =========================================================
 */

export interface ContentOpportunityWebsite {
  id: string;
  name: string;
  url: string;
}

export interface ContentOpportunity {
  query: string;

  page: string | null;

  clicks: number;
  impressions: number;
  ctr: number;
  position: number;

  priority:
    | 'HIGH'
    | 'MEDIUM'
    | 'LOW';

  type:
    | 'QUICK_WIN'
    | 'PAGE_ONE_GROWTH'
    | 'CONTENT_PROTECTION'
    | 'LOW_CTR'
    | 'CONTENT_GROWTH'
    | string;

  recommendation: string;
}

export interface ContentOpportunitiesResponse {
  startDate: string;
  endDate: string;

  websites: ContentOpportunityWebsite[];

  total: number;

  opportunities: ContentOpportunity[];
}

export async function getContentOpportunities(
  startDate: string,
  endDate: string,
  websiteId?: string,
) {
  const params = new URLSearchParams({
    startDate,
    endDate,
  });

  if (websiteId) {
    params.set("websiteId", websiteId);
  }

  return request<ContentOpportunitiesResponse>(
    `/content/opportunities?${params.toString()}`,
  );
}

export interface ContentItem {
  id: string;
  title: string;
  targetQuery?: string | null;
  intent?: string | null;
  status: string;
  pageUrl?: string | null;
  publishedAt?: string | null;
  briefs?: Array<{ id: string }>;
  drafts?: Array<Record<string, any>>;
  [key: string]: any;
}

export async function listContentItems(
  websiteId: string,
): Promise<{
  total: number;
  publishing: Record<string, any>;
  items: ContentItem[];
  [key: string]: any;
}> {
  return request(
    `/content/items?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function createContentItem(data: {
  websiteId: string;
  title: string;
  targetQuery?: string;
  intent?: string;
  pageUrl?: string;
}): Promise<ContentItem> {
  return request<ContentItem>('/content/items', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateContentItem(
  id: string,
  data: Record<string, any>,
): Promise<ContentItem> {
  return request<ContentItem>(
    `/content/items/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteContentItem(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request(
    `/content/items/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function markContentReady(
  id: string,
): Promise<ContentItem> {
  return request(
    `/content/items/${encodeURIComponent(id)}/ready`,
    { method: 'POST' },
  );
}

export async function markContentPublished(
  id: string,
  confirmed: boolean,
  pageUrl?: string,
): Promise<ContentItem> {
  return request(
    `/content/items/${encodeURIComponent(id)}/publish`,
    {
      method: 'POST',
      body: JSON.stringify({ confirmed, pageUrl }),
    },
  );
}

export async function generateContentBrief(data: {
  websiteId: string;
  query: string;
  page?: string;
  itemId?: string;
}): Promise<Record<string, any>> {
  return request('/content/briefs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listContentBriefs(
  websiteId: string,
): Promise<{
  total: number;
  serp: Record<string, any>;
  briefs: Array<Record<string, any>>;
  [key: string]: any;
}> {
  return request(
    `/content/briefs?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function deleteContentBrief(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request(
    `/content/briefs/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function generateContentDraft(data: {
  websiteId: string;
  itemId?: string;
  briefId?: string;
  mode: 'OUTLINE' | 'DRAFT' | 'SECTION' | 'FAQ' | 'REWRITE';
  provider: 'GEMINI' | 'OPENAI';
  input?: string;
  topic?: string;
}): Promise<Record<string, any>> {
  return request('/content/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listContentDrafts(
  websiteId: string,
  itemId?: string,
): Promise<{
  total: number;
  aiGenerated: number;
  drafts: Array<Record<string, any>>;
  [key: string]: any;
}> {
  const suffix = itemId
    ? `&itemId=${encodeURIComponent(itemId)}`
    : '';

  return request(
    `/content/drafts?websiteId=${encodeURIComponent(websiteId)}${suffix}`,
  );
}

export async function analyzeContentPage(data: {
  websiteId: string;
  pageUrl: string;
  query?: string;
}): Promise<Record<string, any>> {
  return request('/content/optimize', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getContentRefreshQueue(
  websiteId?: string,
): Promise<{
  total: number;
  refresh: Array<Record<string, any>>;
  persisted: Array<Record<string, any>>;
  [key: string]: any;
}> {
  const suffix = websiteId
    ? `?websiteId=${encodeURIComponent(websiteId)}`
    : '';

  return request(`/content/refresh${suffix}`);
}

export async function getContentPublishingStatus(): Promise<
  Record<string, any>
> {
  return request('/content/publishing/status');
}

export async function getContentPerformance(
  websiteId: string,
  pageUrl: string,
): Promise<Record<string, any>> {
  return request(
    `/content/performance?websiteId=${encodeURIComponent(websiteId)}&pageUrl=${encodeURIComponent(pageUrl)}`,
  );
}

/*
 * =========================================================
 * PAGE INTELLIGENCE 2.0 (Phase 14) — unified content +
 * entity + authority composition for one page. Read-only:
 * no provider calls, no scores. Missing stays
 * unavailable, never zero.
 * =========================================================
 */

export async function getPageIntelligence(
  websiteId: string,
  url: string,
): Promise<Record<string, any>> {
  return request(
    `/content/intelligence?websiteId=${encodeURIComponent(websiteId)}&url=${encodeURIComponent(url)}`,
  );
}

/*
 * =========================================================
 * AGENT READINESS 1.0 (Phase 15) — evidence-backed
 * diagnostic composition for one page. Read-only: no
 * scores, no provider calls. Missing stays unavailable.
 * =========================================================
 */

export async function getAgentReadiness(
  websiteId: string,
  url: string,
): Promise<Record<string, any>> {
  return request(
    `/content/agent-readiness?websiteId=${encodeURIComponent(websiteId)}&url=${encodeURIComponent(url)}`,
  );
}

/*
 * =========================================================
 * ZERO-CLICK + COMMERCIAL SEARCH INTELLIGENCE 1.0
 * (Phase 16) — read-only composition over GSC windows +
 * strategy links + SERP cache + rank + AI + outcomes.
 * Low CTR is never proven zero-click.
 * =========================================================
 */

export async function getSearchCapture(
  websiteId: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/zero-click?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function getQueryCapture(
  websiteId: string,
  query: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/zero-click/query?websiteId=${encodeURIComponent(websiteId)}&query=${encodeURIComponent(query)}&days=${days}`,
  );
}

/*
 * =========================================================
 * SEARCH OPPORTUNITY COMMAND CENTER 1.0 (Phase 17) —
 * composition + decision over existing priorities. Top 5
 * opinionated opportunities, do-this-first, changes, risk,
 * working, funnel, health. No new scores.
 * =========================================================
 */

export async function getSearchCommandCenter(
  websiteId: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/command-center?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

/*
 * =========================================================
 * RESTORED API MODULES
 * =========================================================
 */


/*
 * =========================================================
 * ACTION / OPPORTUNITY TYPES
 * =========================================================
 */

export interface RenkooAction {
  id: string;
  organizationId?: string;
  websiteId?: string | null;
  recommendationId?: string | null;
  type: string;
  title: string;
  description?: string | null;
  url?: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'DISMISSED' | string;
  metadata?: Record<string, any> | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  recommendation?: any | null;
}

export interface ActionsResponse {
  total: number;
  summary: {
    high: number;
    medium: number;
    low: number;
    todo: number;
    inProgress: number;
    done: number;
  };
  actions: RenkooAction[];
}

export interface AiVisibilityDashboard {
  [key: string]: any;
}

export interface AiVisibilityHistory {
  [key: string]: any;
}

export interface AiVisibilitySummary {
  [key: string]: any;
}

export interface GoogleAnalyticsProperty {
  id?: string;
  propertyId?: string;
  displayName?: string;
  name?: string;
  [key: string]: any;
}


export interface GoogleAnalyticsReportRow {
  date: string;
  activeUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  conversions: number;
  engagementRate: number;
  averageSessionDuration: number;
  [key: string]: any;
}
export interface GoogleAnalyticsReport {
  [key: string]: any;
}

export interface BusinessBrain {
  [key: string]: any;
}

export interface BusinessBrainRecommendation {
  id: string;
  organizationId?: string;
  websiteId?: string | null;
  source?: string | null;
  type?: string | null;
  title: string;
  description?: string | null;
  recommendation?: string | null;
  actionText?: string | null;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW' | string | null;
  impact?: string | null;
  effort?: string | null;
  status?: string | null;
  score?: number | null;
  pageUrl?: string | null;
  metadata?: Record<string, any> | null;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface BusinessBrainRecommendationsResponse {
  recommendations?: BusinessBrainRecommendation[];
  total?: number;
  [key: string]: any;
}

export interface Competitor {
  id: string;
  name: string;
  url: string;
  websiteId?: string;
  [key: string]: any;
}

export interface CompetitorCrawlStartResponse {
  [key: string]: any;
}

export interface CompetitorLatestCrawlResponse {
  [key: string]: any;
}

export interface Lead {
  id: string;
  websiteId?: string;
  [key: string]: any;
}

export interface LeadsSummary {
  [key: string]: any;
}

export interface Revenue {
  id: string;
  websiteId?: string;
  [key: string]: any;
}

export interface RevenueListResponse {
  revenues?: Revenue[];
  revenue?: Revenue[];
  total?: number;
  [key: string]: any;
}

export interface RevenueSummary {
  [key: string]: any;
}

export interface LocalSeoSummary {
  [key: string]: any;
}

export interface UnifiedOpportunity {
  id: string;
  source: string;
  sourceId: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  score: number;
  impact?: string | null;
  effort?: string | null;
  status?: string;
  actionText?: string | null;
  recommendation?: string | null;
  pageUrl?: string | null;
  metadata?: Record<string, any> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  businessRelevance?: 'HIGH' | 'MEDIUM' | null;
  businessReason?: string | null;
}

export interface UnifiedOpportunitiesResponse {
  website: Website;
  total: number;
  summary: {
    high: number;
    medium: number;
    low: number;
  };
  bySource?: Record<string, number>;
  opportunities: UnifiedOpportunity[];
}

/* ACTIONS */

export async function getActions(): Promise<ActionsResponse> {
  /*
   * Mounted on dashboard + actions page. Short
   * token-scoped cache; every action mutation in
   * this file invalidates it.
   */
  return cachedSessionRead<ActionsResponse>(
    'actions',
    () => request<ActionsResponse>('/actions'),
  );
}

export async function updateActionStatus(
  actionId: string,
  status: RenkooAction['status'],
): Promise<RenkooAction> {
  try {
    return request<RenkooAction>(
      `/actions/${encodeURIComponent(actionId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
    );
  } finally {
    invalidateSessionCache('actions');
  }
}

/*
 * =========================================================
 * ACTION MEASUREMENT 1.0 (Phase 23) — observational
 * before/after over append-only evidence. No causality,
 * no scores, charged:false.
 * =========================================================
 */

export async function getActionMeasurement(
  actionId: string,
  windowDays = 28,
): Promise<Record<string, any>> {
  return request(
    `/actions/${encodeURIComponent(actionId)}/measurement?window=${windowDays}`,
  );
}

export async function getMeasurementHistory(
  websiteId: string,
  params: Record<string, string | number> = {},
): Promise<Record<string, any>> {
  const query = new URLSearchParams({
    websiteId,
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
  }).toString();
  return request(`/actions/measurement/history?${query}`);
}

/*
 * =========================================================
 * EXECUTION VERIFICATION 1.0 (Phase 28) — DONE ≠
 * VERIFIED. Explicit user-triggered live verification
 * reusing existing crawl quota. No CMS writes.
 * =========================================================
 */

export async function getActionVerification(
  actionId: string,
): Promise<Record<string, any>> {
  return request(
    `/actions/${encodeURIComponent(actionId)}/verification`,
  );
}

export async function verifyActionLive(
  actionId: string,
): Promise<Record<string, any>> {
  return request(
    `/actions/${encodeURIComponent(actionId)}/verify`,
    { method: 'POST' },
  );
}

export async function getActionExecution(
  actionId: string,
): Promise<Record<string, any>> {
  return request(
    `/actions/${encodeURIComponent(actionId)}/execution`,
  );
}

/*
 * =========================================================
 * GOVERNED EXECUTION 1.0 (Phase 29) — proposals live in
 * Action.metadata. ALL WRITES REQUIRE HUMAN APPROVAL.
 * No CMS connected: copy/export/manual only.
 * =========================================================
 */

export async function getActionProposals(
  actionId: string,
): Promise<Record<string, any>> {
  return request(
    `/actions/${encodeURIComponent(actionId)}/proposal`,
  );
}

export async function proposeActionChange(
  actionId: string,
  data: Record<string, any>,
): Promise<Record<string, any>> {
  return request(
    `/actions/${encodeURIComponent(actionId)}/proposal`,
    { method: 'POST', body: JSON.stringify(data ?? {}) },
  );
}

export async function approveActionProposal(
  actionId: string,
  data: Record<string, any>,
): Promise<Record<string, any>> {
  return request(
    `/actions/${encodeURIComponent(actionId)}/approve`,
    { method: 'POST', body: JSON.stringify(data ?? {}) },
  );
}

export async function rejectActionProposal(
  actionId: string,
  data: Record<string, any>,
): Promise<Record<string, any>> {
  return request(
    `/actions/${encodeURIComponent(actionId)}/reject`,
    { method: 'POST', body: JSON.stringify(data ?? {}) },
  );
}

export async function executeActionProposal(
  actionId: string,
  data: Record<string, any>,
): Promise<Record<string, any>> {
  return request(
    `/actions/${encodeURIComponent(actionId)}/execute`,
    { method: 'POST', body: JSON.stringify(data ?? {}) },
  );
}

export async function createAction(data: {
  websiteId?: string;
  recommendationId?: string;
  type?: string;
  title: string;
  description?: string;
  url?: string;
  priority?: string;
  metadata?: any;
}): Promise<RenkooAction> {
  try {
    return request<RenkooAction>('/actions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } finally {
    invalidateSessionCache('actions');
  }
}

/* PROOF CARDS — proof of impact (read-only, always fresh) */

export type ProofState =
  | 'WAITING_FOR_DATA'
  | 'EARLY_SIGNAL'
  | 'MEASURABLE_IMPACT'
  | 'MIXED_RESULTS'
  | 'NO_CLEAR_CHANGE'
  | 'INSUFFICIENT_DATA';

export interface ProofMetric {
  key: string;
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  pct: number | null;
  direction: 'up' | 'down' | 'flat';
  improved: boolean;
  declined: boolean;
  lowerBetter: boolean;
  evidence: string;
}

export interface ProofCard {
  actionId: string;
  websiteId: string | null;
  websiteName: string | null;
  websiteUrl: string | null;
  title: string;
  type: string;
  priority: string;
  createdAt: string;
  completedAt: string | null;
  recommendationId: string | null;
  recommendationTitle: string | null;
  windows: {
    beforeStart: string;
    beforeEnd: string;
    afterStart: string;
    afterEnd: string;
    afterDaysAvailable: number;
    windowDays: number;
  } | null;
  state: ProofState;
  stateReason: string;
  metrics: ProofMetric[];
  evidence: {
    crawl: { state: string; beforeCrawlAt?: string | null; afterCrawlAt?: string | null };
    leads: { state: string };
    revenue: { state: string; currencies?: string[] };
    aiVisibility: { state: string; checksBefore?: number; checksAfter?: number };
    monitoring: { state: string };
    searchTraffic: { state: string; gscConnected: boolean; ga4Connected: boolean };
  };
  revenueNote: string | null;
}

export interface ProofCardsResponse {
  cards: ProofCard[];
  nextCursorId: string | null;
}

export async function getProofCards(params?: {
  websiteId?: string;
  take?: number;
  cursorId?: string;
}): Promise<ProofCardsResponse> {
  const query = new URLSearchParams();
  if (params?.websiteId) query.set('websiteId', params.websiteId);
  if (params?.take) query.set('take', String(params.take));
  if (params?.cursorId) query.set('cursorId', params.cursorId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  // Intentionally uncached: proof reflects the latest stored evidence.
  return request<ProofCardsResponse>(`/proof-cards${suffix}`);
}

export async function getProofCard(
  actionId: string,
): Promise<ProofCard> {
  return request<ProofCard>(
    `/proof-cards/${encodeURIComponent(actionId)}`,
  );
}

/* AI VISIBILITY */

export async function getAiVisibilityDashboard(
  websiteId: string,
): Promise<AiVisibilityDashboard> {
  return request<AiVisibilityDashboard>(
    `/ai-visibility/dashboard?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getAiVisibilityHistory(
  websiteId: string,
  days = 30,
): Promise<AiVisibilityHistory> {
  return request<AiVisibilityHistory>(
    `/ai-visibility/history?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function createAiVisibilitySnapshot(
  websiteId: string,
): Promise<AiVisibilitySummary> {
  return request<AiVisibilitySummary>(
    `/ai-visibility/snapshot?websiteId=${encodeURIComponent(websiteId)}`,
    { method: 'POST' },
  );
}

export interface AiVisibilityQuery {
  id: string;
  websiteId: string;
  query: string;
  category?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiPromptSuggestion {
  query: string;
  category: string;
  deterministic: true;
  alreadyTracked: boolean;
}

export interface AiPromptSuggestionsResponse {
  websiteId: string;
  websiteUrl?: string;
  deterministic: boolean;
  disclaimer?: string;
  reason?: string;
  suggestions: AiPromptSuggestion[];
}

export interface AiCitationDomain {
  domain: string;
  citations: number;
  urls: string[];
  queries: string[];
}

export interface AiCompetitorStanding {
  id?: string;
  name: string;
  url?: string;
  mentions: number;
  hasData?: boolean;
}

export interface AiVisibilityGap {
  key: string;
  title: string;
  description: string;
  priority: string;
  queries: string[];
  evidence?: Record<string, any> | null;
}

export interface AiProviderState {
  id: string;
  displayName: string;
  connected: boolean;
}

export interface AiIntelligence {
  website: {
    id: string;
    name: string;
    url: string;
  };
  providers: AiProviderState[];
  counts: {
    trackedQueries: number;
    completedChecks: number;
    brandMentions: number;
    competitorMentionEvents: number;
    citedDomains: number;
  };
  shareOfVoice: {
    brand: number;
    competitors: number;
    denominator: number;
    note: string;
  } | null;
  trend: {
    recentMentionRate: number | null;
    olderMentionRate: number | null;
    pointChange: number | null;
    recentCount: number;
    olderCount: number;
  } | null;
  citations: AiCitationDomain[];
  competitors: {
    tracked: AiCompetitorStanding[];
    unlisted: Array<{
      name: string;
      mentions: number;
    }>;
  };
  gaps: AiVisibilityGap[];
}

export async function createAiVisibilityQuery(data: {
  websiteId: string;
  query: string;
  category?: string;
}): Promise<AiVisibilityQuery> {
  return request<AiVisibilityQuery>('/ai-visibility/queries', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAiVisibilityQuery(
  id: string,
  data: {
    query?: string;
    category?: string | null;
    isActive?: boolean;
  },
): Promise<AiVisibilityQuery> {
  return request<AiVisibilityQuery>(
    `/ai-visibility/queries/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteAiVisibilityQuery(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request<{ success: boolean; id: string }>(
    `/ai-visibility/queries/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function recordAiVisibilityCheck(data: {
  websiteId: string;
  platform:
    | 'CHATGPT'
    | 'GOOGLE_AI'
    | 'GEMINI'
    | 'CLAUDE'
    | 'PERPLEXITY'
    | 'OTHER';
  query: string;
  mentioned: boolean;
  citationFound: boolean;
  position?: number;
  citationUrl?: string;
  competitorNames?: string[];
  response?: string;
}): Promise<any> {
  return request<any>('/ai-visibility/checks', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAiVisibilityIntelligence(
  websiteId: string,
): Promise<AiIntelligence> {
  return request<AiIntelligence>(
    `/ai-visibility/intelligence?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export interface AiProviderState {
  id: string;
  displayName: string;
  configured?: boolean;
  state:
    | 'CONNECTED'
    | 'NOT_CONFIGURED'
    | 'NOT_CONNECTED';
  resultType?: string | null;
  reason?: string | null;
  [key: string]: any;
}

export interface AiProviderStatesResponse {
  providers: AiProviderState[];
  googleAiSearch?: AiProviderState | null;
  [key: string]: any;
}

export interface AiRunCheckResult {
  check?: Record<string, any> | null;
  queryId?: string | null;
  category?: string | null;
  analysis?: Record<string, any> | null;
  provider?: {
    id: string;
    displayName: string;
    model: string;
    latencyMs: number;
    usage?: Record<string, any> | null;
    [key: string]: any;
  } | null;
  observationType?: string | null;
  resultLabel?: string | null;
  citations?: any[];
  citationsNote?: string | null;
  citationsReason?: string | null;
  sampleSize?: {
    promptChecks?: number;
    note?: string;
    [key: string]: any;
  } | null;
  [key: string]: any;
}

export async function getAiProviderStates(): Promise<AiProviderStatesResponse> {
  return request<AiProviderStatesResponse>(
    '/ai-visibility/providers',
  );
}

export async function runAiVisibilityCheck(data: {
  websiteId: string;
  queryId?: string;
  query?: string;
  provider: 'GEMINI' | 'OPENAI';
}): Promise<AiRunCheckResult> {
  return request<AiRunCheckResult>(
    '/ai-visibility/checks/run',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

/* Phase 6 — AI Search Intelligence 1.0 (additive). */

export interface AiGeneratedPrompt {
  text: string;
  intent: string;
  topic: string;
  sourceKeyword: string | null;
  sourceUrl: string | null;
  country: string;
  language: string;
  evidenceSource: string;
  status: string;
}

export interface AiPromptComparison {
  prompt: string;
  intent: string;
  observations: Array<{
    prompt: string;
    provider: string;
    observedAt: string | null;
    mentioned: boolean;
    relationship: string;
    citedDomains: string[];
    competitorMentions: string[];
    evidenceState: string;
  }>;
  prompts: number;
  brandPresent: boolean;
  brandCited: boolean;
  competitorsPresent: string[];
  competitorsCited: string[];
  citedDomains: string[];
  evidenceState: string;
}

export interface AiSearchGap {
  kind:
    | 'AI_VISIBILITY_GAP'
    | 'AI_CITATION_GAP'
    | 'CONTENT_SOURCE_GAP';
  prompt: string;
  topic: string;
  priority: string;
  why: string;
  evidence: Array<{
    source: string;
    label: string;
    evidenceType: string;
  }>;
  evidenceState: string;
}

export interface AiLosingDiagnosis {
  prompt: string;
  topic: string;
  diagnosis: string;
  headline: string;
  evidence: string[];
  evidenceState: string;
  action: {
    action: string;
    label: string;
    href: string;
  };
}

export interface AiRoadmapCandidate {
  kind: string;
  keyword: string | null;
  targetPage: string | null;
  title: string;
  why: string;
  evidence: Array<{
    source: string;
    label: string;
    evidenceType: string;
  }>;
  strategyPriority: string;
  impact: string;
  effort: string;
  evidenceState: string;
}

export interface AiPromptTrend {
  prompt: string;
  status: string;
  mentionChange: number;
  citationChange: number;
  newCompetitors: string[];
  lostCompetitors: string[];
  note: string;
}

export async function generateAiPromptSet(data: {
  keywords?: Array<{
    keyword: string;
    intent?: string | null;
    topic?: string | null;
    sourceUrl?: string | null;
    country?: string | null;
    language?: string | null;
  }>;
  gscQueries?: string[];
  serpTopics?: string[];
  business?: {
    name?: string | null;
    category?: string | null;
    locations?: string[];
    offerings?: string[];
  };
  competitorTerms?: string[];
  existingContent?: Array<{
    url: string;
    topic?: string | null;
  }>;
  maxPrompts?: number;
  defaultCountry?: string;
  defaultLanguage?: string;
}): Promise<{ prompts: AiGeneratedPrompt[] }> {
  return request<{ prompts: AiGeneratedPrompt[] }>(
    '/ai-visibility/prompt-sets/generate',
    {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    },
  );
}

export async function getAiComparison(
  websiteId: string,
): Promise<{
  comparisons: AiPromptComparison[];
  gaps: AiSearchGap[];
}> {
  return request<{
    comparisons: AiPromptComparison[];
    gaps: AiSearchGap[];
  }>(
    `/ai-visibility/comparison?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getAiCitationReport(
  websiteId: string,
): Promise<
  Array<{
    checkId: string;
    prompt: string;
    provider: string;
    observedAt: string | null;
    relationship: string;
    citations: Array<{
      url: string;
      domain: string;
      class: string;
      evidenceState: string;
    }>;
    citedUrls: string[];
    citedDomains: string[];
    ownCited: boolean;
    competitorCited: string[];
    evidenceState: string;
  }>
> {
  return request(
    `/ai-visibility/citations?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getAiDiagnoses(
  websiteId: string,
): Promise<{
  gaps: AiSearchGap[];
  diagnoses: AiLosingDiagnosis[];
}> {
  return request<{
    gaps: AiSearchGap[];
    diagnoses: AiLosingDiagnosis[];
  }>(
    `/ai-visibility/diagnoses?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getAiRoadmapCandidates(
  websiteId: string,
): Promise<{ candidates: AiRoadmapCandidate[] }> {
  return request<{ candidates: AiRoadmapCandidate[] }>(
    `/ai-visibility/roadmap-candidates?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getAiPromptHistory(
  websiteId: string,
  days = 30,
): Promise<{ trends: AiPromptTrend[] }> {
  return request<{ trends: AiPromptTrend[] }>(
    `/ai-visibility/prompt-history?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

/* Phase 6 — AI Search OS 1.0 (composition reads + opportunity create). */

export interface AiOsCommandCenter {
  website: { id: string; name: string; url: string };
  biggestOpportunity: {
    prompt: string;
    why: string;
    priority: string;
    evidenceState: string;
  } | null;
  metrics: {
    promptsTracked: number;
    promptsObservable: number;
    mentionRate: number | null;
    citationRate: number | null;
    competitorMentionRate: number | null;
    competitorCitationRate: number | null;
    citationShare: number | null;
    insufficientData: boolean;
    denominators: Record<string, string>;
  };
  index: {
    score: number | null;
    band: string;
    components: Record<string, number | null>;
    explanation: string;
  };
  gaps: Array<{
    kind: string;
    prompt: string;
    topic: string;
    priority: string;
    why: string;
  }>;
  citationGaps: Array<{
    kind: string;
    prompt: string;
    topic: string;
    headline: string;
  }>;
  sourceGraph: Array<{
    domain: string;
    frequency: number;
    prompts: string[];
    label: string;
    customerOwned: boolean;
    competitorOwned: boolean;
  }>;
  sourceTypes: Array<{
    type: string;
    domains: string[];
    frequency: number;
    note: string;
  }>;
  radar: Array<{
    competitor: string;
    promptsAppeared: number;
    promptsCited: number;
    promptsTotal: number;
    where: string[];
    sources: string[];
  }>;
  opportunities: Array<{
    kind: string;
    title: string;
    prompt: string | null;
    topic: string | null;
    targetPage: string | null;
    priority: string;
    why: string;
    measurement: string;
  }>;
  roadmapCandidates: Array<{
    kind: string;
    title: string;
    why: string;
  }>;
  readiness: {
    ready: boolean | null;
    blockers: string[];
    note: string;
  } | null;
  unavailable: Array<{
    key: string;
    reason: string;
    unlocks: string;
  }>;
}

export async function getAiCommandCenter(
  websiteId: string,
): Promise<AiOsCommandCenter> {
  return request<AiOsCommandCenter>(
    `/ai-visibility/os/command-center?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export interface AiLabPrompt {
  prompt: string;
  intent: string;
  topic: string;
  journeyStage: string;
  evidenceSource: string;
  generationReason: string;
  status: string;
  groups: string[];
}

export async function getAiPromptLab(
  websiteId: string,
  params?: {
    q?: string;
    intent?: string;
    topic?: string;
    stage?: string;
    group?: string;
    competitor?: string;
  },
): Promise<{
  prompts: AiLabPrompt[];
  clusters: Array<{ topic: string; prompts: AiLabPrompt[] }>;
  groups: string[];
  total: number;
}> {
  const search = new URLSearchParams();
  search.set('websiteId', websiteId);
  if (params?.q) search.set('q', params.q);
  if (params?.intent) search.set('intent', params.intent);
  if (params?.topic) search.set('topic', params.topic);
  if (params?.stage) search.set('stage', params.stage);
  if (params?.group) search.set('group', params.group);
  if (params?.competitor)
    search.set('competitor', params.competitor);
  return request(
    `/ai-visibility/os/prompt-lab?${search.toString()}`,
  );
}

export async function getAiPromptDetail(
  websiteId: string,
  prompt: string,
): Promise<{
  prompt: string;
  tracked: boolean;
  intent: string;
  visibilityState: string;
  badges: string[];
  brandMentioned: boolean;
  brandCited: boolean;
  competitorMentions: string[];
  citations: Array<{ url: string; sourceType: string }>;
  sources: string[];
  why: Array<{
    id: string;
    label: string;
    passed: boolean | null;
    evidence: string;
  }>;
  whatToDo: Array<{
    kind: string;
    title: string;
    priority: string;
    why: string;
    measurement: string;
  }>;
}> {
  const search = new URLSearchParams();
  search.set('websiteId', websiteId);
  search.set('prompt', prompt);
  return request(
    `/ai-visibility/os/prompts/detail?${search.toString()}`,
  );
}

export async function createAiOpportunity(data: {
  websiteId: string;
  kind: string;
  title: string;
  prompt?: string | null;
  topic?: string | null;
  targetPage?: string | null;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  why?: string | null;
}): Promise<{ id: string }> {
  return request<{ id: string }>(
    '/ai-visibility/os/opportunities',
    {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    },
  );
}

/* Phase 7 — AI Prompt Monitoring 1.0. */

export interface AiMonitorStatus {
  status: 'ACTIVE' | 'PAUSED' | 'NOT_CONFIGURED';
  schedules: number;
  nextRunAt: string | null;
  lastRun: {
    id: string;
    status: string;
    origin: string;
    completedAt: string | null;
    success: number;
    failure: number;
    unavailable: number;
    creditUsed: number;
  } | null;
  prompts: number;
}

export async function getAiMonitoringStatus(
  websiteId: string,
): Promise<AiMonitorStatus> {
  return request<AiMonitorStatus>(
    `/ai-visibility/monitoring/status?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function listAiMonitorSchedules(
  websiteId: string,
): Promise<
  Array<{
    id: string;
    surfaces: string[];
    country: string;
    language: string;
    cadence: string;
    isActive: boolean;
    nextRunAt: string | null;
    lastRunAt: string | null;
  }>
> {
  return request(
    `/ai-visibility/monitoring/schedules?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function createAiMonitorSchedule(data: {
  websiteId: string;
  name?: string;
  surfaces: string[];
  country?: string;
  language?: string;
  cadence?: string;
  timezone?: string;
}): Promise<{ id: string }> {
  return request<{ id: string }>(
    '/ai-visibility/monitoring/schedules',
    {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    },
  );
}

export async function updateAiMonitorSchedule(
  id: string,
  data: {
    name?: string;
    surfaces?: string[];
    cadence?: string;
    isActive?: boolean;
    timezone?: string;
  },
): Promise<unknown> {
  return request(
    `/ai-visibility/monitoring/schedules/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data ?? {}),
    },
  );
}

export async function deleteAiMonitorSchedule(
  id: string,
): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(
    `/ai-visibility/monitoring/schedules/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function estimateAiMonitorRun(data: {
  websiteId: string;
  surfaces?: string[];
  country?: string;
  language?: string;
}): Promise<{
  prompts: number;
  surfaces: string[];
  executableSurfaces: number;
  perRun: {
    totalCalls: number;
    billableEstimate: number;
    note: string;
  };
  estimatedMonthlyChecks: number;
  allowance: {
    used: number;
    limit: number | null;
    unlimited: boolean;
  };
  guard: { allowed: boolean; reason: string };
}> {
  return request('/ai-visibility/monitoring/estimate', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function requestAiMonitorRun(data: {
  websiteId: string;
  scheduleId?: string;
  surfaces?: string[];
  country?: string;
  language?: string;
}): Promise<{
  id: string;
  status: string;
  successCount: number;
  failureCount: number;
  unavailableCount: number;
  creditUsed: number;
}> {
  return request('/ai-visibility/monitoring/runs', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function getAiMonitorChanges(
  websiteId: string,
  params?: {
    runId?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<{
  baseline: string | null;
  summary: {
    mentionsGained: number;
    mentionsLost: number;
    citationsGained: number;
    citationsLost: number;
    competitorsEntered: number;
    competitorsLeft: number;
    unchanged: number;
    unknown: number;
    biggestWin: {
      prompt: string;
      surface: string;
      primary: string;
    } | null;
    biggestLoss: {
      prompt: string;
      surface: string;
      primary: string;
    } | null;
    headline: string;
  };
  rows: Array<{
    prompt: string;
    surface: string;
    primary: string;
    kinds: string[];
    competitorsGained: string[];
    competitorsLost: string[];
    sourcesGained: string[];
    sourcesLost: string[];
  }>;
  total: number;
}> {
  const search = new URLSearchParams();
  search.set('websiteId', websiteId);
  if (params?.runId) search.set('runId', params.runId);
  if (params?.page) search.set('page', String(params.page));
  if (params?.pageSize)
    search.set('pageSize', String(params.pageSize));
  return request(
    `/ai-visibility/monitoring/changes?${search.toString()}`,
  );
}

export async function getAiMonitorHistory(
  websiteId: string,
  days: 7 | 30 | 90 = 30,
  surface?: string,
): Promise<{
  days: number;
  trend: Array<{
    day: string;
    mentions: number;
    citations: number;
    competitors: number;
    observations: number;
  }>;
  bySurface: Array<{
    surface: string;
    buckets: Array<{
      day: string;
      mentions: number;
      citations: number;
    }>;
  }>;
  observations: number;
  missingNote: string;
}> {
  const search = new URLSearchParams();
  search.set('websiteId', websiteId);
  search.set('days', String(days));
  if (surface) search.set('surface', surface);
  return request(
    `/ai-visibility/monitoring/history?${search.toString()}`,
  );
}

export async function getAiMonitorPromptHistory(
  websiteId: string,
  prompt: string,
): Promise<{
  prompt: string;
  changes: Array<{
    surface: string;
    primary: string;
    kinds: string[];
  }>;
  rows: Array<{
    id: string;
    surface: string;
    status: string;
    mentioned: boolean;
    citationFound: boolean;
    citationUrl: string | null;
    competitors: string[];
    observedAt: string | null;
  }>;
  total: number;
}> {
  const search = new URLSearchParams();
  search.set('websiteId', websiteId);
  search.set('prompt', prompt);
  return request(
    `/ai-visibility/monitoring/prompts/history?${search.toString()}`,
  );
}

/* Phase 8A — monitoring production health + run observability. */

export interface AiMonitoringHealth {
  monitoring: 'ACTIVE' | 'PAUSED' | 'NOT_CONFIGURED';
  nextRunAt: string | null;
  lastRun: {
    id: string;
    status: string;
    completedAt: string | null;
  } | null;
  lastSuccessfulRun: {
    id: string;
    completedAt: string | null;
  } | null;
  consecutiveFailures: number;
  consecutiveFailuresDetail: number;
  staleRuns: number;
  providers: Array<{
    id: string;
    available: boolean;
  }>;
  credits: {
    used: number;
    limit: number | null;
    blocked: boolean;
    reason: string;
  };
  prompts: number;
  schedulerActivity: {
    lastTickAt: string | null;
    recoveriesLast24h: number;
  } | null;
  currentRunning: {
    id: string;
    startedAt: string | null;
    lastHeartbeatAt: string | null;
    heartbeatAgeMs: number | null;
  } | null;
}

export async function getAiMonitoringHealth(
  websiteId: string,
): Promise<AiMonitoringHealth> {
  return request<AiMonitoringHealth>(
    `/ai-visibility/monitoring/health?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export interface AiRunObservability {
  id: string;
  status: string;
  origin: string;
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  promptsRequested: number;
  promptsExecuted: number;
  successes: number;
  failures: number;
  unavailable: number;
  retries: number;
  creditsConsumed: number;
  errorSummary: string | null;
  stale: boolean;
}

export async function getAiRunObservability(
  runId: string,
): Promise<AiRunObservability> {
  return request<AiRunObservability>(
    `/ai-visibility/monitoring/runs/${encodeURIComponent(runId)}/observability`,
  );
}

/* Phase 8C — official Google/Bing data (honest sources only). */

export interface OfficialCapabilityRow {
  capability: string;
  google: string;
  bing: string;
  renkoo: string;
  evidence: string;
  note: string;
}

export async function getOfficialCapabilities(): Promise<{
  matrix: OfficialCapabilityRow[];
  concepts: string[];
  legend: Record<string, string>;
  sources: string[];
}> {
  return request(
    '/ai-visibility/official/capabilities',
  );
}

export async function syncOfficialGoogle(data: {
  websiteId: string;
  days?: 30 | 90;
}): Promise<{
  evidenceState: string;
  window: { startDate: string; endDate: string };
  semantics: string;
  candidates: number;
  stored: number;
  skipped: number;
  baseline: boolean;
}> {
  return request('/ai-visibility/official/google/sync', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function importOfficialRows(data: {
  websiteId: string;
  provider: string;
  rows: unknown;
}): Promise<{
  evidenceState: string;
  received: number;
  rejected: number;
  stored: number;
  skipped: number;
  baseline: boolean;
}> {
  return request('/ai-visibility/official/import', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function getOfficialSummary(
  websiteId: string,
): Promise<{
  demand: {
    source: string;
    evidenceState: string;
    semantics: string;
    topQueries: Array<{
      query: string | null;
      impressions: number | null;
    }>;
    topPages: Array<{
      pageUrl: string | null;
      impressions: number | null;
    }>;
  };
  aiVisibility: {
    evidenceState: string;
    importCount: number;
    totalImportedImpressions: number;
    note: string;
  };
  unavailable: Array<{
    key: string;
    reason: string;
    evidenceState: string;
  }>;
}> {
  return request(
    `/ai-visibility/official/summary?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

/* Phase 8D — AI crawler + agent analytics (first-party logs only). */

export interface AgentActivity {
  connected: boolean;
  emptyState?: string;
  summary: {
    requests: number;
    families: string[];
    pages: number;
    firstSeen: string | null;
    lastSeen: string | null;
  } | null;
  topAgents: Array<{
    family: string;
    category: string;
    requests: number;
    pages: number;
  }>;
  topPages: Array<{
    url: string;
    requests: number;
    families: string[];
  }>;
  accessIssues: Array<{
    url: string;
    status: number;
    count: number;
    families: string[];
    aiRelated: boolean;
    evidence: string;
  }>;
  changes: Array<{
    kind: string;
    subject: string;
    evidence: string;
  }>;
  verificationNote?: string;
  separationNote?: string;
}

export async function getAgentActivity(
  websiteId: string,
  days: 7 | 30 | 90 = 30,
): Promise<AgentActivity> {
  return request<AgentActivity>(
    `/ai-visibility/agents/activity?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function previewAgentImport(data: {
  csv: string;
  source?: string;
}): Promise<{
  received: number;
  parsed: number;
  rejected: number;
  truncated: boolean;
  families: string[];
  sample: Array<{
    normalizedUrl: string;
    family: string;
    category: string;
  }>;
}> {
  return request('/ai-visibility/agents/import/preview', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function confirmAgentImport(data: {
  websiteId: string;
  csv: string;
  source?: string;
  fileName?: string;
}): Promise<{
  importId: string;
  received: number;
  parsed: number;
  imported: number;
  rejected: number;
  families: string[];
  baseline: string | null;
}> {
  return request('/ai-visibility/agents/import', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function getAgentCoverage(
  websiteId: string,
): Promise<{
  hasObservations: boolean;
  total: number;
  visited: number;
  headline: string;
  pages: Array<{
    url: string;
    source: string;
    coverage: string;
    robots: string;
    agentSentence: string;
  }>;
}> {
  return request(
    `/ai-visibility/agents/coverage?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getAgentDetail(
  websiteId: string,
  family: string,
): Promise<{
  family: string;
  category: string;
  verificationState: string;
  firstSeen: string | null;
  lastSeen: string | null;
  requests: number;
  pages: number;
  statusCodes: Array<{ status: number; count: number }>;
  pagesDetail: Array<{
    url: string;
    requests: number;
    lastSeen: string | null;
    statuses: number[];
  }>;
}> {
  const search = new URLSearchParams();
  search.set('websiteId', websiteId);
  search.set('family', family);
  return request(
    `/ai-visibility/agents/detail?${search.toString()}`,
  );
}

/* Phase 8E — evidence fusion (read-only composition). */

export interface FusedEvidenceItem {
  source: string;
  state: string;
  keyword: string | null;
  page: string | null;
  prompt: string | null;
  topic: string | null;
  window: string | null;
  summary: string;
}

export async function getNextBestAction(
  websiteId: string,
): Promise<{
  action: {
    category: string;
    title: string;
    keyword: string | null;
    targetPage: string | null;
    priority: string;
    measurement: string;
  } | null;
  why: string;
  evidence: FusedEvidenceItem[];
  traceability: {
    recommendationId: string | null;
    recommendationStatus: string | null;
    actionId: string | null;
    actionStatus: string | null;
    note: string;
  } | null;
  reason?: string;
}> {
  return request(
    `/keywords/strategy/next-best-action?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

/* Phase 11 — Rank Intelligence (labeled sources, never merged). */

export interface RankKeywordStat {
  keyword: string;
  url: string | null;
  source: string;
  scope: string;
  current: number | null;
  previous: number | null;
  change: number | null;
  movement: string;
  band: string;
  strikingDistance: boolean;
  firstObserved: string | null;
  lastObserved: string | null;
  observations: number;
}

export async function getRankOverview(
  websiteId: string,
  days = 30,
): Promise<{
  tracked: number;
  gaining: number;
  losing: number;
  top10: number;
  striking: number;
  keywords: RankKeywordStat[];
}> {
  return request(
    `/keywords/rank/overview?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function trackRanks(data: {
  websiteId: string;
  keywords: string[];
  country?: string;
  language?: string;
  refresh?: boolean;
}): Promise<{
  tracked: number;
  results: Array<{
    keyword: string;
    position: number | null;
    url: string | null;
    cached: boolean;
    charged: boolean;
    evidenceState: string;
  }>;
}> {
  return request('/keywords/rank/track', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function syncGscRanks(data: {
  websiteId: string;
  days?: 30 | 90;
}): Promise<{
  evidenceState: string;
  window: { startDate: string; endDate: string };
  semantics: string;
  stored: number;
}> {
  return request('/keywords/rank/gsc-sync', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function getRankChanges(
  websiteId: string,
  days = 30,
): Promise<{
  events: Array<{
    keyword: string;
    scope: string;
    source: string;
    kind: string;
    statement: string;
  }>;
  total: number;
  keywords: number;
}> {
  return request(
    `/keywords/rank/changes?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function getRankMeasure(
  actionId: string,
): Promise<{
  actionId: string;
  title: string;
  keyword: string | null;
  url: string | null;
  before: number | null;
  after: number | null;
  outcome: string;
}> {
  return request(
    `/keywords/rank/measure?actionId=${encodeURIComponent(actionId)}`,
  );
}

/*
 * =========================================================
 * RANK INTELLIGENCE 2.0 — tracked watchlist + runs +
 * URL intelligence + SERP/AI divergence (Phase 31).
 * GSC POSITION vs TRACKED POSITION stay labeled as
 * DIFFERENT_MEASUREMENT_CONTEXT. Missing stays
 * unavailable, never zero. No causal claims.
 * =========================================================
 */

export interface TrackedKeywordRow {
  id: string;
  keyword: string;
  normalizedKeyword: string;
  country: string;
  language: string;
  device: string;
  searchEngine: string;
  targetUrl: string | null;
  origin: string;
  isActive: boolean;
  trackingStartedAt: string;
  lastObservedAt: string | null;
  lastPosition: number | null;
  lastRankingUrl: string | null;
}

export interface TrackedKeywordDetail {
  trackedKeyword: TrackedKeywordRow;
  current: number | null;
  previous: number | null;
  movement: string;
  delta: {
    delta: number | null;
    direction: string;
    statement: string;
  };
  band: string;
  strikingDistance: boolean;
  rankingUrl: string | null;
  previousUrl: string | null;
  urlState: string;
  rankingUrlChanged: boolean;
  targetUrl: string | null;
  targetState: string;
  wrongUrlRanking: boolean;
  serpFeatures: string[];
  aiOverview: string;
  aiMode: string;
  divergence: string;
  volatility: string;
  historyState: string;
  gscComparison: {
    context: string;
    gscLabel: string;
    trackedLabel: string;
    statement: string;
  };
  gscPosition: number | null;
  investigation: string;
  observations: Array<{
    position: number | null;
    rankingUrl: string | null;
    observedAt: string;
    source: string;
  }>;
  observationCount: number;
  lastObservedAt: string | null;
  windowDays?: number;
  note?: string;
}

export async function getTrackingOverview(
  websiteId: string,
): Promise<{
  trackedKeywords: number;
  activeKeywords: number;
  top3: number;
  top10: number;
  wrongUrlCount: number;
  health: string;
  providerConfigured: boolean;
  lastRun: unknown;
  lastObserved: string;
  gscNote: string;
  providerNote: string;
}> {
  return request(
    `/keywords/tracking/overview?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function listTrackedKeywords(
  websiteId: string,
  params?: {
    isActive?: boolean;
    origin?: string;
    device?: string;
    country?: string;
    search?: string;
    pageNum?: number;
    pageSize?: number;
  },
): Promise<{
  keywords: TrackedKeywordRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const q = new URLSearchParams({
    websiteId,
    ...(params?.isActive !== undefined
      ? { isActive: String(params.isActive) }
      : {}),
    ...(params?.origin ? { origin: params.origin } : {}),
    ...(params?.device ? { device: params.device } : {}),
    ...(params?.country ? { country: params.country } : {}),
    ...(params?.search ? { search: params.search } : {}),
    pageNum: String(params?.pageNum ?? 1),
    pageSize: String(params?.pageSize ?? 25),
  });
  return request(`/keywords/tracking/keywords?${q.toString()}`);
}

export async function addTrackedKeywords(data: {
  websiteId: string;
  items: Array<{
    keyword?: string;
    country?: string;
    language?: string;
    device?: string;
    searchEngine?: string;
    targetUrl?: string | null;
    origin?: string;
  }>;
}): Promise<{
  requested: number;
  created: number;
  duplicates: number;
  limit: number | null;
  originNote: string;
}> {
  return request('/keywords/tracking/keywords', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function getTrackedKeyword(
  id: string,
  websiteId: string,
): Promise<TrackedKeywordDetail> {
  return request(
    `/keywords/tracking/keywords/${encodeURIComponent(id)}?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getTrackedKeywordHistory(
  id: string,
  websiteId: string,
  days = 28,
): Promise<TrackedKeywordDetail> {
  return request(
    `/keywords/tracking/keywords/${encodeURIComponent(id)}/history?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function updateTrackedKeyword(
  id: string,
  data: {
    websiteId: string;
    targetUrl?: string | null;
    isActive?: boolean;
  },
): Promise<TrackedKeywordRow> {
  return request(
    `/keywords/tracking/keywords/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data ?? {}),
    },
  );
}

export async function startTrackingRun(data: {
  websiteId: string;
  refresh?: boolean;
  limit?: number;
}): Promise<{
  id: string;
  status: string;
  windowKey: string;
  totalKeywords: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errorSummary: string | null;
}> {
  return request('/keywords/tracking/run', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function listTrackingRuns(
  websiteId: string,
): Promise<
  Array<{
    id: string;
    status: string;
    windowKey: string;
    totalKeywords: number;
    succeeded: number;
    failed: number;
    skipped: number;
    createdAt: string;
  }>
> {
  return request(
    `/keywords/tracking/runs?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getTrackingPages(
  websiteId: string,
): Promise<{
  pages: Array<{
    page: string;
    keywordCount: number;
    top3: number;
    top10: number;
    bestPosition: number | null;
    averagePosition: number | null;
    gscNote: string;
  }>;
}> {
  return request(
    `/keywords/tracking/pages?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getTrackingCompetitors(
  websiteId: string,
  keywordId?: string,
): Promise<{
  keyword?: string;
  yourPosition: number | null;
  competitors: unknown[];
  movementState: string;
  note: string;
}> {
  const q = keywordId
    ? `&keywordId=${encodeURIComponent(keywordId)}`
    : '';
  return request(
    `/keywords/tracking/competitors?websiteId=${encodeURIComponent(websiteId)}${q}`,
  );
}

export async function evaluateTrackingAlerts(data: {
  websiteId: string;
  keywordId?: string;
  limit?: number;
}): Promise<{
  evaluated: number;
  alertsCreated: number;
  alerts: Array<{ trigger: string; title: string }>;
  note: string;
}> {
  return request('/keywords/tracking/alerts/evaluate', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function getTrackingCommandSignals(
  websiteId: string,
): Promise<{
  signals: Array<{
    title: string;
    why: string;
    evidence: Record<string, unknown>;
    action: string;
    measurement: string;
  }>;
}> {
  return request(
    `/keywords/tracking/command-signals?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

/*
 * =========================================================
 * SEARCH CHANGE & ALERT INTELLIGENCE 2.0 — schedules,
 * digest, preferences, observability (Phase 32).
 * Recurring SCHEDULE → COLLECT → … → LEARN loop.
 * CHANGE ≠ CAUSE everywhere. Digest default, instant
 * only for configured high-value events.
 * =========================================================
 */

export interface TrackingScheduleRow {
  id: string;
  country: string;
  language: string;
  device: string;
  searchEngine: string;
  cadence: string;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  missedWindows: number;
}

export async function listTrackingSchedules(
  websiteId: string,
): Promise<{ schedules: TrackingScheduleRow[] }> {
  return request(
    `/keywords/tracking/schedules?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function createTrackingSchedule(data: {
  websiteId: string;
  country?: string;
  language?: string;
  device?: string;
  cadence?: string;
}): Promise<TrackingScheduleRow> {
  return request('/keywords/tracking/schedules', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function updateTrackingSchedule(
  id: string,
  data: {
    websiteId: string;
    cadence?: string;
    isActive?: boolean;
  },
): Promise<TrackingScheduleRow> {
  return request(
    `/keywords/tracking/schedules/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data ?? {}),
    },
  );
}

export async function deleteTrackingSchedule(
  id: string,
  websiteId: string,
): Promise<{ deleted: string }> {
  return request(
    `/keywords/tracking/schedules/${encodeURIComponent(id)}?websiteId=${encodeURIComponent(websiteId)}`,
    { method: 'DELETE' },
  );
}

export async function getTrackingDigest(
  websiteId: string,
  timeZone?: string,
): Promise<{
  title: string;
  total: number;
  positive: number;
  negative: number;
  divergences: number;
  topAttention: string | null;
  items: Array<{
    alertType: string;
    title: string;
    positive: boolean;
    divergence: boolean;
  }>;
  note: string;
  day: string;
  timeZone: string;
  delivery: string;
}> {
  const q = timeZone
    ? `&timeZone=${encodeURIComponent(timeZone)}`
    : '';
  return request(
    `/keywords/tracking/digest?websiteId=${encodeURIComponent(websiteId)}${q}`,
  );
}

export async function getTrackingPreferences(
  websiteId: string,
): Promise<{
  scopes: string[];
  mutedTypes: Array<{ key: string; mutedUntil: string | null }>;
  mutedKeywords: Array<{ key: string; mutedUntil: string | null }>;
  note: string;
}> {
  return request(
    `/keywords/tracking/preferences?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function setTrackingScope(data: {
  websiteId: string;
  scope: string;
  enabled: boolean;
}): Promise<unknown> {
  return request('/keywords/tracking/preferences/scope', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function muteTracking(data: {
  websiteId: string;
  alertType?: string;
  keyword?: string;
  mutedUntil?: string;
}): Promise<{
  muted: Array<{ kind: string; key: string; mutedUntil: string | null }>;
  note: string;
}> {
  return request('/keywords/tracking/preferences/mute', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function unmuteTracking(data: {
  websiteId: string;
  alertType?: string;
  keyword?: string;
}): Promise<{ unmuted: number }> {
  return request('/keywords/tracking/preferences/unmute', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function resolveReversedAlerts(data: {
  websiteId: string;
  keywordId?: string;
}): Promise<{
  evaluated: number;
  resolved: number;
  note: string;
}> {
  return request('/keywords/tracking/alerts/resolve-reversed', {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });
}

export async function getTrackingObservability(
  websiteId: string,
): Promise<{
  health: string;
  lastTickAt: string | null;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  currentlyRunning: number;
  recoveries: number;
  providerUnavailableCount: number;
  note: string;
}> {
  return request(
    `/keywords/tracking/observability?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function dismissMonitoringAlert(
  id: string,
): Promise<unknown> {
  return request(
    `/monitoring/alerts/${encodeURIComponent(id)}/dismiss`,
    { method: 'PATCH' },
  );
}

/*
 * =========================================================
 * TOPIC INTELLIGENCE 1.0 — query fan-out + ownership
 * (Phase 12). Read-only composition over stored
 * evidence: no provider calls, no AI credits, no new
 * scores. Missing stays unavailable, never zero.
 * =========================================================
 */

export interface TopicNeedQuery {
  query: string;
  intent: string;
  google: {
    position: number | null;
    url: string | null;
    evidenceState: string;
  };
  ai: {
    mentioned: boolean | null;
    cited: boolean | null;
    citedUrl: string | null;
    observations: number;
    evidenceState: string;
  };
  page: string | null;
  competitors: string[];
  gap: string;
  gapStatement: string;
}

export interface TopicIntelligence {
  primaryQuery: string;
  topic: string;
  topicSource: string;
  ownership: {
    google: {
      state: string;
      statement: string;
      queriesCovered: number;
      queriesObserved: number;
      evidenceState: string;
    };
    ai: {
      state: string;
      statement: string;
      promptsTracked: number;
      promptsCovered: number;
      evidenceState: string;
    };
    content: {
      state: string;
      statement: string;
      queriesMapped: number;
      queriesObserved: number;
      evidenceState: string;
    };
    relationship: string;
    relationshipStatement: string;
  };
  needs: Array<{
    need: string;
    intent: string;
    queries: TopicNeedQuery[];
  }>;
  totalNeeds: number;
  totalQueries: number;
  nextBestAction: Record<string, any>;
  freshness: Record<string, string>;
}

export async function getTopicIntelligence(
  websiteId: string,
  query: string,
  days = 30,
): Promise<TopicIntelligence> {
  return request(
    `/keywords/topic-intelligence?websiteId=${encodeURIComponent(websiteId)}&query=${encodeURIComponent(query)}&days=${days}`,
  );
}

export interface IntelligenceEvidence {
  source: string;
  metric: string;
  value?: string | number | null;
  previousValue?: string | number | null;
  currentValue?: string | number | null;
  change?: string | number | null;
  timestamp?: string | null;
  pageUrl?: string | null;
  entity?: string | null;
  note?: string | null;
}

export interface IntelligenceOpportunity {
  id: string;
  title: string;
  priority: string;
  score: number;
  source: string;
  recommendation: string | null;
  recommendationId: string | null;
}

export interface IntelligenceResponse {
  website: {
    id: string;
    name: string;
    url: string;
  };
  question: string;
  intent: string;
  matchedKeywords: string[];
  answer: string;
  answerSource: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  confidenceNote: string;
  businessPriority: string | null;
  evidence: IntelligenceEvidence[];
  keySignals: string[];
  why: string[];
  opportunities: IntelligenceOpportunity[];
  suggestedActions: string[];
  dataAvailability: Record<string, string>;
  limitations: string[];
  llm: {
    available: boolean;
    reason: string;
  };
}

export async function askIntelligence(
  websiteId: string,
  question: string,
): Promise<IntelligenceResponse> {
  return request<IntelligenceResponse>('/intelligence/ask', {
    method: 'POST',
    body: JSON.stringify({ websiteId, question }),
  });
}

export interface WorkerAgent {
  id: string;
  name: string;
  description: string;
  capability: string[];
  requiredData: string[];
  allowedTools: string[];
  riskLevel: string;
  approvalRequired: boolean;
  mode: string;
  status:
    | 'AVAILABLE'
    | 'DETERMINISTIC'
    | 'LLM_REQUIRED'
    | 'NOT_AVAILABLE'
    | 'ERROR'
    | string;
}

export interface WorkerTool {
  name: string;
  description: string;
  permission: string;
}

export interface WorkerProposal {
  title: string;
  description: string;
  priority: string;
  type: string;
  metadata?: Record<string, any> | null;
  recommendationId?: string;
}

export interface WorkerRun {
  runId: string;
  agent: {
    id: string;
    name: string;
    approvalRequired: boolean;
    mode: string;
  };
  organizationId: string;
  websiteId: string;
  trigger: string;
  input: string | null;
  status: string;
  approvalState: string;
  selectedTools: string[];
  evidence: Array<{
    source: string;
    metric: string;
    value?: string | number | null;
    entity?: string | null;
    note?: string | null;
  }>;
  resultSummary: string | null;
  proposedActions: WorkerProposal[];
  executedActionIds: string[];
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  providerUnavailable: boolean;
}

export async function listWorkerAgents(
  websiteId?: string,
): Promise<{
  providerUnavailable: boolean;
  providerNote: string;
  futureExternalTools: Array<{
    name: string;
    description: string;
    available: boolean;
  }>;
  tools: WorkerTool[];
  agents: WorkerAgent[];
}> {
  const query = websiteId
    ? `?websiteId=${encodeURIComponent(websiteId)}`
    : '';
  return request(`/agents${query}`);
}

export async function runWorkerAgent(
  agentId: string,
  websiteId: string,
  input?: string,
  trigger?: string,
): Promise<WorkerRun> {
  return request<WorkerRun>(
    `/agents/${encodeURIComponent(agentId)}/run`,
    {
      method: 'POST',
      body: JSON.stringify({
        websiteId,
        input,
        trigger: trigger ?? 'USER_REQUEST',
      }),
    },
  );
}

export async function listWorkerRuns(
  websiteId?: string,
  agentId?: string,
): Promise<{ total: number; runs: WorkerRun[] }> {
  const search = new URLSearchParams();
  if (websiteId) search.set('websiteId', websiteId);
  if (agentId) search.set('agentId', agentId);
  const query = search.toString();
  return request(`/agents/runs${query ? `?${query}` : ''}`);
}

export async function executeWorkerRun(
  runId: string,
  approve: boolean,
  indexes?: number[],
): Promise<WorkerRun & { executedActions: number }> {
  return request(
    `/agents/runs/${encodeURIComponent(runId)}/execute`,
    {
      method: 'POST',
      body: JSON.stringify({ approve, indexes }),
    },
  );
}

export type ReportType =
  | 'EXECUTIVE'
  | 'SEO'
  | 'AI_VISIBILITY'
  | 'TECHNICAL'
  | 'COMPETITOR'
  | 'OUTCOME'
  | 'AGENCY_CLIENT';

export interface ReportListItem {
  id: string;
  websiteId: string;
  clientId: string | null;
  type: string;
  title: string;
  dateFrom: string | null;
  dateTo: string | null;
  status: string;
  createdBy: string | null;
  shareToken: string | null;
  shareExpiresAt: string | null;
  shareRevoked: boolean;
  createdAt: string;
  website?: {
    name: string;
    url: string;
  } | null;
  client?: {
    name: string;
  } | null;
  shared?: boolean;
}

export interface ReportDetail extends ReportListItem {
  organizationId?: string;
  sections: Record<string, any> | null;
  dataAvailability: Record<string, string> | null;
  branding: {
    agencyName?: string;
  } | null;
  error?: string | null;
}

export interface SharedReport {
  title: string;
  type: string;
  dateFrom: string | null;
  dateTo: string | null;
  generatedAt: string;
  website: {
    name: string;
    url: string;
  };
  branding: {
    agencyName?: string;
  } | null;
  sections: Record<string, any> | null;
  dataAvailability: Record<string, string> | null;
}

export interface AgencyClient {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  status: string;
  notes?: string | null;
  createdAt?: string;
  websites?: Array<{
    id: string;
    name: string;
    url: string;
    isActive?: boolean;
  }>;
  reportCount?: number;
}

export interface CommandCenterEntry {
  website: {
    id: string;
    name: string;
    url: string;
  };
  client: {
    id: string;
    name: string;
    status: string;
  } | null;
  highOpportunities: number;
  openActions: number;
  activeAlerts: number;
  completedCrawls: number;
  latestReport: {
    id: string;
    title: string;
    type: string;
    createdAt: string;
  } | null;
  missingData: boolean;
  attention: number;
}

export async function listReports(params: {
  websiteId?: string;
  clientId?: string;
}): Promise<{ total: number; reports: ReportListItem[] }> {
  const search = new URLSearchParams();
  if (params.websiteId) search.set('websiteId', params.websiteId);
  if (params.clientId) search.set('clientId', params.clientId);
  const query = search.toString();
  return request(`/reports${query ? `?${query}` : ''}`);
}

export async function generateReport(data: {
  websiteId: string;
  type: ReportType;
  title?: string;
  from?: string;
  to?: string;
  clientId?: string;
  agencyName?: string;
}): Promise<ReportDetail> {
  return request<ReportDetail>('/reports', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getReport(
  id: string,
): Promise<ReportDetail> {
  return request<ReportDetail>(
    `/reports/${encodeURIComponent(id)}`,
  );
}

export async function deleteReport(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request(
    `/reports/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function shareReport(
  id: string,
  expiresInDays?: number,
): Promise<{
  id: string;
  shareToken: string;
  shareExpiresAt: string | null;
}> {
  return request(
    `/reports/${encodeURIComponent(id)}/share`,
    {
      method: 'POST',
      body: JSON.stringify(
        expiresInDays ? { expiresInDays } : {},
      ),
    },
  );
}

export async function revokeReportShare(
  id: string,
): Promise<{ id: string; shareRevoked: boolean }> {
  return request(
    `/reports/${encodeURIComponent(id)}/revoke`,
    { method: 'PATCH' },
  );
}

export async function publishReport(
  id: string,
): Promise<{ id: string; status: string }> {
  return request(
    `/reports/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
  );
}

export async function archiveReport(
  id: string,
): Promise<{ id: string; status: string }> {
  return request(
    `/reports/${encodeURIComponent(id)}/archive`,
    { method: 'POST' },
  );
}

export async function exportReportCsv(
  id: string,
  section: 'opportunities' | 'actions' | 'changes',
): Promise<string> {
  const token = getToken();
  const response = await fetch(
    `${API_URL}/reports/${encodeURIComponent(id)}/export?section=${section}`,
    {
      headers: {
        Accept: 'text/csv',
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },
    },
  );
  if (!response.ok) throw new Error('CSV export failed.');
  return response.text();
}

/*
 * =========================================================
 * INTEGRATION HUB 1.0 (Phase 21) — stored connection
 * metadata only. No provider calls on read, no secrets.
 * =========================================================
 */

export async function getIntegrationsHub(): Promise<
  Record<string, any>
> {
  return request('/integrations');
}

export async function getCapabilitiesMatrix(
  websiteId: string,
): Promise<Record<string, any>> {
  return request(
    `/integrations/capabilities?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getIntegrationProviderStatus(
  provider: string,
  websiteId?: string,
): Promise<Record<string, any>> {
  const suffix = websiteId
    ? `?websiteId=${encodeURIComponent(websiteId)}`
    : '';
  return request(
    `/integrations/${encodeURIComponent(provider)}/status${suffix}`,
  );
}

/*
 * =========================================================
 * SEARCH EVERYWHERE 1.0 (Phase 22) — cross-surface
 * composition over persisted evidence. No provider calls
 * on reads, no scores.
 * =========================================================
 */

export async function getSearchSurfaces(
  websiteId: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/search/surfaces?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function getSearchSurfaceQuery(
  websiteId: string,
  query: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/search/surfaces/query?websiteId=${encodeURIComponent(websiteId)}&query=${encodeURIComponent(query)}&days=${days}`,
  );
}

export async function getSearchSurfaceTopic(
  websiteId: string,
  topic: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/search/surfaces/topic?websiteId=${encodeURIComponent(websiteId)}&topic=${encodeURIComponent(topic)}&days=${days}`,
  );
}

/*
 * =========================================================
 * CUSTOMER DEMAND 2.0 (Phase 24) — need → journey →
 * decision coverage over observed queries and prompts.
 * Deterministic rules first; no scores.
 * =========================================================
 */

export async function getCustomerNeeds(
  websiteId: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/customer-needs?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function getCustomerNeedQuery(
  websiteId: string,
  query: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/customer-needs/query?websiteId=${encodeURIComponent(websiteId)}&query=${encodeURIComponent(query)}&days=${days}`,
  );
}

export async function getCustomerNeedTopic(
  websiteId: string,
  topic: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/customer-needs/topic?websiteId=${encodeURIComponent(websiteId)}&topic=${encodeURIComponent(topic)}&days=${days}`,
  );
}

/*
 * =========================================================
 * INFORMATION INTELLIGENCE 1.0 (Phase 25) — deterministic
 * claim extraction over stored evidence. No LLM on reads,
 * no scores.
 * =========================================================
 */

export async function getInformationIntelligence(
  websiteId: string,
): Promise<Record<string, any>> {
  return request(
    `/content/information-intelligence?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getInformationClaims(
  websiteId: string,
  url: string,
): Promise<Record<string, any>> {
  return request(
    `/content/information-intelligence/claims?websiteId=${encodeURIComponent(websiteId)}&url=${encodeURIComponent(url)}`,
  );
}

export async function getInformationConflicts(
  websiteId: string,
): Promise<Record<string, any>> {
  return request(
    `/content/information-intelligence/conflicts?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getInformationEntity(
  websiteId: string,
): Promise<Record<string, any>> {
  return request(
    `/content/information-intelligence/entity?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

/*
 * =========================================================
 * SEARCH CHANGE INTELLIGENCE 1.0 (Phase 26) — temporal
 * association only, never causal. No scores.
 * =========================================================
 */

export async function getChangeSummary(
  websiteId: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/change-intelligence?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function getPageChanges(
  websiteId: string,
  url: string,
): Promise<Record<string, any>> {
  return request(
    `/change-intelligence/page?websiteId=${encodeURIComponent(websiteId)}&url=${encodeURIComponent(url)}`,
  );
}

export async function getKeywordChanges(
  websiteId: string,
  keyword: string,
): Promise<Record<string, any>> {
  return request(
    `/change-intelligence/keyword?websiteId=${encodeURIComponent(websiteId)}&keyword=${encodeURIComponent(keyword)}`,
  );
}

export async function getActionChanges(
  websiteId: string,
  actionId: string,
): Promise<Record<string, any>> {
  return request(
    `/change-intelligence/action?websiteId=${encodeURIComponent(websiteId)}&actionId=${encodeURIComponent(actionId)}`,
  );
}

/*
 * =========================================================
 * COMPETITIVE INTELLIGENCE 1.0 (Phase 27) — observed
 * competitor presence only. Never superiority,
 * dominance, share or causation.
 * =========================================================
 */

export async function getCompetitiveSummary(
  websiteId: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/keywords/competitive-intelligence?websiteId=${encodeURIComponent(websiteId)}&days=${days}`,
  );
}

export async function getCompetitiveDetail(
  websiteId: string,
  competitor: string,
): Promise<Record<string, any>> {
  return request(
    `/keywords/competitive-intelligence/competitor?websiteId=${encodeURIComponent(websiteId)}&competitor=${encodeURIComponent(competitor)}`,
  );
}

export async function getCompetitiveNeed(
  websiteId: string,
  needKey: string,
): Promise<Record<string, any>> {
  return request(
    `/keywords/competitive-intelligence/need?websiteId=${encodeURIComponent(websiteId)}&needKey=${encodeURIComponent(needKey)}`,
  );
}

export async function getCompetitiveQuery(
  websiteId: string,
  query: string,
): Promise<Record<string, any>> {
  return request(
    `/keywords/competitive-intelligence/query?websiteId=${encodeURIComponent(websiteId)}&query=${encodeURIComponent(query)}`,
  );
}

/*
 * =========================================================
 * ACTIVATION + TIME-TO-FIRST-VALUE 1.0 (Phase 30) —
 * read-only growth snapshot and funnel from existing
 * records. No new tables, charged:false.
 * =========================================================
 */

export async function getActivation(
  websiteId?: string,
): Promise<Record<string, any>> {
  const suffix = websiteId
    ? `?websiteId=${encodeURIComponent(websiteId)}`
    : '';
  return request(`/dashboard/activation${suffix}`);
}

export async function getActivationFunnel(
  websiteId: string,
): Promise<Record<string, any>> {
  return request(
    `/dashboard/activation/funnel?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function getSharedReport(
  token: string,
): Promise<SharedReport> {
  return request<SharedReport>(
    `/reports/shared/${encodeURIComponent(token)}`,
  );
}

export async function getCommandCenter(): Promise<{
  totalWebsites: number;
  needingAttention: number;
  missingData: number;
  entries: CommandCenterEntry[];
}> {
  return request('/reports/command-center');
}

export async function getReportScheduling(): Promise<{
  supported: boolean;
  reason: string;
}> {
  return request('/reports/scheduling');
}

export async function listClients(): Promise<{
  total: number;
  clients: AgencyClient[];
}> {
  return request('/reports/clients/all');
}

export async function createClient(data: {
  name: string;
  company?: string;
  email?: string;
  notes?: string;
}): Promise<AgencyClient> {
  return request<AgencyClient>('/reports/clients', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateClient(
  id: string,
  data: {
    name?: string;
    company?: string;
    email?: string;
    status?: string;
    notes?: string;
  },
): Promise<AgencyClient> {
  return request<AgencyClient>(
    `/reports/clients/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteClient(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request(
    `/reports/clients/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export async function assignClientWebsite(
  websiteId: string,
  clientId: string | null,
): Promise<{ id: string; name: string; clientId: string | null }> {
  return request('/reports/clients/assign', {
    method: 'POST',
    body: JSON.stringify({ websiteId, clientId }),
  });
}

export interface AgencyAnswer {
  question: string;
  answer: string;
  answerSource: string;
  confidence: string;
  evidence: Array<{
    source: string;
    metric: string;
    value?: string | number | null;
    entity?: string | null;
    note?: string | null;
  }>;
  keySignals: string[];
  limitations: string[];
  llm: {
    available: boolean;
    reason: string;
  };
}

export interface BillingPlan {
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
  maxAiCredits?: number;
}

export interface BillingSubscription {
  id: string;
  status: string;
  plan?: BillingPlan | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  trialStart?: string | null;
  trialEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  provider?: string | null;
  interval?: string | null;
  currency?: string | null;
}

export interface BillingEntitlements {
  planCode: string;
  planName: string;
  tier: string;
  status: string;
  isFree: boolean;
  isInternal?: boolean;
  customPricing: boolean;
  provider?: string | null;
  interval?: string | null;
  currency?: string | null;
  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  limits: Record<string, number | null>;
  features: Record<string, boolean>;
}

export interface BillingUsage {
  planCode: string;
  status: string;
  periodStart: string | null;
  usage: Record<
    string,
    {
      used: number | null;
      limit: number | null;
      remaining: number | null;
      measurable: boolean;
    }
  >;
}

export interface BillingInvoice {
  id: string;
  amount: number;
  currency: string;
  status: string | null;
  created: string;
  url: string | null;
}

export async function getBillingPlans(): Promise<
  BillingPlan[]
> {
  return request<BillingPlan[]>('/billing/plans');
}

export async function getBillingEntitlements(): Promise<BillingEntitlements> {
  return request<BillingEntitlements>(
    '/billing/entitlements',
  );
}

export async function getBillingUsage(): Promise<BillingUsage> {
  return request<BillingUsage>('/billing/usage');
}

export async function getBillingProvider(): Promise<{
  provider: boolean;
}> {
  return request('/billing/provider');
}

export async function getBillingInvoices(): Promise<{
  provider: boolean;
  invoices: BillingInvoice[];
  reason?: string;
}> {
  return request('/billing/invoices');
}

export async function startBillingCheckout(
  organizationId: string,
  planCode: string,
  yearly = false,
): Promise<{
  sessionId: string;
  checkoutUrl: string;
}> {
  return request(
    `/billing/stripe/checkout/${encodeURIComponent(organizationId)}/${encodeURIComponent(planCode)}${yearly ? '/yearly' : ''}`,
    { method: 'POST' },
  );
}

export async function openBillingPortal(): Promise<{
  portalUrl: string;
}> {
  return request('/billing/portal', {
    method: 'POST',
  });
}

export async function cancelBillingSubscription(): Promise<BillingSubscription> {
  return request<BillingSubscription>(
    '/billing/subscription/cancel',
    { method: 'POST' },
  );
}

export async function startBillingTrial(
  organizationId: string,
): Promise<BillingSubscription> {
  return request<BillingSubscription>(
    `/billing/trial/${encodeURIComponent(organizationId)}`,
    { method: 'POST' },
  );
}

export async function getBillingSubscription(
  organizationId: string,
): Promise<BillingSubscription | null> {
  return request<BillingSubscription | null>(
    `/billing/subscription/${encodeURIComponent(organizationId)}`,
  );
}

/*
 * =========================================================
 * RAZORPAY (primary provider) — mirrors the existing
 * backend contract in billing.controller.ts. Amounts,
 * plan IDs and gating resolve server-side; the browser
 * only receives the public Key ID inside a checkout
 * payload. Secrets never leave the backend.
 * =========================================================
 */

export type RazorpayCurrency = 'INR' | 'USD';

export type RazorpayInterval = 'MONTHLY' | 'YEARLY';

export type RazorpayInternationalCards =
  | 'AVAILABLE'
  | 'PENDING_APPROVAL'
  | 'NOT_CONFIGURED';

export interface RazorpayProviderStatus {
  razorpayConfigured: boolean;
  razorpayMode: 'test' | 'live' | 'unconfigured';
  webhookConfigured: boolean;
  internationalCards: RazorpayInternationalCards;
  stripeConfigured: boolean;
  primaryProvider: string;
}

export interface RazorpayCheckoutPayload {
  provider: 'RAZORPAY';
  mode: 'test' | 'live' | 'unconfigured';
  subscriptionId: string;
  keyId: string;
  amount: number;
  currency: string;
  planCode: string;
  interval: string;
  reused: boolean;
}

export interface RazorpayVerifyResult {
  verified: boolean;
  status: string;
  planCode: string;
  liveProviderStatus: string;
  paymentStatus: string;
}

export async function getRazorpayProviderStatus(): Promise<RazorpayProviderStatus> {
  return request<RazorpayProviderStatus>(
    '/billing/provider-status',
  );
}

export async function createRazorpaySubscription(
  planCode: string,
  interval: RazorpayInterval,
  currency: RazorpayCurrency,
): Promise<RazorpayCheckoutPayload> {
  return request<RazorpayCheckoutPayload>(
    '/billing/razorpay/subscription',
    {
      method: 'POST',
      body: JSON.stringify({
        planCode,
        interval,
        currency,
      }),
    },
  );
}

export async function verifyRazorpayCheckout(
  subscriptionId: string,
  paymentId: string,
  signature: string,
): Promise<RazorpayVerifyResult> {
  return request<RazorpayVerifyResult>(
    '/billing/razorpay/verify',
    {
      method: 'POST',
      body: JSON.stringify({
        subscription_id: subscriptionId,
        payment_id: paymentId,
        signature,
      }),
    },
  );
}

export async function syncRazorpaySubscription(): Promise<BillingSubscription> {
  return request<BillingSubscription>(
    '/billing/razorpay/sync',
    { method: 'POST' },
  );
}

export async function cancelRazorpaySubscription(): Promise<{
  cancelled: boolean;
  effective: string;
  message?: string;
  currentPeriodEnd?: string | null;
}> {
  return request('/billing/razorpay/cancel', {
    method: 'POST',
  });
}

export async function reactivateRazorpaySubscription(): Promise<{
  reactivated: boolean;
  status: string;
  message?: string;
}> {
  return request('/billing/razorpay/reactivate', {
    method: 'POST',
  });
}

export async function changeRazorpayPlan(
  planCode: string,
  atCycleEnd = true,
): Promise<{
  direction: string;
  planCode: string;
  effective: string;
  message?: string;
}> {
  return request('/billing/razorpay/change-plan', {
    method: 'POST',
    body: JSON.stringify({
      planCode,
      atCycleEnd,
    }),
  });
}

export async function askAgency(
  question: string,
): Promise<AgencyAnswer> {
  return request<AgencyAnswer>('/intelligence/agency', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export async function createIntelligenceAction(data: {
  websiteId: string;
  recommendationId?: string;
  opportunityId?: string;
}): Promise<any> {
  return request<any>('/intelligence/actions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function suggestAiVisibilityQueries(
  websiteId: string,
): Promise<AiPromptSuggestionsResponse> {
  return request<AiPromptSuggestionsResponse>(
    '/ai-visibility/queries/suggest',
    {
      method: 'POST',
      body: JSON.stringify({ websiteId }),
    },
  );
}

/* ANALYTICS */

export async function getGoogleAnalyticsProperties() {
  return request<GoogleAnalyticsProperty[]>(
    '/google/analytics/properties',
  );
}

export async function selectGoogleAnalyticsProperty(
  propertyId: string,
) {
  try {
    return request<GoogleConnection>(
      `/google/analytics/select-property?propertyId=${encodeURIComponent(propertyId)}`,
    );
  } finally {
    invalidateSessionCache('google-status');
  }
}

export async function getGoogleAnalyticsReport(
  startDate: string,
  endDate: string,
) {
  return request<GoogleAnalyticsReport>(
    `/google/analytics/report?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  );
}

/* BACKLINKS */

export async function getBacklinksOverview(
  websiteId: string,
) {
  return request<any>(
    `/backlinks/${encodeURIComponent(websiteId)}`,
  );
}

export async function getBacklinks(
  websiteId: string,
  filters?: {
    status?: string;
    linkType?: string;
    domain?: string;
    quality?: string;
  },
) {
  const params = new URLSearchParams();

  if (filters?.status)
    params.set('status', filters.status);
  if (filters?.linkType)
    params.set('linkType', filters.linkType);
  if (filters?.domain)
    params.set('domain', filters.domain);
  if (filters?.quality)
    params.set('quality', filters.quality);

  const suffix = params.toString()
    ? `?${params.toString()}`
    : '';

  return request<any>(
    `/backlinks/${encodeURIComponent(websiteId)}/list${suffix}`,
  );
}

export async function getBacklinkProviderStatus(): Promise<
  Record<string, any>
> {
  return request('/backlinks/provider/status');
}

export async function getBacklinkHistory(
  websiteId: string,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/history`,
  );
}

export async function getBacklinkCompetitorGap(
  websiteId: string,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/competitor-gap`,
  );
}

export async function importBacklinks(
  websiteId: string,
  backlinks: Array<Record<string, any>>,
  source?: string,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/import`,
    {
      method: 'POST',
      body: JSON.stringify({
        backlinks,
        source,
      }),
    },
  );
}

export async function reconcileBacklinks(
  websiteId: string,
  observedUrls: string[],
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/reconcile`,
    {
      method: 'POST',
      body: JSON.stringify({ observedUrls }),
    },
  );
}

export async function createBacklinkOpportunity(
  websiteId: string,
  data: Record<string, any>,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/opportunities`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function backlinkOpportunityToRecommendation(
  websiteId: string,
  id: string,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/opportunities/${encodeURIComponent(id)}/recommendation`,
    { method: 'POST' },
  );
}

export async function getBacklinkDomains(
  websiteId: string,
) {
  return request<any>(
    `/backlinks/${encodeURIComponent(websiteId)}/domains`,
  );
}

export async function getBacklinkOpportunities(
  websiteId: string,
) {
  return request<any>(
    `/backlinks/${encodeURIComponent(websiteId)}/opportunities`,
  );
}

/*
 * =========================================================
 * AUTHORITY INTELLIGENCE 1.0 (Phase 18) — evidence-backed
 * composition over stored backlink evidence + bounded CSV
 * import. No backlink index, no DR/DA, no scores.
 * =========================================================
 */

export async function getAuthorityOverview(
  websiteId: string,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/authority/overview`,
  );
}

export async function getAuthorityOpportunities(
  websiteId: string,
  limit = 20,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/authority/opportunities?limit=${limit}`,
  );
}

export async function getAuthorityCompetitorGap(
  websiteId: string,
  limit = 50,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/authority/competitor-gap?limit=${limit}`,
  );
}

export async function getAuthorityPages(
  websiteId: string,
  limit = 50,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/authority/pages?limit=${limit}`,
  );
}

export async function previewAuthorityImport(
  websiteId: string,
  csv: string,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/authority/import/preview`,
    { method: 'POST', body: JSON.stringify({ csv }) },
  );
}

export async function confirmAuthorityImport(
  websiteId: string,
  csv: string,
): Promise<Record<string, any>> {
  return request(
    `/backlinks/${encodeURIComponent(websiteId)}/authority/import/confirm`,
    { method: 'POST', body: JSON.stringify({ csv }) },
  );
}

/*
 * =========================================================
 * LOCAL SEARCH INTELLIGENCE 1.0 (Phase 19) — read-only
 * composition over business identity, locations, crawl
 * JSON-LD, GSC queries, ranks, SERP cache, AI, outcomes.
 * No Local Score, no Maps ranks, no GBP metrics.
 * =========================================================
 */

export async function getLocalOverview(
  websiteId: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/local-seo/${encodeURIComponent(websiteId)}/local/overview?days=${days}`,
  );
}

export async function getLocalOpportunities(
  websiteId: string,
  days = 28,
): Promise<Record<string, any>> {
  return request(
    `/local-seo/${encodeURIComponent(websiteId)}/local/opportunities?days=${days}`,
  );
}

export async function getLocalLocations(
  websiteId: string,
): Promise<Record<string, any>> {
  return request(
    `/local-seo/${encodeURIComponent(websiteId)}/local/locations`,
  );
}

export async function getLocalLocation(
  websiteId: string,
  location: string,
): Promise<Record<string, any>> {
  return request(
    `/local-seo/${encodeURIComponent(websiteId)}/local/location?location=${encodeURIComponent(location)}`,
  );
}

/* BUSINESS BRAIN */

export async function getBusinessBrain(
  websiteId: string,
) {
  return request<BusinessBrain>(
    `/business-brain/${encodeURIComponent(websiteId)}`,
  );
}

export async function updateBusinessBrain(
  websiteId: string,
  data: Record<string, any>,
) {
  try {
    return request<BusinessBrain>(
      `/business-brain/${encodeURIComponent(websiteId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  } finally {
    invalidateSessionCache(
      `business-context:${websiteId}`,
    );
  }
}

export async function analyzeBusinessBrain(
  websiteId: string,
) {
  try {
    return request<any>(
      `/business-brain/${encodeURIComponent(websiteId)}/analyze`,
      { method: 'POST' },
    );
  } finally {
    invalidateSessionCache(
      `business-context:${websiteId}`,
    );
  }
}

export async function getBusinessBrainRecommendations(
  websiteId: string,
) {
  return request<BusinessBrainRecommendationsResponse>(
    `/recommendations/business-brain?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

export async function createActionFromRecommendation(
  recommendationId: string,
): Promise<RenkooAction> {
  try {
    return request<RenkooAction>(
      `/recommendations/${encodeURIComponent(recommendationId)}/action`,
      { method: 'POST' },
    );
  } finally {
    invalidateSessionCache('actions');
  }
}

/* COMPETITORS */

export async function getCompetitors() {
  /*
   * Mounted on dashboard + competitors views. Short
   * token-scoped cache; competitor mutations below
   * invalidate it.
   */
  return cachedSessionRead<Competitor[]>(
    'competitors',
    () => request<Competitor[]>('/competitors'),
  );
}

export async function createCompetitor(data: {
  name: string;
  url: string;
  websiteId: string;
}) {
  try {
    return request<Competitor>('/competitors', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } finally {
    invalidateSessionCache('competitors');
  }
}

export async function deleteCompetitor(id: string) {
  try {
    return request(
      `/competitors/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  } finally {
    invalidateSessionCache('competitors');
  }
}

export async function crawlCompetitor(id: string) {
  return request<CompetitorCrawlStartResponse>(
    `/competitors/${encodeURIComponent(id)}/crawl`,
    { method: 'POST' },
  );
}

export async function getLatestCompetitorCrawl(id: string) {
  return request<CompetitorLatestCrawlResponse>(
    `/competitors/${encodeURIComponent(id)}/crawls/latest`,
  );
}

export interface CompetitorCrawlHistoryItem {
  id: string;
  competitorId: string;
  status: string;
  pagesCrawled: number;
  pagesDiscovered: number;
  score: number;
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export async function getCompetitorCrawlHistory(id: string) {
  const response = await request<
    CompetitorCrawlHistoryItem[] | { crawls?: CompetitorCrawlHistoryItem[] | null }
  >(
    `/competitors/${encodeURIComponent(id)}/crawls`,
  );
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.crawls)) return response.crawls;
  return [];
}

/* LEADS */

export async function getLeads(
  websiteId: string,
): Promise<Lead[]> {
  const response = await request<
    Lead[] | { leads?: Lead[] | null }
  >(
    `/leads/${encodeURIComponent(websiteId)}`,
  );

  if (Array.isArray(response)) return response;

  if (response && Array.isArray(response.leads)) {
    return response.leads;
  }

  return [];
}

export async function getLeadsSummary(
  websiteId: string,
): Promise<LeadsSummary> {
  return request<LeadsSummary>(
    `/leads/${encodeURIComponent(websiteId)}/summary`,
  );
}

export async function createLead(
  websiteId: string,
  data: Record<string, any>,
): Promise<Lead> {
  return request<Lead>(
    `/leads/${encodeURIComponent(websiteId)}`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function updateLead(
  websiteId: string,
  leadId: string,
  data: Record<string, any>,
): Promise<Lead> {
  return request<Lead>(
    `/leads/${encodeURIComponent(websiteId)}/${encodeURIComponent(leadId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteLead(
  websiteId: string,
  leadId: string,
) {
  return request(
    `/leads/${encodeURIComponent(websiteId)}/${encodeURIComponent(leadId)}`,
    { method: 'DELETE' },
  );
}

/* REVENUE */

export async function getRevenue(
  websiteId: string,
) {
  return request<RevenueListResponse>(
    `/revenue/${encodeURIComponent(websiteId)}`,
  );
}

export async function getRevenueSummary(
  websiteId: string,
) {
  return request<RevenueSummary>(
    `/revenue/${encodeURIComponent(websiteId)}/summary`,
  );
}

export async function createRevenue(
  websiteId: string,
  data: Record<string, any>,
) {
  return request<Revenue>(
    `/revenue/${encodeURIComponent(websiteId)}`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

/* LOCAL SEO */

export async function getLocalSeoSummary(
  websiteId: string,
) {
  return request<LocalSeoSummary>(
    `/local-seo/${encodeURIComponent(websiteId)}/summary`,
  );
}

export async function getLocalSeoAudits(
  websiteId: string,
) {
  return request<any>(
    `/local-seo/${encodeURIComponent(websiteId)}/audits`,
  );
}

export async function getLocalSeoQueries(
  websiteId: string,
) {
  return request<any>(
    `/local-seo/${encodeURIComponent(websiteId)}/queries`,
  );
}

export async function getLocalSeoOpportunities(
  websiteId: string,
) {
  return request<any>(
    `/local-seo/${encodeURIComponent(websiteId)}/opportunities`,
  );
}

/* UNIFIED OPPORTUNITIES */

export async function getUnifiedOpportunities(
  websiteId: string,
): Promise<UnifiedOpportunitiesResponse> {
  return request<UnifiedOpportunitiesResponse>(
    `/recommendations/opportunities?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

/*
 * =========================================================
 * ACCOUNT / SETTINGS
 * =========================================================
 */

export interface CurrentAccount {
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
  };
  membership: {
    role: string;
  } | null;
  website: {
    id: string;
    name: string;
    url: string;
    industry: string | null;
    country: string | null;
    isActive: boolean;
  } | null;
}

export async function getCurrentAccount(): Promise<CurrentAccount> {
  /*
   * Same GET /auth/me payload as getMe — shares the
   * 'me' session entry instead of fetching and
   * storing a second copy on every shell mount.
   */
  const data = await cachedSessionRead<any>(
    'me',
    () => request('/auth/me'),
  );

  return data as CurrentAccount;
}

export async function updateProfile(name: string) {
  try {
    return await request<CurrentAccount['user']>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  } finally {
    invalidateSessionCache('me');
  }
}

export async function updatePassword(
  currentPassword: string,
  newPassword: string,
) {
  return request<{ success: boolean; message: string }>(
    '/auth/password',
    {
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    },
  );
}
export type TeamMember = {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
};

export async function getTeamMembers(): Promise<TeamMember[]> {
  return request<TeamMember[]>("/team/members");
}

export async function inviteTeamMember(
  email: string,
  role: "ADMIN" | "MEMBER"
) {
  return request("/team/invites", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function updateTeamMemberRole(
  memberId: string,
  role: "ADMIN" | "MEMBER"
) {
  return request(`/team/members/${memberId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function removeTeamMember(memberId: string) {
  return request(`/team/members/${memberId}`, {
    method: "DELETE",
  });
}
export async function registerWithInvite(data: {
  token: string;
  email: string;
  password: string;
  name: string;
}) {
  return request("/auth/register/invite", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function acceptTeamInvite(token: string) {
  return request("/team/invites/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}






export interface MetricComparison {
  metric: string;
  renkoo: number;
  competitor: number;
  gap: number;
  winner: 'RENKOO' | 'COMPETITOR' | 'EQUAL';
}

export interface PageGapSide {
  exists: boolean;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  wordCount: number;
  images: number;
  imagesWithoutAlt: number;
  internalLinks: number;
  loadTimeMs: number | null;
  structuredDataCount: number;
}

export interface PageGap {
  url: string;
  renkoo: PageGapSide;
  competitor: PageGapSide;
  gaps: string[];
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ComparisonOpportunity {
  id: string;
  type: string;
  title: string;
  description: string;
  recommendation: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priorityScore: number;
  impactScore: number;
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  affectedPages: number;
}

export interface CompetitorComparisonResponse {
  comparison: {
    status: 'STRONGER' | 'WEAKER' | 'EQUAL';
    renkoo: {
      websiteId: string;
      websiteName: string;
      websiteUrl: string;
      crawlId: string;
      crawlDate: string;
      pages: number;
    };
    competitor: {
      id: string;
      name: string;
      url: string;
      domain: string;
      crawlId: string;
      crawlDate: string;
      pages: number;
    };
  };
  metrics: MetricComparison[];
  pageGaps: PageGap[];
  opportunities: ComparisonOpportunity[];
  opportunitySummary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    totalImpactScore: number;
  };
  summary: {
    totalMetrics: number;
    renkooWins: number;
    competitorWins: number;
    equal: number;
    totalPageGaps: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
  };
}

export async function getCompetitorComparison(
  competitorId: string,
): Promise<CompetitorComparisonResponse> {
  return request<CompetitorComparisonResponse>(
    `/comparison/competitors/${encodeURIComponent(competitorId)}`,
  );
}

export async function getCompetitorRecommendations(
  competitorId: string,
) {
  return request<any>(
    `/recommendations/competitors/${encodeURIComponent(competitorId)}`,
  );
}

/* ROI */

export interface RoiSourceBreakdown {
  source: string;
  revenue: number;
  spend: number;
  profit: number;
  roi: number | null;
  roas: number | null;
}

export interface RoiSummary {
  websiteId: string;
  currency: string;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  totalRevenue: number;
  totalSpend: number;
  profit: number;
  roi: number | null;
  roas: number | null;
  convertedLeads: number;
  revenueTransactions: number;
  spendTransactions: number;
  bySource: RoiSourceBreakdown[];
}

export interface OutcomeFunnel {
  visitors: number | null;
  visitorsAvailability: string;
  engaged: number | null;
  engagedAvailability: string;
  leads: number;
  qualified: number;
  conversions: number;
  conversionRate: number | null;
  revenue: number;
  revenueTransactions: number;
}

export interface OutcomeAttribution {
  tiers: Record<
    string,
    { count: number; amount: number }
  >;
  attributedRevenue: number;
  totalRevenue: number;
  coverage: number | null;
}

export interface OutcomeRoi {
  spend: number;
  attributedRevenue: number;
  attributedProfit: number;
  attributedRoi: number | null;
  measurable: boolean;
}

export interface OutcomeSource {
  source: string;
  leads: number;
  conversions: number;
  attributedRevenue: number;
  sourceRevenue: number;
  spend: number;
  conversionRate: number | null;
  roi: number | null;
}

export interface OutcomeGap {
  id: string;
  source: string;
  type: string;
  title: string;
  description: string;
  priority: string;
}

export interface OutcomeResponse {
  websiteId: string;
  currency: string;
  dateRange: {
    from: string | null;
    to: string | null;
  };
  funnel: OutcomeFunnel;
  attribution: OutcomeAttribution;
  roi: OutcomeRoi;
  sources: OutcomeSource[];
  recentChanges: {
    leadsRecent: number;
    leadsPrior: number;
    leadsDelta: number;
    revenueRecent: number;
    revenuePrior: number;
    revenueDelta: number;
  };
  conversionGaps: OutcomeGap[];
}

export async function getRoiOutcome(
  websiteId: string,
  from?: string,
  to?: string,
): Promise<OutcomeResponse> {
  const params = new URLSearchParams();

  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const query = params.toString();

  return request<OutcomeResponse>(
    `/roi/${encodeURIComponent(websiteId)}/outcome${query ? `?${query}` : ''}`,
  );
}

export async function getRoiSummary(
  websiteId: string,
  from?: string,
  to?: string,
): Promise<RoiSummary> {
  const params = new URLSearchParams();

  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const query = params.toString();

  return request<RoiSummary>(
    `/roi/${encodeURIComponent(websiteId)}/summary${query ? `?${query}` : ''}`,
  );
}

/*
 * =========================================================
 * SEARCH-TO-REVENUE + AI ROI 1.0 (Phase 13).
 * Read-only composition over stored evidence: search
 * demand, ranks, pages, leads, revenue, spend, AI
 * monitoring, actions. Missing stays unavailable,
 * never zero; movement is observed, never causal.
 * =========================================================
 */

export interface SearchRevenueFunnelStage {
  stage: string;
  value: number | null;
  window: string;
  evidenceState: string;
}

export interface SearchRevenueResponse {
  website: { id: string; name: string; url: string };
  window: {
    days: number;
    from: string;
    to: string;
    gsc: string;
    ai: string;
    outcomes: string;
  };
  snapshot: {
    revenue: number | null;
    revenueState: string;
    customers: number;
    qualified: number;
    leads: number;
    outcomesState: string;
  };
  funnel: SearchRevenueFunnelStage[];
  pages: Array<Record<string, any>>;
  pageTotal: number;
  topics: Array<Record<string, any>>;
  channels: Array<Record<string, any>>;
  ai: Record<string, any>;
  actions: Array<Record<string, any>>;
  commercial: Array<Record<string, any>>;
  diagnostic: { state: string; statement: string };
  roi: {
    roiPercent: number | null;
    statement: string;
    evidenceState: string;
  };
  gaps: Array<{ key: string; statement: string }>;
  nextBestAction: Record<string, any>;
  freshness: Record<string, string>;
}

export async function getSearchRevenue(
  websiteId: string,
  days = 28,
): Promise<SearchRevenueResponse> {
  return request<SearchRevenueResponse>(
    `/roi/${encodeURIComponent(websiteId)}/search-revenue?days=${days}`,
  );
}

/*
 * =========================================================
 * SEARCH-TO-REVENUE ATTRIBUTION 2.0 (Phase 33).
 * Evidence-first outcome attribution: OBSERVED vs
 * ATTRIBUTED vs INFERRED vs ESTIMATED vs UNAVAILABLE.
 * GSC query → revenue stays CONTEXTUAL. Temporal
 * association only — never causal. No ROI score.
 * =========================================================
 */

export interface AttributionHeroMetric {
  key: string;
  value: string | null;
  evidence: string;
}

export interface AttributionOverview {
  websiteId: string;
  websiteFound?: boolean;
  windowDays: number;
  hierarchy: string;
  hero: AttributionHeroMetric[];
  aiHero: AttributionHeroMetric[];
  aiNote: string;
  organic: {
    sessions: number | null;
    keyEvents: number | null;
    channelRevenue: number | null;
    evidence: string;
    note: string;
  };
  leads: {
    total: number;
    qualified: number | null;
    won: number;
    countNote: string;
    qualification: string;
  };
  revenue: {
    recognized: number;
    amount: number | null;
    currencies: string[];
    currencyNote: string;
    money: Array<{
      amount: number | null;
      currency: string | null;
      state: string;
      note: string;
    }>;
    explanation: {
      where: string;
      source: string;
      attribution: string;
      channel: string;
      window: string;
      status: string;
    } | null;
  };
  roi: {
    roi: number | null;
    label: string;
    state: string;
    spend: number | null;
    spendNote: string;
  };
  gap: string;
  gapNote: string;
  prompts: string[];
  freshness: string;
  channelNote: string;
  causality: string;
}

export async function getAttributionOverview(
  websiteId: string,
  days = 28,
): Promise<AttributionOverview> {
  return request(
    `/roi/${encodeURIComponent(websiteId)}/attribution/overview?days=${days}`,
  );
}

export async function getAttributionPages(
  websiteId: string,
  days = 28,
): Promise<{
  websiteId: string;
  websiteFound?: boolean;
  windowDays: number;
  channelAvailable: boolean;
  pages: Array<{
    page: string;
    organicSessions: number;
    keyEvents: number;
    leads: number;
    revenue: number | null;
    revenueState: string;
  }>;
  note: string;
}> {
  return request(
    `/roi/${encodeURIComponent(websiteId)}/attribution/pages?days=${days}`,
  );
}

export async function getAttributionNeeds(
  websiteId: string,
  days = 28,
): Promise<{
  websiteId: string;
  websiteFound?: boolean;
  windowDays: number;
  gscAvailable: boolean;
  needs: Array<{
    query: string;
    gscClicks: number | null;
    gscImpressions: number | null;
    gscPosition: number | null;
    demandEvidence: string;
    relation: { relation: string; statement: string };
    leadHint: string | null;
    quality: string;
  }>;
  association: string;
}> {
  return request(
    `/roi/${encodeURIComponent(websiteId)}/attribution/needs?days=${days}`,
  );
}

export async function getAttributionActions(
  websiteId: string,
  days = 28,
): Promise<{
  websiteId: string;
  websiteFound?: boolean;
  windowDays: number;
  actions: Array<{
    id: string;
    title: string;
    status: string | null;
    keyword: string | null;
    rank: unknown;
    trafficNote: string;
    leadsBefore: number;
    leadsAfter: number;
    revenueNote: string;
    statement: string;
  }>;
  sequence: string;
}> {
  return request(
    `/roi/${encodeURIComponent(websiteId)}/attribution/actions?days=${days}`,
  );
}

export async function getAttributionModel(
  websiteId: string,
  days = 28,
): Promise<{
  websiteId: string;
  websiteFound?: boolean;
  windowDays: number;
  model: string;
  modelNote: string;
  channels: Array<{
    channel: string;
    sessions: number;
    conversions: number;
    revenue: number;
    quality: string;
    qualityNote: string;
  }>;
  unattributedNote: string;
  pathExample: unknown;
  creditExample: string;
  lookback: string;
  modeled: string;
  freshness: string;
}> {
  return request(
    `/roi/${encodeURIComponent(websiteId)}/attribution/model?days=${days}`,
  );
}

export async function getAttributionAi(
  websiteId: string,
  days = 28,
): Promise<{
  websiteId: string;
  websiteFound?: boolean;
  windowDays: number;
  available: boolean;
  traffic: {
    sessions: number;
    conversions: number;
    revenue: number;
    evidence: string;
    note: string;
  };
  granularity: string;
  bySource: Array<{
    source: string;
    sessions: number;
    conversions: number;
    revenue: number;
  }>;
  visibility: { citations: number; mentions: number; note: string };
  statement: string;
}> {
  return request(
    `/roi/${encodeURIComponent(websiteId)}/attribution/ai?days=${days}`,
  );
}

export async function getAttributionSignals(
  websiteId: string,
): Promise<{
  signals: Array<{
    what: string;
    source: string;
    window: string;
    attribution: string;
    next: string;
  }>;
}> {
  return request(
    `/roi/${encodeURIComponent(websiteId)}/attribution/signals`,
  );
}

export async function getAttributionClientReport(
  websiteId: string,
): Promise<{ lines: string[]; attribution: string }> {
  return request(
    `/roi/${encodeURIComponent(websiteId)}/attribution/client-report`,
  );
}

export async function getAnalyticsChannelReport(
  startDate: string,
  endDate: string,
): Promise<unknown> {
  return request(
    `/google/analytics/channel-report?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  );
}

/*
 * =========================================================
 * UNIFIED GROWTH DECISION ENGINE 1.0 (Phase 34).
 * Composition-only decision ordering over existing
 * evidence. No scores, no CRUD, no auto-execution.
 * =========================================================
 */

export interface GrowthDecision {
  fingerprint: string;
  decisionType: string;
  title: string;
  summary: string;
  priorityBand: string;
  existingPriority: string | null;
  status: string;
  primaryEvidence: string;
  supportingEvidence: string[];
  evidenceState: string;
  page: string | null;
  keyword: string | null;
  customerNeed: string | null;
  existingRecommendationId: string | null;
  existingActionId: string | null;
  existingActionStatus: string | null;
  actionReuse: string;
  verificationState: string | null;
  measurementState: string | null;
  nextAction: string;
  blockedReason: string | null;
  unavailableReason: string | null;
  conflict: {
    what: string;
    sources: string[];
    known: string;
    unknown: string;
    safeNextStep: string;
  } | null;
  whyFirst: string;
  trace: string[];
  section: string;
}

export interface GrowthPlan {
  websiteId: string;
  now: GrowthDecision[];
  next: GrowthDecision[];
  wait: GrowthDecision[];
  blocked: GrowthDecision[];
  completed: Array<{
    actionId: string;
    title: string;
    status: string;
    verificationState: string;
    measurementState: string;
    measurement: string | null;
    learning: string;
  }>;
  material: {
    status: string;
    section: string;
    nextAction: string;
    unavailableReason: string;
  } | null;
  availability: Record<string, boolean>;
  counts: Record<string, number>;
  reuseNote?: string;
}

export async function getGrowthPlan(
  websiteId: string,
): Promise<GrowthPlan> {
  return request(
    `/growth-plan/${encodeURIComponent(websiteId)}`,
  );
}

export async function getGrowthNow(
  websiteId: string,
): Promise<{ websiteId: string; now: GrowthDecision[]; why: string }> {
  return request(
    `/growth-plan/${encodeURIComponent(websiteId)}/now`,
  );
}

export async function getGrowthDecisions(
  websiteId: string,
  section?: string,
): Promise<{ websiteId: string; decisions: GrowthDecision[] }> {
  const q = section ? `?section=${encodeURIComponent(section)}` : '';
  return request(
    `/growth-plan/${encodeURIComponent(websiteId)}/decisions${q}`,
  );
}

export async function getGrowthDecision(
  websiteId: string,
  fingerprint: string,
): Promise<GrowthDecision & { reuse: string; clientWording: string }> {
  return request(
    `/growth-plan/${encodeURIComponent(websiteId)}/decisions/${encodeURIComponent(fingerprint)}`,
  );
}

export async function refreshGrowthPlan(
  websiteId: string,
): Promise<{
  websiteId: string;
  refreshedAt: string;
  decisions: number;
  completed: number;
  note: string;
}> {
  return request(
    `/growth-plan/${encodeURIComponent(websiteId)}/refresh`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

/*
 * =========================================================
 * BUSINESS GOAL → GROWTH ROADMAP 1.0 (Phase 35).
 * Goal-aligned 30/60/90 sequencing. TARGET_UNSET by
 * default, TIMING_UNCERTAIN over fabricated dates,
 * categorical alignment — never a score.
 * =========================================================
 */

export interface BusinessGoalRow {
  goalType: string | null;
  goalLabel: string;
  goalSource: string;
  goalEvidenceState: string;
  targetValue: null;
  targetUnit: null;
  targetWindow: null;
  baseline: string | null;
  measurementSource: string | null;
  status: string;
  targetNote: string;
}

export interface RoadmapItemRow {
  id: string;
  decision: GrowthDecision;
  goalAlignment: string;
  goalExplanation: string;
  whyNow: string;
  horizon: string;
  horizonNote: string;
  workClass: string;
  dependencies: Array<{ from: string; to: string; kind: string; reason: string }>;
  dependencyNotes: string[];
  state: string;
  verification: string | null;
  measurement: {
    what: string;
    source: string | null;
    window: string;
    baseline: string | null;
    status: string;
  };
  status: string;
  evidenceState: string;
  outcomeChain: string[];
}

export interface GoalRoadmap {
  websiteId: string;
  websiteFound: boolean;
  goal: BusinessGoalRow;
  now: RoadmapItemRow[];
  days30: RoadmapItemRow[];
  days60: RoadmapItemRow[];
  days90: RoadmapItemRow[];
  later: RoadmapItemRow[];
  wait: RoadmapItemRow[];
  blocked: RoadmapItemRow[];
  conflicts: Array<{
    goals: string[];
    affectedDecisions: string[];
    tradeoff: string;
    evidence: string;
    resolution: string;
    safeChoice: string | null;
  }>;
  dependencyHealth: {
    edges: number;
    unknownRefs: string[];
    cycles: string[][];
    note: string;
  };
  stability: { note: string };
}

export async function getGrowthGoals(
  websiteId: string,
): Promise<{ goals: BusinessGoalRow[]; note: string }> {
  return request(
    `/growth-plan/${encodeURIComponent(websiteId)}/goals`,
  );
}

export async function getGoalRoadmap(
  websiteId: string,
): Promise<GoalRoadmap> {
  return request(
    `/growth-plan/${encodeURIComponent(websiteId)}/roadmap`,
  );
}

export async function getGoalProgress(
  websiteId: string,
): Promise<{
  websiteId: string;
  goal?: string;
  progress: string;
  progressNote?: string;
  note?: string;
  horizons?: Record<string, number>;
  replan?: {
    lastUpdated: string;
    lastEvidenceChange: string | null;
    nextReview: string | null;
    stale: boolean;
    note: string;
  };
  resources?: string;
}> {
  return request(
    `/growth-plan/${encodeURIComponent(websiteId)}/progress`,
  );
}

export async function getGrowthExecutive(
  websiteId: string,
): Promise<{
  goal: string;
  currentState: string;
  nextThree: string[];
  blocked: string[];
  changed: string[];
  measuring: string[];
}> {
  return request(
    `/growth-plan/${encodeURIComponent(websiteId)}/executive`,
  );
}

/*
 * =========================================================
 * GOVERNED GROWTH WORK QUEUE 1.0 (Phase 36).
 * Operational composition over existing actions. Queue
 * states map existing lifecycle — never a new engine,
 * never auto-execution. Planning is not execution.
 * =========================================================
 */

export interface GrowthWorkItem {
  fingerprint: string;
  actionId: string;
  title: string;
  workType: string;
  status: string;
  section: string;
  priorityBand: string;
  goal: string | null;
  goalAlignment: string | null;
  horizon: string | null;
  owner: string;
  capacity: string;
  approval: string;
  approvalPack: string[] | null;
  clientApproval: string;
  execution: string | null;
  verification: string | null;
  measurement: string | null;
  blocker: string | null;
  blockerNote: string | null;
  dependencies: string[];
  evidence: string[];
  evidenceState: string;
  nextStep: string;
  stale: boolean;
  trace: string[];
}

export interface GrowthQueue {
  websiteId: string;
  websiteFound: boolean;
  today?: GrowthWorkItem[];
  sections?: Record<string, GrowthWorkItem[]>;
  dismissed?: Array<{
    actionId: string;
    title: string;
    status: string;
    reconsideration: string;
    note: string;
  }>;
  counts?: Record<string, number>;
  note?: string;
}

export async function getGrowthQueue(
  websiteId: string,
): Promise<GrowthQueue> {
  return request(
    `/growth-work/${encodeURIComponent(websiteId)}`,
  );
}

export async function getGrowthToday(
  websiteId: string,
): Promise<{
  websiteId: string;
  today: Array<GrowthWorkItem & { todayReason?: string }>;
  why: string;
}> {
  return request(
    `/growth-work/${encodeURIComponent(websiteId)}/today`,
  );
}

export async function getGrowthSection(
  websiteId: string,
  section: string,
): Promise<{ websiteId: string; items: GrowthWorkItem[] }> {
  const valid = ['ready', 'approval', 'blocked', 'verify', 'measure'];
  const seg = valid.includes(section) ? section : 'ready';
  return request(
    `/growth-work/${encodeURIComponent(websiteId)}/${seg}`,
  );
}

export async function getGrowthWorkItem(
  websiteId: string,
  actionId: string,
): Promise<
  GrowthWorkItem & {
    detail: {
      what: string;
      why: string;
      goal: string | null;
      evidence: string[];
      decision: string;
      roadmap: string;
      recommendation: string | null;
      action: string;
      dependency: string[];
      approval: string;
      approvalPack: string[] | null;
      execution: string | null;
      verification: string | null;
      measurement: string | null;
      blocker: string | null;
      nextStep: string;
    };
  }
> {
  return request(
    `/growth-work/${encodeURIComponent(websiteId)}/item/${encodeURIComponent(actionId)}`,
  );
}

export async function refreshGrowthQueue(
  websiteId: string,
): Promise<{
  websiteId: string;
  refreshedAt: string;
  items: number;
  note: string;
}> {
  return request(
    `/growth-work/${encodeURIComponent(websiteId)}/refresh`,
    { method: 'POST' },
  );
}

/*
 * =========================================================
 * SEARCH GROWTH OUTCOME LOOP 1.0 (Phase 37).
 * VERIFICATION → MEASUREMENT → OUTCOME → NEXT DECISION.
 * Evidence states only; no scores, no forecasting,
 * no causal claims. EXECUTION ≠ OUTCOME.
 * =========================================================
 */

export interface ActionOutcome {
  key: string;
  actionId: string;
  title: string;
  actionStatus: string;
  verification: string | null;
  windowDays: number;
  readiness: string;
  readinessNote: string;
  search: {
    rank: {
      before: number | null;
      after: number | null;
      delta: number | null;
      direction: string;
      baseline: string;
      evidenceState: string;
      window: string;
    };
    gsc: string;
    statement: string;
  };
  ai: {
    presence: string;
    presenceNote: string;
    layers: string[];
    citedUrl: string | null;
  };
  agentic: { evidence: string[]; note: string };
  business: {
    leads: {
      before: number | null;
      after: number | null;
      delta: number | null;
      direction: string;
      baseline: string;
      evidenceState: string;
      window: string;
    };
    revenue: {
      before: number | null;
      after: number | null;
      delta: number | null;
      direction: string;
      baseline: string;
      evidenceState: string;
      window: string;
    };
    statement: string;
  };
  signal: string;
  interpretation: string;
  causality: string;
  nextDecision: string;
  nextNote: string;
  hierarchy: string[];
  headline: {
    work: string;
    changed: string;
    unchanged: string;
    unknown: string;
    next: string;
  };
  agency: string[];
}

export async function getActionOutcome(
  websiteId: string,
  actionId: string,
  window = 28,
): Promise<ActionOutcome> {
  return request(
    `/growth-outcomes/${encodeURIComponent(websiteId)}/${encodeURIComponent(actionId)}?window=${window}`,
  );
}

export async function getRecentOutcomes(
  websiteId: string,
): Promise<{
  websiteId: string;
  websiteFound: boolean;
  items: Array<{
    actionId: string;
    title: string;
    signal: string;
    interpretation: string;
    nextDecision: string;
    headline: ActionOutcome['headline'];
  }>;
  note: string;
}> {
  return request(
    `/growth-outcomes/${encodeURIComponent(websiteId)}/recent`,
  );
}

export async function getPendingOutcomes(
  websiteId: string,
): Promise<{
  websiteId: string;
  websiteFound: boolean;
  items: Array<{
    actionId: string;
    title: string;
    readiness: string;
    note: string;
  }>;
  note: string;
}> {
  return request(
    `/growth-outcomes/${encodeURIComponent(websiteId)}/pending`,
  );
}

/*
 * =========================================================
 * SEARCH & AI DECISION GAP INTELLIGENCE 1.0 (Phase 38).
 * WHY WE ARE NOT WINNING from observed evidence only.
 * No scores, no invented authority, no inferred
 * recommendations. Unknowns stay unknown.
 * =========================================================
 */

export interface ObservedGap {
  kind: string;
  orderKind: string;
  fingerprint: string;
  title: string;
  evidence: string[];
  evidenceState: string;
  unknown: string[];
  nextDecision: string;
}

export async function getDecisionGapTargets(
  websiteId: string,
): Promise<{
  websiteId: string;
  targets: Array<{
    fingerprint: string;
    targetType: string;
    target: string;
    page: string | null;
    position: number | null;
    device: string;
    country: string;
    note: string;
  }>;
}> {
  return request(
    `/decision-gap/${encodeURIComponent(websiteId)}/targets`,
  );
}

export async function getDecisionGapQuery(
  websiteId: string,
  query: string,
  opts?: { country?: string; language?: string; page?: string },
): Promise<{
  fingerprint: string;
  targetType: string;
  target: string;
  page: string | null;
  position: number | null;
  positionSource: string;
  intent: string;
  ourAngle: string;
  dominantFormat: string;
  ourFormat: string;
  competitors: Array<{
    domain: string;
    url: string;
    title: string;
    position: number | null;
    resultType: string | null;
  }>;
  gaps: ObservedGap[];
  gapCount: number;
  unknowns: string[];
  conflicts: string[];
  summary: {
    primary: string;
    supporting: string[];
    unknown: string[];
    nextInvestigation: string;
    existingAction: string;
  };
  buyerCriteria: string[];
  customerNeed: { query: string; intent: string; coverage: string };
  technical: {
    title: string | null;
    h1: string[];
    wordCount: number;
    canonical: string | null;
    structuredData: number;
    internalLinks: number;
  } | null;
  nextDecision: string;
  linked: {
    recommendation: { id: string; title: string; status: string } | null;
    action: { id: string; title: string; status: string } | null;
    work: { status: string; section: string } | null;
    outcome: { signal: string; nextDecision: string } | null;
    note: string;
  };
  evidenceNote: string;
}> {
  const q = new URLSearchParams({ query });
  if (opts?.country) q.set('country', opts.country);
  if (opts?.language) q.set('language', opts.language);
  if (opts?.page) q.set('page', opts.page);
  return request(
    `/decision-gap/${encodeURIComponent(websiteId)}/query?${q.toString()}`,
  );
}

export async function getDecisionGapAi(
  websiteId: string,
  prompt: string,
): Promise<{
  fingerprint: string;
  targetType: string;
  target: string;
  state: string;
  recommendation: string;
  checksObserved: number;
  citedUrls: string[];
  competitorNames: string[];
  buyerCriteria: string[];
  gaps: ObservedGap[];
  gapCount: number;
  unknowns: string[];
  conflicts: string[];
  summary: {
    primary: string;
    supporting: string[];
    unknown: string[];
    nextInvestigation: string;
    existingAction: string;
  };
  nextDecision: string;
  linked: unknown;
  evidenceNote: string;
}> {
  return request(
    `/decision-gap/${encodeURIComponent(websiteId)}/ai?prompt=${encodeURIComponent(prompt)}`,
  );
}

export async function getDecisionGapItem(
  websiteId: string,
  type: string,
  target: string,
  competitor?: string,
): Promise<unknown> {
  const q = new URLSearchParams({ type, target });
  if (competitor) q.set('competitor', competitor);
  return request(
    `/decision-gap/${encodeURIComponent(websiteId)}/item?${q.toString()}`,
  );
}

/*
 * =========================================================
 * AI SOURCE & BRAND AUTHORITY INTELLIGENCE 1.0 (Phase 39).
 * Which external sources shape search/AI decisions.
 * Presence is never influence; citation is never
 * recommendation. No scores, no outreach automation.
 * =========================================================
 */

export interface SourceRow {
  fingerprint: string;
  source: string;
  domain: string;
  type: string;
  firstParty: boolean;
  brandPresent: boolean | null;
  competitorPresent: boolean | null;
  presence: string;
  presenceNote: string;
  citationsObserved: number;
  prompts: string[];
  engines: string[];
  urls: string[];
  observedAt: string | null;
  evidenceSource: string;
  trust: string;
  opportunity: string;
}

export interface SourceLandscape {
  websiteId: string;
  totals: {
    sources: number;
    ours: number;
    competitorOnly: number;
    shared: number;
    prompts: number;
    engines: string[];
  };
  ours: SourceRow[];
  competitorOnly: SourceRow[];
  shared: SourceRow[];
  diversity: Array<{ type: string; count: number }>;
  diversityNote: string;
  unknowns: string[];
  note: string;
}

export async function getSourceLandscape(
  websiteId: string,
): Promise<SourceLandscape> {
  return request(
    `/source-intelligence/${encodeURIComponent(websiteId)}/landscape`,
  );
}

export async function getSourceCompetitors(
  websiteId: string,
): Promise<{
  websiteId: string;
  competitors: Array<{
    domain: string;
    sources: number;
    prompts: string[];
    rows: SourceRow[];
    note: string;
  }>;
  unknowns: string[];
}> {
  return request(
    `/source-intelligence/${encodeURIComponent(websiteId)}/competitors`,
  );
}

export async function getSourceAi(
  websiteId: string,
): Promise<{
  websiteId: string;
  prompts: Array<{
    prompt: string;
    engines: string[];
    ourMentioned: boolean;
    ourCited: boolean;
    ourUrls: string[];
    competitorMentioned: boolean;
    competitorNames: string[];
    recommendation: string;
    frequency: string | null;
  }>;
  unknowns: string[];
}> {
  return request(
    `/source-intelligence/${encodeURIComponent(websiteId)}/ai`,
  );
}

export async function getSourceItem(
  websiteId: string,
  domain: string,
): Promise<
  SourceRow & {
    freshness: string;
    freshnessNote: string;
    claimSupport: string;
    buyerCriteria: string[];
    gaps: string[];
    opportunity: string;
    relatedWork: Array<{ id: string; title: string; status: string }>;
    work: { status: string; section: string } | null;
    outcome: { signal: string; interpretation: string } | null;
    agency: string[];
    outreachBan: string;
  }
> {
  return request(
    `/source-intelligence/${encodeURIComponent(websiteId)}/item/${encodeURIComponent(domain)}`,
  );
}

/*
 * =========================================================
 * FIRST-VALUE & ONE-PRODUCT CONSOLIDATION 1.0 (Phase 40).
 * One guided first-run flow: WEBSITE → CRAWL → GSC →
 * PROPERTY → GA4 → PROPERTY → BASELINE → TOP 3 →
 * FIRST_VALUE_READY → Command Center. Skips persist and
 * resurface; FAILED never becomes COMPLETED.
 * =========================================================
 */

export interface FirstValueStep {
  step: string;
  state: string;
  required: boolean;
  why: string;
  next: string | null;
}

export interface FirstValueStatus {
  websiteId: string;
  website: { id: string; name: string; url: string };
  steps: FirstValueStep[];
  progress: { completedRequired: number; totalRequired: number; label: string };
  ready: boolean;
  readyReasons: string[];
  resume: Array<{ step: string; state: string; label: string; action: string }>;
  continueSetup: string | null;
  deadEnd: { dead: boolean; pattern: string | null; recovery: string | null };
  baseline: { ready: boolean; partial: boolean; label: string };
  topActions: Array<{ id: string; title: string; priority: string }>;
  noActionAvailable: string | null;
  unknowns: Array<{ step: string; class: string }>;
}

export async function getFirstValueStatus(
  websiteId: string,
  fresh = false,
): Promise<FirstValueStatus> {
  /* Phase 41 (Group I): fresh=true bypasses the
   * short-lived server baseline cache after explicit
   * actions and manual Refresh. Mounts stay cached. */
  const suffix = fresh ? '?fresh=1' : '';
  return request(
    `/first-value/${encodeURIComponent(websiteId)}/status${suffix}`,
  );
}

export async function recordFirstValueEvent(
  websiteId: string,
  data: { kind?: string; step?: string; status?: string },
): Promise<unknown> {
  return request(
    `/first-value/${encodeURIComponent(websiteId)}/events`,
    { method: 'POST', body: JSON.stringify(data ?? {}) },
  );
}

export async function getFirstValueAcceptance(
  websiteId: string,
): Promise<{
  websiteId: string;
  timeToFirstValueMs: number | null;
  timeToFirstValueLabel: string;
  failures: number;
  blocks: number;
  skips: number;
  resumes: number;
  deadEnds: number;
  unknownRate: { value: number | null; label: string };
  ready: boolean;
  deadEndsDetected: number;
  note: string;
}> {
  return request(
    `/first-value/${encodeURIComponent(websiteId)}/acceptance`,
  );
}

export async function getProviderUsage(): Promise<{
  available: boolean;
  operations?: Array<{
    operation: string;
    calls: number;
    tasks: number;
    failures: number;
    vendorCost: number | null;
    costKnown: boolean;
    costLabel: string;
  }>;
  note: string;
}> {
  return request('/first-value/provider/usage');
}

export async function getDeliveryTruth(): Promise<{
  whiteLabel: string;
  scheduledReports: string;
  pdfExport: string;
  apiAccess: string;
  agencyReporting: string;
  note: string;
}> {
  return request('/first-value/delivery/truth');
}

/* MARKETING SPEND */

export interface MarketingSpend {
  id: string;
  websiteId: string;
  amount: number;
  currency: string;
  source: string;
  campaign?: string | null;
  description?: string | null;
  spendDate: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MarketingSpendListResponse {
  websiteId: string;
  total: number;
  spends: MarketingSpend[];
}

export interface MarketingSpendSummary {
  websiteId: string;
  currency: string;
  totalSpend: number;
  transactions: number;
  averageSpend: number;
}

export async function getMarketingSpend(
  websiteId: string,
): Promise<MarketingSpendListResponse> {
  return request<MarketingSpendListResponse>(
    `/marketing-spend/${encodeURIComponent(websiteId)}`,
  );
}

export async function getMarketingSpendSummary(
  websiteId: string,
): Promise<MarketingSpendSummary> {
  return request<MarketingSpendSummary>(
    `/marketing-spend/${encodeURIComponent(websiteId)}/summary`,
  );
}

export async function createMarketingSpend(
  websiteId: string,
  data: {
    amount: number;
    currency?: string;
    source: string;
    campaign?: string;
    description?: string;
    spendDate?: string;
  },
): Promise<MarketingSpend> {
  return request<MarketingSpend>(
    `/marketing-spend/${encodeURIComponent(websiteId)}`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteMarketingSpend(
  websiteId: string,
  id: string,
): Promise<MarketingSpend> {
  return request<MarketingSpend>(
    `/marketing-spend/${encodeURIComponent(websiteId)}/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

/* MONITORING / WHAT CHANGED */

export interface MonitoringAlert {
  id: string;
  organizationId?: string;
  websiteId: string;
  type: string;
  source: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
  title: string;
  description: string;
  evidence?: Record<string, any> | null;
  detectedAt: string;
  status: 'DETECTED' | 'ACKNOWLEDGED' | 'RESOLVED' | string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  deduplicationKey?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  website?: {
    id: string;
    name: string;
    url: string;
    isActive?: boolean;
  } | null;
}

export interface MonitoringAlertsResponse {
  alerts: MonitoringAlert[];
  total: number;
  limit?: number;
  storageReady?: boolean;
  storageError?: string | null;
}

export interface MonitoringSummary {
  websiteId: string | null;
  total: number;
  unread: number;
  detected: number;
  acknowledged: number;
  resolved: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  storageReady?: boolean;
  storageError?: string | null;
}

export interface MonitoringChange {
  id: string;
  source: string;
  type: string;
  metric: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | string;
  direction: 'NEGATIVE' | 'POSITIVE' | 'NEUTRAL' | string;
  title: string;
  description: string;
  previousValue: number | null;
  currentValue: number | null;
  absoluteChange: number | null;
  pointChange: number | null;
  previousCrawlId: string;
  currentCrawlId: string;
  detectedAt: string;
  why?: string[];
  evidence?: Record<string, any> | null;
  recommendation?: string | null;
  suppressed?: boolean;
  businessNote?: string | null;
}

export interface MonitoringChangesResponse {
  websiteId: string;
  completedCrawls: number;
  oldestCrawlAt: string | null;
  latestCrawlAt: string | null;
  latestScore: number | null;
  notEnoughData: boolean;
  notEnoughDataReason: string | null;
  suppressedNoise: number;
  businessPriority?: string | null;
  changes: MonitoringChange[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    positive: number;
  };
}

export interface BusinessContext {
  website: {
    id: string;
    name: string;
    url: string;
    industry: string | null;
    country: string | null;
  };
  profile: {
    businessName: string | null;
    industry: string | null;
    country: string | null;
    city: string | null;
    description: string | null;
    services: string[];
    products: string[];
    targetAudience: string | null;
    primaryGoal: string | null;
    primaryKeywords: string[];
    targetLocations: string[];
    brandTone: string | null;
    uniqueSellingPoint: string | null;
    businessScore: number;
    lastAnalyzedAt: string | null;
  } | null;
  priorities: {
    primaryGoal: string | null;
    targetAudience: string | null;
    targetLocations: string[];
    primaryKeywords: string[];
  };
  offerings: {
    services: string[];
    products: string[];
  };
  competitors: Array<{
    id: string;
    name: string;
    url: string;
  }>;
  dataAvailability: {
    crawl: boolean;
    competitors: boolean;
    aiVisibility: boolean;
    geo: boolean;
    leads: boolean;
    revenue: boolean;
    recommendations: boolean;
  };
  counts: {
    competitors: number;
    aiChecks: number;
    geoQueries: number;
    leads: number;
    revenues: number;
    openRecommendations: number;
  };
  contextConfidence: number;
  confidenceFormula: string;
  missing: string[];
  generatedAt: string;
}

export async function getBusinessContext(
  websiteId: string,
): Promise<BusinessContext> {
  /*
   * Fetched on every dashboard mount by
   * PersonaHomeStrip. Per-website short cache;
   * brain edits/analysis invalidate it.
   */
  return cachedSessionRead<BusinessContext>(
    `business-context:${websiteId}`,
    () =>
      request<BusinessContext>(
        `/business-brain/${encodeURIComponent(websiteId)}/context`,
      ),
  );
}

export async function getMonitoringSummary(
  websiteId?: string,
): Promise<MonitoringSummary> {
  const query = websiteId
    ? `?websiteId=${encodeURIComponent(websiteId)}`
    : '';
  return request<MonitoringSummary>(
    `/monitoring/alerts/summary${query}`,
  );
}

export async function listMonitoringAlerts(params: {
  websiteId?: string;
  source?: string;
  severity?: string;
  status?: string;
}): Promise<MonitoringAlertsResponse> {
  const search = new URLSearchParams();
  if (params.websiteId) search.set('websiteId', params.websiteId);
  if (params.source) search.set('source', params.source);
  if (params.severity) search.set('severity', params.severity);
  if (params.status) search.set('status', params.status);
  const query = search.toString();
  const response = await request<
    MonitoringAlertsResponse | MonitoringAlert[]
  >(`/monitoring/alerts${query ? `?${query}` : ''}`);
  if (Array.isArray(response)) {
    return { alerts: response, total: response.length };
  }
  return {
    alerts: Array.isArray(response.alerts)
      ? response.alerts
      : [],
    total: response.total ?? 0,
    limit: response.limit,
    storageReady: response.storageReady,
    storageError: response.storageError,
  };
}

export async function acknowledgeMonitoringAlert(
  id: string,
): Promise<MonitoringAlert> {
  return request<MonitoringAlert>(
    `/monitoring/alerts/${encodeURIComponent(id)}/acknowledge`,
    { method: 'PATCH' },
  );
}

export async function resolveMonitoringAlert(
  id: string,
): Promise<MonitoringAlert> {
  return request<MonitoringAlert>(
    `/monitoring/alerts/${encodeURIComponent(id)}/resolve`,
    { method: 'PATCH' },
  );
}

export async function detectMonitoringChanges(
  websiteId: string,
  crawlId?: string,
): Promise<any> {
  return request<any>('/monitoring/detect', {
    method: 'POST',
    body: JSON.stringify(
      crawlId ? { websiteId, crawlId } : { websiteId },
    ),
  });
}

export async function getMonitoringChanges(
  websiteId: string,
): Promise<MonitoringChangesResponse> {
  return request<MonitoringChangesResponse>(
    `/monitoring/changes?websiteId=${encodeURIComponent(websiteId)}`,
  );
}

/*
 * =========================================================
 * DASHBOARD BOOTSTRAP — first-paint payload
 * =========================================================
 *
 * One authenticated request returning the cheap reads
 * every dashboard mount needs (websites + selection,
 * actions summary, competitors, monitoring summary,
 * Google status). Heavy sections (SEO, opportunities,
 * monitoring changes, AI intel, outcome, GSC/GA4 live
 * data, comparison, business context) keep loading
 * separately and progressively.
 */

export interface DashboardBootstrap {
  websites: Website[];
  selectedWebsite: Website | null;
  actionsSummary: {
    high: number;
    medium: number;
    low: number;
    todo: number;
    inProgress: number;
    done: number;
  };
  competitors: Competitor[];
  monitoringSummary: MonitoringSummary | null;
  googleStatus: GoogleConnectionStatus;
  generatedAt: string;
}

export async function getDashboardBootstrap(
  websiteId?: string,
): Promise<DashboardBootstrap> {
  const query = websiteId
    ? `?websiteId=${encodeURIComponent(websiteId)}`
    : '';

  return request<DashboardBootstrap>(
    `/dashboard/bootstrap${query}`,
  );
}
