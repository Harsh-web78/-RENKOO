/*
 * =========================================================
 * REVIEW PROVIDER ABSTRACTION (INTERFACE ONLY)
 *
 * No review source is connected. GBP review access
 * requires business.manage scope + API approval
 * (currently unavailable). This contract lets a
 * future verified source plug in without changing
 * callers. Until then: REVIEWS = NOT_AVAILABLE.
 * =========================================================
 */

export interface LocalReview {
  externalId: string;
  author?: string | null;
  rating?: number | null;
  text?: string | null;
  publishedAt?: Date | null;
  url?: string | null;
}

export interface ReviewSummary {
  count: number;
  averageRating: number | null;
  source: string;
  fetchedAt: string;
}

export interface ReviewProvider {
  readonly id: string;
  readonly displayName: string;

  isConfigured(): boolean;

  fetchReviews(input: {
    organizationId: string;
    locationId: string;
  }): Promise<LocalReview[]>;

  summarize(
    reviews: LocalReview[],
  ): ReviewSummary;
}

export function reviewStatus() {
  return {
    provider: 'REVIEWS',
    status: 'NOT_AVAILABLE' as const,
    connected: false,
    dataAvailable: false,
    limitation:
      'No review source is connected. GBP review access requires the business.manage OAuth scope and Google API approval, which are not configured.',
  };
}
