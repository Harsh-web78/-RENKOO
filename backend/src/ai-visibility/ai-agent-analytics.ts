/*
 * =========================================================
 * AI CRAWLER + AGENT ANALYTICS 1.0 — pure functions
 * (Phase 8D).
 *
 * Provider-neutral agent taxonomy over FIRST-PARTY
 * request evidence (user-imported logs). Classification
 * is User-Agent-signature based and therefore ALWAYS
 * OBSERVED_USER_AGENT — never VERIFIED_AI_AGENT —
 * because UA strings are spoofable and RENKOO performs
 * no reverse-DNS verification in this phase.
 *
 * Mandatory separation (never inferred):
 *   visit ≠ citation ≠ mention ≠ ranking ≠ traffic
 *
 * Privacy: raw IPs are never stored (SHA-256 hash
 * only); sensitive query parameters are stripped;
 * no cookies, auth headers or bodies are read.
 * =========================================================
 */

import { createHash } from 'node:crypto';

export type AgentCategory =
  | 'AI_SEARCH_CRAWLER'
  | 'AI_ASSISTANT'
  | 'AI_TRAINING'
  | 'SEARCH_ENGINE'
  | 'SOCIAL'
  | 'OTHER_BOT'
  | 'HUMAN'
  | 'UNKNOWN';

export type AgentFamily =
  | 'OpenAI'
  | 'Anthropic'
  | 'Google'
  | 'Microsoft'
  | 'Perplexity'
  | 'Amazon'
  | 'Apple'
  | 'CommonCrawl'
  | 'Social'
  | 'Browser'
  | 'Other';

export type VerificationState =
  | 'OBSERVED_USER_AGENT'
  | 'VERIFIED_AI_AGENT';

export type AgentSource =
  | 'FIRST_PARTY_LOG'
  | 'CDN_LOG'
  | 'ANALYTICS'
  | 'CRAWL_OBSERVATION'
  | 'MANUAL_IMPORT';

export interface AgentSignature {
  token: string;
  category: AgentCategory;
  family: AgentFamily;
}

/*
 * Documented crawler/assistant tokens. Order matters:
 * specific tokens before generic substrings.
 */
export const AGENT_SIGNATURES: readonly AgentSignature[] =
  [
    { token: 'oai-searchbot', category: 'AI_SEARCH_CRAWLER', family: 'OpenAI' },
    { token: 'perplexitybot', category: 'AI_SEARCH_CRAWLER', family: 'Perplexity' },
    { token: 'chatgpt-user', category: 'AI_ASSISTANT', family: 'OpenAI' },
    { token: 'claude-user', category: 'AI_ASSISTANT', family: 'Anthropic' },
    { token: 'gptbot', category: 'AI_TRAINING', family: 'OpenAI' },
    { token: 'claudebot', category: 'AI_TRAINING', family: 'Anthropic' },
    { token: 'anthropic-ai', category: 'AI_TRAINING', family: 'Anthropic' },
    { token: 'google-extended', category: 'AI_TRAINING', family: 'Google' },
    { token: 'amazonbot', category: 'AI_TRAINING', family: 'Amazon' },
    { token: 'applebot-extended', category: 'AI_TRAINING', family: 'Apple' },
    { token: 'applebot', category: 'SEARCH_ENGINE', family: 'Apple' },
    { token: 'googlebot', category: 'SEARCH_ENGINE', family: 'Google' },
    { token: 'googleother', category: 'SEARCH_ENGINE', family: 'Google' },
    { token: 'mediapartners-google', category: 'SEARCH_ENGINE', family: 'Google' },
    { token: 'adsbot-google', category: 'SEARCH_ENGINE', family: 'Google' },
    { token: 'bingbot', category: 'SEARCH_ENGINE', family: 'Microsoft' },
    { token: 'bingpreview', category: 'SEARCH_ENGINE', family: 'Microsoft' },
    { token: 'msnbot', category: 'SEARCH_ENGINE', family: 'Microsoft' },
    { token: 'ccbot', category: 'OTHER_BOT', family: 'CommonCrawl' },
    { token: 'facebookexternalhit', category: 'SOCIAL', family: 'Social' },
    { token: 'twitterbot', category: 'SOCIAL', family: 'Social' },
    { token: 'slackbot', category: 'SOCIAL', family: 'Social' },
    { token: 'linkedinbot', category: 'SOCIAL', family: 'Social' },
  ];

