/*
 * =========================================================
 * KEYWORD DATA PROVIDER ABSTRACTION
 *
 * RENKOO must never be permanently coupled to one keyword
 * data vendor, and must never fabricate metrics. Every
 * metric carries its source + availability so the UI can
 * render "— Not available" instead of inventing numbers.
 *
 * Providers (Sep 2026):
 * - SITE_CORPUS  : real, from RENKOO crawls (titles, meta,
 *                  H1/H2, word counts) via Prisma.
 * - COMPETITOR_CORPUS : real, from competitor crawls.
 * - GSC          : real, owned by GoogleService (queried
 *                  separately; joined client-side or via
 *                  /google/* endpoints).
 * - DATAFORSEO   : real third-party provider (Keywords Data
 *                  + Labs + SERP APIs) when DATAFORSEO_LOGIN
 *                  and DATAFORSEO_PASSWORD are set. Supplies
 *                  ideas, volume, KD, CPC, competition,
 *                  12-month history, intent, competitor ranking
 *                  keywords and live SERP. Traffic Potential
 *                  stays unavailable: no per-keyword ETV source
 *                  is in the current provider plan.
 *
 * To add another vendor: implement KeywordDataProvider,
 * register it in providerCapabilities() and flip the
 * capability flags. Callers do not change.
 * =========================================================
 */

export type MetricAvailability =
  | 'AVAILABLE'
  | 'NOT_AVAILABLE';

export interface MetricSource {
  metric:
    | 'volume'
    | 'keywordDifficulty'
    | 'cpc'
    | 'trafficPotential'
    | 'trend'
    | 'serp'
    | 'serpFeatures'
    | 'pageStrength'
    | 'serpClustering'
    | 'competitorKeywords'
    | 'siteCoverage'
    | 'gscPerformance';
  availability: MetricAvailability;
  provider: string;
  reason: string;
  updatedAt: string | null;
}

export interface ProviderCapabilities {
  keywordIdeas: boolean;
  volume: boolean;
  keywordDifficulty: boolean;
  cpc: boolean;
  trend: boolean;
  serp: boolean;
  serpFeatures: boolean;
  pageStrength: boolean;
  serpClustering: boolean;
  competitorKeywords: boolean;
  trafficPotential: boolean;
}

/* =========================================================
 * NORMALIZED RENKOO MODELS (provider-agnostic)
 *
 * Every metric carries dataSource + lastUpdated. Missing
 * values are null — never zero, never invented.
 * =========================================================
 */

export type ProviderIntent =
  | 'informational'
  | 'navigational'
  | 'commercial'
  | 'transactional';

export interface MonthlyPoint {
  year: number;
  month: number;
  searchVolume: number | null;
}

export interface TrendSignal {
  direction:
    | 'rising'
    | 'stable'
    | 'declining'
    | 'seasonal'
    | 'insufficient';
  /* Documented rule: last-3-month mean vs first-3-month
     mean over trailing 12 months; ±20% thresholds;
     seasonal requires CV > 0.35 with a repeating peak
     quarter and at least 12 months of history. */
  detail: string;
}

export interface NormalizedKeywordMetrics {
  keyword: string;
  country: string;
  language: string;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  cpc: number | null;
  competition: number | null;
  competitionLevel: string | null;
  monthlySearches: MonthlyPoint[];
  trend: TrendSignal | null;
  providerIntent: ProviderIntent | null;
  serpFeatures: string[];
  dataSource: string;
  lastUpdated: string | null;
}

export interface NormalizedKeywordIdea {
  keyword: string;
  source:
    | 'suggestion'
    | 'related'
    | 'idea'
    | 'for_site'
    | 'for_keywords';
  metrics: NormalizedKeywordMetrics | null;
}

export type SerpPageStrength =
  | 'Strong'
  | 'Medium'
  | 'Weak'
  | 'Unknown';

export interface NormalizedSerpResult {
  position: number | null;
  url: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  resultType: string;
  isOrganic: boolean;
  isPaid: boolean;
  /* RENKOO content-type classification from URL + title
     signals — rule-based, never a content audit. */
  contentType: string;
  /* Authority signals from bulk rank data. Null means
     unavailable for this result — never zero. */
  domainRank: number | null;
  pageRank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  estimatedTraffic: number | null;
  pageStrength: SerpPageStrength;
  strengthEvidence: string[];
}

export interface NormalizedSerpFeature {
  type: string;
  title: string | null;
  count: number;
}

export interface NormalizedSerpObservation {
  keyword: string;
  country: string;
  language: string;
  results: NormalizedSerpResult[];
  features: NormalizedSerpFeature[];
  totalResults: number | null;
  dataSource: string;
  fetchedAt: string;
  /* Present once page-strength enrichment ran. Nulls
     inside mean that signal was unavailable. */
  competition: SerpCompetition | null;
  intentCheck: SerpIntentCheck | null;
  featureOpportunities: SerpFeatureOpportunity[];
  aiPresence: AiPresence | null;
}

