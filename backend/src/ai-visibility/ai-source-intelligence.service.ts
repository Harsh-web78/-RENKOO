/*
 * =========================================================
 * SOURCE + COMPETITOR INTELLIGENCE 1.0
 * (Phase 6 / Parts 7+8+9+17).
 *
 * Citation gaps, source graph (prompt → answer →
 * citation → URL → domain → topic → competitor),
 * AI competitor radar, and third-party source-type
 * intelligence. Deterministic, evidence-bound: a domain
 * is "frequently cited" only when observations prove
 * it — never "high authority" without authority data.
 * No causality claims.
 * =========================================================
 */

export type CitationClass =
  | 'CUSTOMER_CITED'
  | 'CUSTOMER_MENTIONED_NOT_CITED'
  | 'CUSTOMER_ABSENT'
  | 'COMPETITOR_CITED'
  | 'COMPETITOR_MENTIONED'
  | 'UNKNOWN';

export interface CitationRecord {
  prompt: string;
  topic: string;
  url: string;
  domain: string;
  customerDomain: string | null;
  competitorDomains: string[];
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function classifyCitation(
  record: CitationRecord,
  brandMentioned: boolean,
): CitationClass {
  const domain = (domainOf(record.url) ?? '').toLowerCase();
  const own = (record.customerDomain ?? '').toLowerCase();
  const isOwn =
    !!own &&
    !!domain &&
    (domain === own || domain.endsWith(`.${own}`));
  const isCompetitor =
    !!domain &&
    record.competitorDomains.some((c) => {
      const needle = c
        .toLowerCase()
        .replace(/\s+/g, '');
      return (
        needle &&
        (domain.includes(needle) ||
          needle.includes(domain.split('.')[0]))
      );
    });
  if (isOwn) return 'CUSTOMER_CITED';
  if (isCompetitor) return 'COMPETITOR_CITED';
  if (brandMentioned) return 'CUSTOMER_MENTIONED_NOT_CITED';
  if (!domain) return 'UNKNOWN';
  return 'CUSTOMER_ABSENT';
}

export interface CitationGap {
  kind:
    | 'CITATION_GAP'
    | 'SOURCE_GAP'
    | 'COMPETITOR_SOURCE_GAP'
    | 'TOPIC_CITATION_GAP';
  prompt: string;
  topic: string;
  headline: string;
  customerCited: number;
  customerRelevant: number;
  competitorCited: number;
  evidence: string[];
}

export function buildCitationGaps(input: {
  prompts: Array<{
    prompt: string;
    topic: string;
    brandMentioned: boolean;
    brandCited: boolean;
    competitorCited: boolean;
    relevant: boolean;
  }>;
}): CitationGap[] {
  const gaps: CitationGap[] = [];
  for (const p of input.prompts) {
    if (p.brandMentioned && !p.brandCited) {
      gaps.push({
        kind: 'CITATION_GAP',
        prompt: p.prompt,
        topic: p.topic,
        headline: `Mentioned but not cited for "${p.prompt}".`,
        customerCited: 0,
        customerRelevant: 1,
        competitorCited: p.competitorCited ? 1 : 0,
        evidence: [
          'Brand mentioned across recorded observations; no customer URL cited.',
        ],
      });
    }
    if (p.competitorCited && !p.brandCited) {
      gaps.push({
        kind: 'COMPETITOR_SOURCE_GAP',
        prompt: p.prompt,
        topic: p.topic,
        headline: `Competitor source cited for "${p.prompt}" while your site was not.`,
        customerCited: 0,
        customerRelevant: p.relevant ? 1 : 0,
        competitorCited: 1,
        evidence: [
          'Competitor domain present in cited sources; customer domain absent.',
        ],
      });
    }
  }
  return gaps;
}

/* ---------- source graph ---------- */

export interface SourceNode {
  domain: string;
  urls: string[];
  prompts: string[];
  topics: string[];
  frequency: number;
  customerOwned: boolean;
  competitorOwned: boolean;
  label: 'frequently cited source' | 'cited source';
}

export function buildSourceGraph(
  records: CitationRecord[],
): SourceNode[] {
  const byDomain = new Map<string, SourceNode>();
  for (const r of records) {
    const domain = domainOf(r.url);
    if (!domain) continue;
    const node = byDomain.get(domain) ?? {
      domain,
      urls: [],
      prompts: [],
      topics: [],
      frequency: 0,
      customerOwned: false,
      competitorOwned: false,
      label: 'cited source' as const,
    };
    if (!node.urls.includes(r.url))
      node.urls.push(r.url);
    if (!node.prompts.includes(r.prompt))
      node.prompts.push(r.prompt);
    if (
      r.topic &&
      !node.topics.includes(r.topic)
    )
      node.topics.push(r.topic);
    node.frequency += 1;
    const own = (r.customerDomain ?? '').toLowerCase();
    if (
      own &&
      (domain === own ||
        domain.endsWith(`.${own}`))
    )
      node.customerOwned = true;
    if (
      r.competitorDomains.some((c) =>
        domain.includes(
          c.toLowerCase().replace(/\s+/g, ''),
        ),
      )
    )
      node.competitorOwned = true;
    byDomain.set(domain, node);
  }
  return [...byDomain.values()]
    .map((n) => ({
      ...n,
      label: (n.frequency >= 3
        ? 'frequently cited source'
        : 'cited source') as SourceNode['label'],
    }))
    .sort((a, b) => b.frequency - a.frequency);
}

/* ---------- competitor radar ---------- */

export interface CompetitorRadarRow {
  competitor: string;
  promptsAppeared: number;
  promptsCited: number;
  promptsTotal: number;
  where: string[];
  sources: string[];
  topics: string[];
}

export function buildCompetitorRadar(input: {
  promptsTotal: number;
  observations: Array<{
    prompt: string;
    topic: string;
    competitor: string;
    mentioned: boolean;
    cited: boolean;
    sourceDomain: string | null;
  }>;
}): CompetitorRadarRow[] {
  const byCompetitor = new Map<
    string,
    CompetitorRadarRow
  >();
  for (const o of input.observations) {
    const key = o.competitor.trim();
    if (!key) continue;
    const row = byCompetitor.get(key) ?? {
      competitor: key,
      promptsAppeared: 0,
      promptsCited: 0,
      promptsTotal: input.promptsTotal,
      where: [],
      sources: [],
      topics: [],
    };
    if (o.mentioned) {
      row.promptsAppeared += 1;
      if (!row.where.includes(o.prompt))
        row.where.push(o.prompt);
    }
    if (o.cited) {
      row.promptsCited += 1;
      if (
        o.sourceDomain &&
        !row.sources.includes(o.sourceDomain)
      )
        row.sources.push(o.sourceDomain);
    }
    if (o.topic && !row.topics.includes(o.topic))
      row.topics.push(o.topic);
    byCompetitor.set(key, row);
  }
  return [...byCompetitor.values()].sort(
    (a, b) => b.promptsAppeared - a.promptsAppeared,
  );
}

/* ---------- third-party source types ---------- */

const SOURCE_TYPE_RULES: Array<{
  type: string;
  patterns: RegExp[];
}> = [
  { type: 'REDDIT', patterns: [/reddit\.com/] },
  {
    type: 'YOUTUBE',
    patterns: [/youtube\.com/, /youtu\.be/],
  },
  {
    type: 'NEWS',
    patterns: [/news\./, /bbc\./, /cnn\./, /reuters\./],
  },
  {
    type: 'REVIEW',
    patterns: [/g2\.com/, /capterra/, /trustpilot/, /reviews/],
  },
  {
    type: 'DIRECTORY',
    patterns: [/yelp\./, /yellowpages/, /directory/],
  },
  {
    type: 'INDUSTRY_PUBLICATION',
    patterns: [/blog\./, /journal/, /insights?\./],
  },
  {
    type: 'COMPARISON_SITE',
    patterns: [/compare/, /versus/, /vs\./],
  },
  {
    type: 'DOCUMENTATION',
    patterns: [/docs\./, /support\./, /help\./, /developer\./],
  },
  {
    type: 'COMMUNITY',
    patterns: [/community\./, /forum/, /stackoverflow/, /quora/],
  },
];

export function sourceTypeOf(
  domainOrUrl: string,
): string {
  const v = domainOrUrl.toLowerCase();
  for (const rule of SOURCE_TYPE_RULES) {
    if (rule.patterns.some((re) => re.test(v)))
      return rule.type;
  }
  return 'FIRST_PARTY_OR_OTHER';
}

export function summarizeSourceTypes(
  domains: string[],
): Array<{
  type: string;
  domains: string[];
  frequency: number;
  note: string;
}> {
  const byType = new Map<string, Set<string>>();
  for (const d of domains) {
    const type = sourceTypeOf(d);
    const set = byType.get(type) ?? new Set<string>();
    set.add(d);
    byType.set(type, set);
  }
  return [...byType.entries()]
    .map(([type, set]) => ({
      type,
      domains: [...set].sort(),
      frequency: set.size,
      note: `These ${type.toLowerCase().replace(/_/g, ' ')} source types are repeatedly cited for your topic. Influence is not claimed — presence only.`,
    }))
    .sort((a, b) => b.frequency - a.frequency);
}