const GENERIC_BOT =
  /(bot|crawl|spider|slurp|archiver|fetcher|monitor|scanner)/i;

const BROWSER =
  /(mozilla|chrome|safari|firefox|edg|opr)/i;

export interface AgentClassification {
  category: AgentCategory;
  family: AgentFamily;
  verificationState: VerificationState;
  matchedToken: string | null;
}

export function classifyAgent(
  userAgent: unknown,
): AgentClassification {
  const ua = String(userAgent ?? '');
  const lowered = ua.toLowerCase();
  for (const signature of AGENT_SIGNATURES) {
    if (lowered.includes(signature.token)) {
      return {
        category: signature.category,
        family: signature.family,
        verificationState: 'OBSERVED_USER_AGENT',
        matchedToken: signature.token,
      };
    }
  }
  if (GENERIC_BOT.test(ua)) {
    return {
      category: 'OTHER_BOT',
      family: 'Other',
      verificationState: 'OBSERVED_USER_AGENT',
      matchedToken: null,
    };
  }
  if (BROWSER.test(ua)) {
    return {
      category: 'HUMAN',
      family: 'Browser',
      verificationState: 'OBSERVED_USER_AGENT',
      matchedToken: null,
    };
  }
  return {
    category: 'UNKNOWN',
    family: 'Other',
    verificationState: 'OBSERVED_USER_AGENT',
    matchedToken: null,
  };
}

/* ---------- privacy-safe URL handling ---------- */

const SENSITIVE_QUERY_KEYS =
  /^(utm_|gclid|fbclid|msclkid|session|token|auth|key|password|email|phone|_ga|mc_|yclid)/i;

export function normalizeRequestUrl(
  raw: unknown,
): string | null {
  const value = String(raw ?? '').trim().slice(0, 2000);
  if (!value) return null;
  try {
    const parsed = new URL(
      value,
      'https://placeholder.local',
    );
    const path = parsed.pathname
      .replace(/\/+$/, '')
      .toLowerCase()
      .slice(0, 500);
    const kept: string[] = [];
    for (const [key, val] of parsed.searchParams) {
      if (SENSITIVE_QUERY_KEYS.test(key)) continue;
      kept.push(
        `${key}=${val.slice(0, 80)}`,
      );
      if (kept.length >= 5) break;
    }
    kept.sort();
    return `${path || '/'}${kept.length > 0 ? `?${kept.join('&')}` : ''}`;
  } catch {
    const path = value.split('?')[0].toLowerCase();
    return path || null;
  }
}

export function hashIp(ip: unknown): string | null {
  const value = String(ip ?? '').trim();
  if (!value) return null;
  return createHash('sha256')
    .update(`renkoo-agent-v1|${value}`)
    .digest('hex')
    .slice(0, 32);
}

/* ---------- CSV log parsing ---------- */

export interface ParsedLogRow {
  timestamp: string | null;
  method: string;
  path: string;
  statusCode: number | null;
  userAgent: string;
  bytes: number | null;
  referrer: string | null;
  country: string | null;
  classification: AgentClassification;
  normalizedUrl: string | null;
}

export const MAX_PARSE_ROWS = 5000;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function headerIndex(
  headers: string[],
  names: string[],
): number {
  const lowered = headers.map((h) => h.toLowerCase());
  for (const name of names) {
    const idx = lowered.indexOf(name);
    if (idx >= 0) return idx;
  }
  return -1;
}

export interface ParseReport {
  rows: ParsedLogRow[];
  received: number;
  parsed: number;
  rejected: number;
  truncated: boolean;
  families: string[];
}

