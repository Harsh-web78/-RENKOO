/*
 * =========================================================
 * SERP PROVIDER ABSTRACTION (INTERFACE ONLY)
 *
 * No SERP/search provider is connected. Briefs and
 * analysis must state SERP_DATA = NOT_AVAILABLE and
 * work from GSC, Business Brain and competitor
 * evidence instead. A future verified provider
 * implements SerpProvider without changing callers.
 * Never generate fake top-10s, PAA, snippets,
 * volumes or difficulty scores.
 * =========================================================
 */

export interface SerpResult {
  position: number;
  url: string;
  title?: string | null;
  domain: string;
}

export interface SerpObservation {
  query: string;
  results: SerpResult[];
  peopleAlsoAsk: string[];
  source: string;
  fetchedAt: string;
}

export interface SerpProvider {
  readonly id: string;
  readonly displayName: string;

  isConfigured(): boolean;

  fetchSerp(query: string): Promise<SerpObservation>;
}

export function serpStatus() {
  return {
    provider: 'SERP',
    status: 'NOT_AVAILABLE' as const,
    connected: false,
    dataAvailable: false,
    limitation:
      'No SERP provider is connected. Briefs use GSC, Business Brain and tracked-competitor evidence only. Search volume and keyword difficulty are unavailable.',
  };
}
