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
) {
  return request<any>(
    `/backlinks/${encodeURIComponent(websiteId)}/list`,
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