export interface SerpCompetition {
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
}

export interface SerpIntentCheck {
  check: 'MATCH' | 'MIXED' | 'MISMATCH' | 'UNKNOWN';
  keywordIntent: string;
  intentSource: 'PROVIDER' | 'RENKOO';
  detail: string;
}

export interface SerpFeatureOpportunity {
  type: string;
  opportunity: string;
}

export interface AiPresence {
  /* True only when the provider returned an AI element
     for this SERP — never inferred. */
  detected: boolean;
  elementTypes: string[];
  referencedDomains: string[];
  detail: string;
}

export interface PageStrengthRow {
  url: string;
  domain: string;
  pageRank: number | null;
  domainRank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  domainTraffic: number | null;
  dataSource: string;
  fetchedAt: string;
}

export interface NormalizedCompetitorKeyword {
  keyword: string;
  position: number | null;
  searchVolume: number | null;
  keywordDifficulty: number | null;
  estimatedTraffic: number | null;
  providerIntent: ProviderIntent | null;
  rankingUrl: string | null;
  dataSource: string;
  lastUpdated: string | null;
}

export interface ProviderContext {
  country: string;
  language: string;
  locationCode: number;
  locationFallback: boolean;
}

/*
 * A verified vendor implements this. Volume/KD/CPC must
 * come from a real provider — never volume * random.
 */
export interface KeywordDataProvider {
  readonly id: string;
  readonly displayName: string;

  isConfigured(): boolean;

  capabilities(): ProviderCapabilities;

  resolveContext(
    country?: string,
    language?: string,
  ): ProviderContext;

  /* All optional: throw or return null when unsupported. */
  fetchIdeas?(
    seed: string,
    ctx: ProviderContext,
    limit?: number,
  ): Promise<NormalizedKeywordIdea[]>;

