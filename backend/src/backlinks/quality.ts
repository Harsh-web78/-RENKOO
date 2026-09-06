/*
 * =========================================================
 * DETERMINISTIC LINK QUALITY CLASSIFICATION
 *
 * Uses only persisted fields. No spam probability is
 * inferred: isToxic counts only when explicitly
 * supplied. Domain authority numbers are treated as
 * source-supplied, never measured by RENKOO. Every
 * verdict carries its WHY evidence.
 * =========================================================
 */

export type LinkQuality =
  | 'HIGH_VALUE'
  | 'RELEVANT'
  | 'NEUTRAL'
  | 'LOW_SIGNAL'
  | 'UNKNOWN';

export interface QualityVerdict {
  quality: LinkQuality;
  why: string[];
}

export function classifyQuality(input: {
  linkType?: string | null;
  status?: string | null;
  domainAuthority?: number | null;
  pageAuthority?: number | null;
  isToxic?: boolean | null;
  anchorText?: string | null;
  domainLinkCount?: number | null;
  relevanceHit?: boolean;
}): QualityVerdict {
  const why: string[] = [];
  const linkType = (
    input.linkType ?? 'UNKNOWN'
  ).toUpperCase();
  const status = (
    input.status ?? 'ACTIVE'
  ).toUpperCase();
  const da =
    typeof input.domainAuthority ===
      'number' &&
    Number.isFinite(input.domainAuthority)
      ? input.domainAuthority
      : null;

  if (status !== 'ACTIVE') {
    return {
      quality: 'LOW_SIGNAL',
      why: [
        `Link status is ${status}, so it passes no current value.`,
      ],
    };
  }

  if (input.isToxic === true) {
    return {
      quality: 'LOW_SIGNAL',
      why: [
        'Explicitly flagged toxic in the imported data.',
      ],
    };
  }

  if (
    linkType === 'NOFOLLOW' &&
    da === null
  ) {
    return {
      quality: 'LOW_SIGNAL',
      why: [
        'Nofollow with no supplied authority metric.',
      ],
    };
  }

  const hasMetrics = da !== null;

  if (!hasMetrics) {
    why.push(
      'No authority metric supplied; value cannot be judged.',
    );

    if (linkType === 'DOFOLLOW') {
      why.push('Dofollow, so it may still carry value.');
      return {
        quality: 'RELEVANT',
        why,
      };
    }

    return { quality: 'UNKNOWN', why };
  }

  why.push(
    `Source-supplied domain authority ${da}.`,
  );

  if (linkType === 'DOFOLLOW') {
    why.push('Dofollow.');
  } else {
    why.push(`Link type ${linkType}.`);
  }

  if (
    (input.domainLinkCount ?? 1) > 5
  ) {
    why.push(
      `Same domain links ${input.domainLinkCount} times; marginal value per link.`,
    );
    return {
      quality: 'NEUTRAL',
      why,
    };
  }

  if (
    da >= 50 &&
    linkType === 'DOFOLLOW'
  ) {
    if (input.relevanceHit) {
      why.push(
        'Topical relevance detected from anchor or domain terms.',
      );
    }

    return { quality: 'HIGH_VALUE', why };
  }

  if (
    da >= 20 ||
    input.relevanceHit
  ) {
    if (input.relevanceHit) {
      why.push(
        'Topical relevance detected from anchor or domain terms.',
      );
    }

    return { quality: 'RELEVANT', why };
  }

  return { quality: 'NEUTRAL', why };
}

export function relevanceHit(
  anchorText: string | null | undefined,
  sourceDomain: string,
  websiteUrl: string,
  industry: string | null | undefined,
): boolean {
  const haystack =
    `${anchorText ?? ''} ${sourceDomain}`.toLowerCase();

  const terms = new Set<string>();

  try {
    const host = new URL(
      websiteUrl,
    ).hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .split('.')[0];

    if (host.length > 3) {
      terms.add(host);
    }
  } catch {
    // Unparseable URL contributes no terms.
  }

  for (const word of String(
    industry ?? '',
  )
    .toLowerCase()
    .split(/[^a-z0-9]+/)) {
    if (word.length > 3) {
      terms.add(word);
    }
  }

  for (const term of terms) {
    if (haystack.includes(term)) {
      return true;
    }
  }

  return false;
}