export function parseLogCsv(
  csv: string,
): ParseReport {
  const lines = String(csv ?? '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length < 2) {
    return {
      rows: [],
      received: 0,
      parsed: 0,
      rejected: lines.length,
      truncated: false,
      families: [],
    };
  }
  const headers = splitCsvLine(lines[0]);
  const idx = {
    timestamp: headerIndex(headers, [
      'timestamp',
      'time',
      'datetime',
      'date',
    ]),
    method: headerIndex(headers, ['method', 'verb']),
    path: headerIndex(headers, [
      'path',
      'url',
      'uri',
      'request',
    ]),
    status: headerIndex(headers, [
      'status',
      'statuscode',
      'status_code',
      'code',
    ]),
    ua: headerIndex(headers, [
      'user-agent',
      'useragent',
      'user_agent',
      'agent',
    ]),
    bytes: headerIndex(headers, [
      'bytes',
      'size',
      'responsebytes',
      'response_bytes',
    ]),
    referrer: headerIndex(headers, [
      'referrer',
      'referer',
    ]),
    country: headerIndex(headers, [
      'country',
      'geo',
      'cc',
    ]),
  };
  if (idx.path < 0 || idx.ua < 0) {
    return {
      rows: [],
      received: lines.length - 1,
      parsed: 0,
      rejected: lines.length - 1,
      truncated: false,
      families: [],
    };
  }
  const rows: ParsedLogRow[] = [];
  let rejected = 0;
  const dataLines = lines.slice(1);
  const truncated = dataLines.length > MAX_PARSE_ROWS;
  for (const line of dataLines.slice(
    0,
    MAX_PARSE_ROWS,
  )) {
    const cells = splitCsvLine(line);
    const path = cells[idx.path] ?? '';
    const ua = cells[idx.ua] ?? '';
    const normalizedUrl = normalizeRequestUrl(path);
    if (!normalizedUrl || !ua) {
      rejected += 1;
      continue;
    }
    const statusRaw =
      idx.status >= 0 ? cells[idx.status] : '';
    const statusNum = Number(statusRaw);
    const bytesRaw =
      idx.bytes >= 0 ? cells[idx.bytes] : '';
    const bytesNum = Number(bytesRaw);
    const tsRaw =
      idx.timestamp >= 0 ? cells[idx.timestamp] : '';
    const ts = tsRaw ? new Date(tsRaw) : null;
    rows.push({
      timestamp:
        ts && !Number.isNaN(ts.getTime())
          ? ts.toISOString()
          : null,
      method: (
        (idx.method >= 0 ? cells[idx.method] : 'GET') ||
        'GET'
      )
        .toUpperCase()
        .slice(0, 10),
      path: String(path).slice(0, 500),
      statusCode:
        statusRaw === '' || !Number.isFinite(statusNum)
          ? null
          : Math.floor(statusNum),
      userAgent: ua.slice(0, 1000),
      bytes:
        bytesRaw === '' || !Number.isFinite(bytesNum)
          ? null
          : Math.max(0, Math.floor(bytesNum)),
      referrer:
        idx.referrer >= 0 && cells[idx.referrer]
          ? String(cells[idx.referrer]).slice(0, 500)
          : null,
      country:
        idx.country >= 0 && cells[idx.country]
          ? String(cells[idx.country])
              .toUpperCase()
              .slice(0, 4)
          : null,
      classification: classifyAgent(ua),
      normalizedUrl,
    });
  }
  return {
    rows,
    received: dataLines.length,
    parsed: rows.length,
    rejected,
    truncated,
    families: Array.from(
      new Set(
        rows.map(
          (row) => row.classification.family,
        ),
      ),
    ).sort(),
  };
}

/* ---------- identity ---------- */