  fetchMetrics?(
    keywords: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, NormalizedKeywordMetrics>>;

  fetchDifficulty?(
    keywords: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, number | null>>;

  fetchIntent?(
    keywords: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, ProviderIntent | null>>;

  fetchHistory?(
    keywords: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, MonthlyPoint[]>>;

  fetchSerp?(
    keyword: string,
    ctx: ProviderContext,
  ): Promise<NormalizedSerpObservation>;

  fetchCompetitorKeywords?(
    domain: string,
    ctx: ProviderContext,
    limit?: number,
  ): Promise<NormalizedCompetitorKeyword[]>;

  /* Bulk page/domain authority for SERP results. Keys
     are normalized URLs plus `domain:<host>` entries. */
  fetchPageStrength?(
    urls: string[],
    ctx: ProviderContext,
  ): Promise<Map<string, PageStrengthRow>>;

  /* Legacy string-only surface (kept for callers that
     only need candidates). */
  fetchIdeaStrings?(
    seed: string,
    country?: string,
  ): Promise<string[]>;
}

export function isDataForSeoConfigured(): boolean {
  return Boolean(
    (process.env.DATAFORSEO_LOGIN ?? '').trim() &&
      (process.env.DATAFORSEO_PASSWORD ?? '').trim(),
  );
}

export function dataForSeoCapabilities(): ProviderCapabilities {
  return {
    keywordIdeas: true,
    volume: true,
    keywordDifficulty: true,
    cpc: true,
    trend: true,
    serp: true,
    serpFeatures: true,
    pageStrength: true,
    serpClustering: true,
    competitorKeywords: true,
    /* No per-keyword ETV in the current provider plan —
       Traffic Potential stays honestly unavailable. */
    trafficPotential: false,
  };
}

export function providerCapabilities(): {
  providers: Array<{
    id: string;
    displayName: string;
    configured: boolean;
    capabilities: ProviderCapabilities;
  }>;
  metrics: MetricSource[];
} {
  const dfsConfigured = isDataForSeoConfigured();
  const metric = (
    name: MetricSource['metric'],
    available: MetricSource['availability'],
    provider: string,
    reason: string,
  ): MetricSource => ({
    metric: name,
    availability: available,
    provider,
    reason,
    updatedAt: null,
  });

  return {
    providers: [
      {
        id: 'DATAFORSEO',
        displayName: 'DataForSEO (Keywords Data + Labs + SERP)',
        configured: dfsConfigured,
        capabilities: dataForSeoCapabilities(),
      },
      {
        id: 'SITE_CORPUS',
        displayName:
          'RENKOO site crawl corpus',
        configured: true,
        capabilities: {
          keywordIdeas: true,
          volume: false,
          keywordDifficulty: false,
          cpc: false,
          trend: false,
          serp: false,
          serpFeatures: false,
          pageStrength: false,
          serpClustering: false,
          competitorKeywords: false,
          trafficPotential: false,
        },
      },
      {
        id: 'COMPETITOR_CORPUS',
        displayName:
          'RENKOO competitor crawl corpus',
        configured: true,
        capabilities: {
          keywordIdeas: true,
          volume: false,
          keywordDifficulty: false,
          cpc: false,
          trend: false,
          serp: false,
          serpFeatures: false,
          pageStrength: false,
          serpClustering: false,
          competitorKeywords: true,
          trafficPotential: false,
        },
      },
      {
        id: 'GSC',
        displayName:
          'Google Search Console',
        configured: true,
        capabilities: {
          keywordIdeas: false,
          volume: false,
          keywordDifficulty: false,
          cpc: false,
          trend: false,
          serp: false,
          serpFeatures: false,
          pageStrength: false,
          serpClustering: false,
          competitorKeywords: false,
          trafficPotential: false,
        },
      },
    ],
    metrics: [
      {
        metric: 'siteCoverage',
        availability: 'AVAILABLE',
        provider: 'SITE_CORPUS',
        reason:
          'Measured from the latest completed RENKOO crawl of the selected website.',
        updatedAt: null,
      },
      {
        metric: 'competitorKeywords',
        availability: 'AVAILABLE',
        provider: 'COMPETITOR_CORPUS',
        reason:
          'Measured from completed competitor crawls for the selected website.',
        updatedAt: null,
      },
      {
        metric: 'gscPerformance',
        availability: 'AVAILABLE',
        provider: 'GSC',
        reason:
          'Observed clicks, impressions, CTR and position from the connected Search Console property.',
        updatedAt: null,
      },
      dfsConfigured
        ? metric(
            'volume',
            'AVAILABLE',
            'DATAFORSEO',
            'Google Ads search volume via DataForSEO for the selected country/language.',
          )
        : metric(
            'volume',
            'NOT_AVAILABLE',
            'NONE',
            'No search-volume provider is connected. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable search volume.',
          ),
      dfsConfigured
        ? metric(
            'keywordDifficulty',
            'AVAILABLE',
            'DATAFORSEO',
            'DataForSEO Labs 0–100 difficulty: relative difficulty of ranking in the top 10 for this query.',
          )
        : metric(
            'keywordDifficulty',
            'NOT_AVAILABLE',
            'NONE',
            'No keyword-difficulty provider is connected. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable KD.',
          ),
      dfsConfigured
        ? metric(
            'cpc',
            'AVAILABLE',
            'DATAFORSEO',
            'Google Ads average cost-per-click via DataForSEO for the selected country/language.',
          )
        : metric(
            'cpc',
            'NOT_AVAILABLE',
            'NONE',
            'No ads-data provider is connected. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable CPC.',
          ),
      metric(
        'trafficPotential',
        'NOT_AVAILABLE',
        'NONE',
        dfsConfigured
          ? 'Traffic Potential needs per-keyword clickstream/ETV data, which is not in the current provider plan. Search volume is the demand ceiling shown instead.'
          : 'Traffic Potential requires provider SERP/ranking data. It is unavailable until a SERP provider is connected.',
      ),
      dfsConfigured
        ? metric(
            'trend',
            'AVAILABLE',
            'DATAFORSEO',
            'Trailing 12-month monthly search history via DataForSEO for the selected country/language.',
          )
        : metric(
            'trend',
            'NOT_AVAILABLE',
            'NONE',
            'No trend provider is connected. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable trend.',
          ),
      dfsConfigured
        ? metric(
            'serp',
            'AVAILABLE',
            'DATAFORSEO',
            'Live Google SERP via DataForSEO for the selected country/language. Fetched on demand per keyword.',
          )
        : metric(
            'serp',
            'NOT_AVAILABLE',
            'NONE',
            'No SERP provider is connected. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable SERP intelligence.',
          ),
      dfsConfigured
        ? metric(
            'serpFeatures',
            'AVAILABLE',
            'DATAFORSEO',
            'SERP feature presence (featured snippet, PAA, local pack, video, images, shopping, news) from live DataForSEO SERP data.',
          )
        : metric(
            'serpFeatures',
            'NOT_AVAILABLE',
            'NONE',
            'No SERP provider is connected. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable SERP features.',
          ),
      dfsConfigured
        ? metric(
            'pageStrength',
            'AVAILABLE',
            'DATAFORSEO',
            'Page/domain authority for ranking URLs from DataForSEO bulk rank + traffic data. Backlinks and referring domains are returned only where the provider reports them — otherwise null, never zero.',
          )
        : metric(
            'pageStrength',
            'NOT_AVAILABLE',
            'NONE',
            'No authority-data provider is connected. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD to enable page strength.',
          ),
      dfsConfigured
        ? metric(
            'serpClustering',
            'AVAILABLE',
            'DATAFORSEO',
            'SERP-overlap clustering from cached-or-fresh live SERPs, sampled to protect cost. Falls back to RENKOO semantic grouping when SERP data is unavailable.',
          )
        : metric(
            'serpClustering',
            'NOT_AVAILABLE',
            'NONE',
            'SERP-similarity clustering needs a SERP provider. RENKOO semantic fallback is used instead.',
          ),
    ],
  };
}
