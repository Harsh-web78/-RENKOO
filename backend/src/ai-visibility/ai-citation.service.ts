import { Injectable } from '@nestjs/common';

import {
  classifyCitationDomain,
  type CitationDomainClass,
} from './analysis';

/*
 * =========================================================
 * AI CITATION INTELLIGENCE 1.0 (Phase 6 / Phase 4).
 *
 * Deterministic extraction + classification over RECORDED
 * answer text only. Never claims a citation that is not
 * in the text; never claims causality between citation
 * and ranking; never presents extracted links as
 * provider-verified (provider-native citations travel
 * in ProviderCitation[]; everything here is INFERRED).
 *
 * Relationship vocabulary:
 *   CITED               — own domain URL present in text
 *   MENTIONED_NOT_CITED — brand matched, no own URL
 *   NOT_MENTIONED       — neither brand nor own URL
 *   UNKNOWN             — no usable text / failed check
 * =========================================================
 */

export type AiCitationRelationship =
  | 'CITED'
  | 'MENTIONED_NOT_CITED'
  | 'NOT_MENTIONED'
  | 'UNKNOWN';

export type AiEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'UNAVAILABLE';

export interface ExtractedAiCitation {
  url: string;
  domain: string;
  class: CitationDomainClass;
  evidenceState: AiEvidenceState;
}

export interface AiCitationSummary {
  relationship: AiCitationRelationship;
  citations: ExtractedAiCitation[];
  citedUrls: string[];
  citedDomains: string[];
  ownCited: boolean;
  competitorCited: string[];
  evidenceState: AiEvidenceState;
}

export const MAX_CITATIONS_PER_ANSWER = 50;
const MAX_URL_LENGTH = 2000;

const MARKDOWN_LINK_PATTERN =
  /\[[^\]]{0,300}\]\((https?:\/\/[^)\s]{1,2000})\)/g;

