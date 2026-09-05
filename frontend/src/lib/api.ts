const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

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
  ctr: number;
  averagePosition: number;

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
}

/*
 * =========================================================
 * GENERIC API REQUEST
 * =========================================================
 */

async function request<T>(
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

    throw new Error(errorMessage);
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
  return request<User>('/auth/me');
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
 * =========================================================
 * WEBSITES
 * =========================================================
 */

export async function getWebsites() {
  return request<Website[]>('/websites');
}

export async function createWebsite(
  data: {
    name: string;
    url: string;
    industry?: string;
    country?: string;
  },
) {
  return request<Website>(
    '/websites',
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
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
  return request<Website>(
    `/websites/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function deleteWebsite(
  id: string,
) {
  return request(
    `/websites/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  );
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
  return request<GoogleConnectionStatus>(
    '/google/status',
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
  return request('/google/disconnect', {
    method: 'POST',
  });
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

export async function connectGoogle() {
  return request<{
    authorizationUrl: string;
  }>('/google/connect');
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
  return request<GoogleConnection>(
    `/google/select-property?siteUrl=${encodeURIComponent(siteUrl)}`,
  );
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
  return request<ActionsResponse>('/actions');
}

export async function updateActionStatus(
  actionId: string,
  status: RenkooAction['status'],
): Promise<RenkooAction> {
  return request<RenkooAction>(
    `/actions/${encodeURIComponent(actionId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
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
  return request<RenkooAction>('/actions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
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
}

export interface BillingEntitlements {
  planCode: string;
  planName: string;
  tier: string;
  status: string;
  isFree: boolean;
  customPricing: boolean;
  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  limits: Record<string, number>;
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
      limit: number;
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
  return request<GoogleConnection>(
    `/google/analytics/select-property?propertyId=${encodeURIComponent(propertyId)}`,
  );
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
  return request<BusinessBrain>(
    `/business-brain/${encodeURIComponent(websiteId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );
}

export async function analyzeBusinessBrain(
  websiteId: string,
) {
  return request<any>(
    `/business-brain/${encodeURIComponent(websiteId)}/analyze`,
    { method: 'POST' },
  );
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
  return request<RenkooAction>(
    `/recommendations/${encodeURIComponent(recommendationId)}/action`,
    { method: 'POST' },
  );
}

/* COMPETITORS */

export async function getCompetitors() {
  return request<Competitor[]>('/competitors');
}

export async function createCompetitor(data: {
  name: string;
  url: string;
  websiteId: string;
}) {
  return request<Competitor>('/competitors', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteCompetitor(id: string) {
  return request(
    `/competitors/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
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
  return request<CurrentAccount>('/auth/me');
}

export async function updateProfile(name: string) {
  return request<CurrentAccount['user']>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
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
  return request<BusinessContext>(
    `/business-brain/${encodeURIComponent(websiteId)}/context`,
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