export function requestIdentityKey(input: {
  organizationId: string;
  websiteId: string;
  timestamp: string | null;
  method: string;
  normalizedUrl: string;
  userAgent: string;
}): string {
  return createHash('sha256')
    .update(
      [
        input.organizationId.trim(),
        input.websiteId.trim(),
        (input.timestamp ?? 'no-ts').trim(),
        input.method.toUpperCase(),
        input.normalizedUrl,
        input.userAgent.slice(0, 300),
      ].join('|'),
    )
    .digest('hex');
}

/* ---------- aggregation ---------- */

export interface AgentVisitSummary {
  requests: number;
  families: string[];
  pages: number;
  byAgent: Array<{
    family: string;
    category: AgentCategory;
    requests: number;
    pages: number;
  }>;
  byPage: Array<{
    url: string;
    requests: number;
    families: string[];
  }>;
  statusCodes: Array<{
    status: number;
    count: number;
  }>;
  firstSeen: string | null;
  lastSeen: string | null;
}

export function summarizeVisits(
  rows: Array<{
    family: string;
    category: AgentCategory;
    normalizedUrl: string;
    statusCode: number | null;
    timestamp: string | null;
  }>,
): AgentVisitSummary {
  const byAgent = new Map<
    string,
    {
      family: string;
      category: AgentCategory;
      requests: number;
      pages: Set<string>;
    }
  >();
  const byPage = new Map<
    string,
    { requests: number; families: Set<string> }
  >();
  const status = new Map<number, number>();
  let first: string | null = null;
  let last: string | null = null;
  for (const row of rows) {
    const agent = byAgent.get(row.family) ?? {
      family: row.family,
      category: row.category,
      requests: 0,
      pages: new Set<string>(),
    };
    agent.requests += 1;
    agent.pages.add(row.normalizedUrl);
    byAgent.set(row.family, agent);
    const page = byPage.get(row.normalizedUrl) ?? {
      requests: 0,
      families: new Set<string>(),
    };
    page.requests += 1;
    page.families.add(row.family);
    byPage.set(row.normalizedUrl, page);
    if (row.statusCode !== null) {
      status.set(
        row.statusCode,
        (status.get(row.statusCode) ?? 0) + 1,
      );
    }
    if (row.timestamp) {
      if (!first || row.timestamp < first)
        first = row.timestamp;
      if (!last || row.timestamp > last)
        last = row.timestamp;
    }
  }
  return {
    requests: rows.length,
    families: [...byAgent.keys()].sort(),
    pages: byPage.size,
    byAgent: [...byAgent.values()]
      .map((entry) => ({
        family: entry.family,
        category: entry.category,
        requests: entry.requests,
        pages: entry.pages.size,
      }))
      .sort((a, b) => b.requests - a.requests),
    byPage: [...byPage.entries()]
      .map(([url, entry]) => ({
        url,
        requests: entry.requests,
        families: [...entry.families].sort(),
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 50),
    statusCodes: [...status.entries()]
      .map(([statusCode, count]) => ({
        status: statusCode,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    firstSeen: first,
    lastSeen: last,
  };
}

/* ---------- change detection ---------- */

export type AgentChangeKind =
  | 'NEW_AGENT'
  | 'AGENT_RETURNED'
  | 'AGENT_DISAPPEARED'
  | 'PAGE_FIRST_VISITED'
  | 'PAGE_NO_LONGER_VISITED'
  | 'ERROR_INCREASE'
  | 'ACCESS_RESTORED'
  | 'UNCHANGED'
  | 'UNKNOWN';

export interface AgentChange {
  kind: AgentChangeKind;
  subject: string;
  evidence: string;
}

export function detectAgentChanges(input: {
  previous: {
    families: string[];
    pages: string[];
    errors: number;
    total: number;
  } | null;
  current: {
    families: string[];
    pages: string[];
    errors: number;
    total: number;
  } | null;
}): AgentChange[] {
  if (!input.previous && !input.current) return [];
  if (!input.previous && input.current) {
    return [
      {
        kind: 'NEW_AGENT',
        subject: 'baseline',
        evidence:
          'First import with observations — baseline established.',
      },
    ];
  }
  if (input.previous && !input.current) {
    return [
      {
        kind: 'UNKNOWN',
        subject: 'current',
        evidence: 'No current observations to compare.',
      },
    ];
  }
  const prev = input.previous!;
  const curr = input.current!;
  const changes: AgentChange[] = [];
  for (const family of curr.families) {
    if (!prev.families.includes(family)) {
      changes.push({
        kind: prev.families.length > 0
          ? 'AGENT_RETURNED'
          : 'NEW_AGENT',
        subject: family,
        evidence: `${family} observed in current window, absent before.`,
      });
    }
  }
  for (const family of prev.families) {
    if (!curr.families.includes(family)) {
      changes.push({
        kind: 'AGENT_DISAPPEARED',
        subject: family,
        evidence: `${family} absent in current window, present before.`,
      });
    }
  }
  for (const page of curr.pages) {
    if (!prev.pages.includes(page)) {
      changes.push({
        kind: 'PAGE_FIRST_VISITED',
        subject: page,
        evidence: `First observed agent request for ${page}.`,
      });
    }
  }
  for (const page of prev.pages) {
    if (!curr.pages.includes(page)) {
      changes.push({
        kind: 'PAGE_NO_LONGER_VISITED',
        subject: page,
        evidence: `No agent request for ${page} in current window.`,
      });
    }
  }
  if (
    prev.total > 0 &&
    curr.errors > prev.errors * 2 &&
    curr.errors >= 3
  ) {
    changes.push({
      kind: 'ERROR_INCREASE',
      subject: 'errors',
      evidence: `Error responses rose from ${prev.errors} to ${curr.errors}.`,
    });
  }
  if (prev.errors >= 3 && curr.errors === 0) {
    changes.push({
      kind: 'ACCESS_RESTORED',
      subject: 'errors',
      evidence: 'Error responses cleared in current window.',
    });
  }
  if (changes.length === 0) {
    changes.push({
      kind: 'UNCHANGED',
      subject: 'window',
      evidence: 'No meaningful movement between windows.',
    });
  }
  return changes.slice(0, 50);
}

/* ---------- coverage + robots ---------- */

export type PageCoverageState =
  | 'AI_AGENT_VISITED'
  | 'AI_AGENT_NOT_OBSERVED'
  | 'UNKNOWN';

export function pageCoverage(
  pageUrl: string,
  visitedUrls: Set<string> | string[],
  hasObservations: boolean,
): PageCoverageState {
  if (!hasObservations) return 'UNKNOWN';
  const set =
    visitedUrls instanceof Set
      ? visitedUrls
      : new Set(visitedUrls);
  return set.has(pageUrl.toLowerCase())
    ? 'AI_AGENT_VISITED'
    : 'AI_AGENT_NOT_OBSERVED';
}

export type RobotsAccessState =
  | 'ROBOTS_ALLOWED_OBSERVED'
  | 'ROBOTS_DISALLOWED_OBSERVED'
  | 'ROBOTS_ALLOWED_NOT_OBSERVED'
  | 'NOT_OBSERVED'
  | 'UNKNOWN';

export function robotsAccess(
  robotsIndexable: boolean | null,
  observed: boolean,
  hasCrawlEvidence: boolean,
): RobotsAccessState {
  if (!hasCrawlEvidence) return 'UNKNOWN';
  if (observed) {
    return robotsIndexable === false
      ? 'ROBOTS_DISALLOWED_OBSERVED'
      : 'ROBOTS_ALLOWED_OBSERVED';
  }
  if (robotsIndexable === false) return 'NOT_OBSERVED';
  return robotsIndexable === true
    ? 'ROBOTS_ALLOWED_NOT_OBSERVED'
    : 'NOT_OBSERVED';
}

export function isAiCategory(
  category: AgentCategory,
): boolean {
  return (
    category === 'AI_SEARCH_CRAWLER' ||
    category === 'AI_ASSISTANT' ||
    category === 'AI_TRAINING'
  );
}