const BARE_URL_PATTERN =
  /(?<![("'=\w/])https?:\/\/[^\s)"'\]<>,;]{4,2000}(?![\w/])/g;

function cleanUrl(raw: string): string | null {
  let value = String(raw ?? '').trim();

  if (!value) {
    return null;
  }

  /* Strip trailing sentence punctuation. */
  value = value.replace(/[.,;:!?]+$/, '');

  if (value.length > MAX_URL_LENGTH) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== 'http:' &&
    parsed.protocol !== 'https:'
  ) {
    return null;
  }

  return parsed.toString();
}

/*
 * Extract http(s) URLs from markdown links and bare
 * URLs in answer text. Bounded + deduplicated, source
 * order preserved. Empty text yields no citations
 * (UNKNOWN is decided by the caller, which knows
 * whether the check itself failed).
 */
export function extractCitedUrls(
  text: unknown,
): string[] {
  const source = String(text ?? '');

  if (!source) {
    return [];
  }

  const out: string[] = [];
  const seen = new Set<string>();

  const collect = (raw: string): void => {
    if (out.length >= MAX_CITATIONS_PER_ANSWER) {
      return;
    }

    const cleaned = cleanUrl(raw);

    if (!cleaned || seen.has(cleaned)) {
      return;
    }

    seen.add(cleaned);
    out.push(cleaned);
  };

  MARKDOWN_LINK_PATTERN.lastIndex = 0;
  let markdownMatch: RegExpExecArray | null;

  while (
    (markdownMatch =
      MARKDOWN_LINK_PATTERN.exec(source)) !== null
  ) {
    collect(markdownMatch[1]);

    if (out.length >= MAX_CITATIONS_PER_ANSWER) {
      return out;
    }
  }

  BARE_URL_PATTERN.lastIndex = 0;
  let bareMatch: RegExpExecArray | null;

  while (
    (bareMatch = BARE_URL_PATTERN.exec(source)) !==
    null
  ) {
    collect(bareMatch[0]);

    if (out.length >= MAX_CITATIONS_PER_ANSWER) {
      return out;
    }
  }

  return out;
}

export function extractCitationDomains(
  urls: string[],
): string[] {
  const domains: string[] = [];
  const seen = new Set<string>();

  for (const raw of urls) {
    try {
      const host = new URL(raw).hostname
        .toLowerCase()
        .replace(/^www\./, '');

      if (host && !seen.has(host)) {
        seen.add(host);
        domains.push(host);
      }
    } catch {
      continue;
    }
  }

  return domains;
}

function hostMatchesDomain(
  host: string,
  domain: string,
): boolean {
  const cleanHost = host
    .toLowerCase()
    .replace(/^www\./, '');
  const cleanDomain = domain
    .toLowerCase()
    .replace(/^www\./, '');

  return (
    !!cleanDomain &&
    (cleanHost === cleanDomain ||
      cleanHost.endsWith(`.${cleanDomain}`))
  );
}

export function classifyCitationRelationship(params: {
  usableText: boolean;
  brandMentioned: boolean;
  ownCited: boolean;
}): AiCitationRelationship {
  if (!params.usableText) {
    return 'UNKNOWN';
  }

  if (params.ownCited) {
    return 'CITED';
  }

  if (params.brandMentioned) {
    return 'MENTIONED_NOT_CITED';
  }

  return 'NOT_MENTIONED';
}

/*
 * Full per-observation citation summary. Reuses
 * classifyCitationDomain (single source for domain
 * classes) and analyzeAiResponse-style mention flags
 * supplied by the caller (no text scanning here
 * beyond URL extraction).
 */
export function summarizeAiCitations(params: {
  answerText: unknown;
  brandMentioned: boolean;
  checkFailed?: boolean;
  ownDomains?: string[];
  competitorDomains?: string[];
}): AiCitationSummary {
  const text = String(params.answerText ?? '');
  const failed = params.checkFailed === true;
  const usableText = !failed && text.length > 0;

  const ownDomains = Array.isArray(params.ownDomains)
    ? params.ownDomains.filter(Boolean)
    : [];
  const competitorDomains = Array.isArray(
    params.competitorDomains,
  )
    ? params.competitorDomains.filter(Boolean)
    : [];

  if (!usableText) {
    return {
      relationship: 'UNKNOWN',
      citations: [],
      citedUrls: [],
      citedDomains: [],
      ownCited: false,
      competitorCited: [],
      evidenceState: 'UNAVAILABLE',
    };
  }

  const urls = extractCitedUrls(text);

  const citations: ExtractedAiCitation[] = urls.map(
    (url) => {
      const classified = classifyCitationDomain({
        url,
        ownDomains,
        competitorDomains,
      });

      return {
        url,
        domain: classified.domain,
        class: classified.class,
        evidenceState: 'INFERRED' as AiEvidenceState,
      };
    },
  );

  const citedDomains = extractCitationDomains(urls);
  const ownCited = citations.some(
    (item) => item.class === 'OWN_DOMAIN',
  );

  const competitorCited = Array.from(
    new Set(
      citations
        .filter(
          (item) =>
            item.class === 'COMPETITOR_DOMAIN',
        )
        .map((item) => item.domain),
    ),
  );

  const relationship = classifyCitationRelationship({
    usableText,
    brandMentioned: params.brandMentioned,
    ownCited,
  });

  return {
    relationship,
    citations,
    citedUrls: urls,
    citedDomains,
    ownCited,
    competitorCited,
    evidenceState:
      urls.length > 0 ? 'OBSERVED' : 'INFERRED',
  };
}

/*
 * Citation overlap across prompts: which source
 * domains recur (competitor source intelligence).
 * Pure count over extracted domains — no ranking
 * claims, no causality.
 */
export function overlapCitedDomains(
  perPromptDomains: string[][],
): Array<{ domain: string; prompts: number }> {
  const counts = new Map<string, number>();

  for (const domains of perPromptDomains) {
    for (const domain of new Set(domains)) {
      counts.set(
        domain,
        (counts.get(domain) ?? 0) + 1,
      );
    }
  }

  return Array.from(counts.entries())
    .map(([domain, prompts]) => ({ domain, prompts }))
    .sort(
      (left, right) =>
        right.prompts - left.prompts ||
        left.domain.localeCompare(right.domain),
    );
}

@Injectable()
export class AiCitationService {
  extractUrls(text: unknown): string[] {
    return extractCitedUrls(text);
  }

  summarize(params: {
    answerText: unknown;
    brandMentioned: boolean;
    checkFailed?: boolean;
    ownDomains?: string[];
    competitorDomains?: string[];
  }): AiCitationSummary {
    return summarizeAiCitations(params);
  }
}
