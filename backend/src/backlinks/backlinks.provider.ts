/*
 * =========================================================
 * BACKLINK PROVIDER ABSTRACTION (INTERFACE ONLY)
 *
 * No backlink data provider is connected. Inventory
 * rows arrive via manual import (labeled
 * MANUAL_IMPORT) or a future verified provider that
 * implements BacklinkProvider without changing
 * callers. Never fabricate counts, domains,
 * authority or traffic. Do not scrape third-party
 * platforms improperly.
 * =========================================================
 */

export interface ProviderBacklink {
  sourceUrl: string;
  targetUrl: string;
  sourceDomain: string;
  anchorText?: string | null;
  linkType?: string | null;
  status?: string | null;
  domainAuthority?: number | null;
  pageAuthority?: number | null;
  isToxic?: boolean | null;
  firstSeenAt?: Date | null;
  lastSeenAt?: Date | null;
}

export interface BacklinkProvider {
  readonly id: string;
  readonly displayName: string;

  isConfigured(): boolean;

  fetchBacklinks(input: {
    organizationId: string;
    websiteId: string;
  }): Promise<ProviderBacklink[]>;
}

export function backlinkProviderStatus() {
  return {
    provider: 'BACKLINKS',
    status: 'NOT_AVAILABLE' as const,
    connected: false,
    dataAvailable: false,
    limitation:
      'No backlink data provider is connected. Inventory rows come from manual import only and carry their supplied source label.',
  };
}
