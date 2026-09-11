/*
 * =========================================================
 * OFFICIAL GOOGLE/BING AI SEARCH DATA 1.0 (Phase 8C).
 *
 * Capability truth table + normalization for FIRST-PARTY
 * official data. Verified against official documentation
 * (June–September 2026):
 *
 * GOOGLE
 * - Search Analytics API (query/page/country/device,
 *   clicks/impressions/ctr/position): AVAILABLE.
 *   Already integrated in RENKOO via webmasters.readonly.
 * - Generative AI performance report (AI Overviews +
 *   AI Mode impressions, pages, countries, devices,
 *   dates; NO clicks, NO queries; manual CSV export):
 *   UI_ONLY. Re-verified Aug 2026: not in the API nor
 *   in the BigQuery bulk export.
 * - AI citation/query API: NOT_AVAILABLE.
 * - AI Mode activity inside Web totals: PARTIAL
 *   (blended, never separable — never labeled as AI).
 *
 * BING
 * - AI Performance dashboard (citations, cited pages,
 *   grounding-query sample, trends; Intents/Topics/
 *   Citation Share/Compare previews): UI_ONLY, CSV
 *   export, no placement/ranking semantics, no
 *   competitor-domain exposure.
 * - AI Performance API: NOT_AVAILABLE (Microsoft:
 *   backlog, no timeline, Feb 2026).
 *
 * Nothing here scrapes, invents endpoints, or merges
 * incompatible metrics. UI evidence is never upgraded
 * to API-verified evidence.
 * =========================================================
 */

export type CapabilityState =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'NOT_AVAILABLE'
  | 'UI_ONLY'
  | 'UNKNOWN';

export type OfficialEvidenceState =
  | 'VERIFIED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'UNAVAILABLE';

export interface CapabilityRow {
  capability: string;
  google: CapabilityState;
  bing: CapabilityState;
  renkoo: string;
  evidence: OfficialEvidenceState;
  note: string;
}

export const CAPABILITY_MATRIX: readonly CapabilityRow[] =
  [
    {
      capability: 'AI impressions',
      google: 'UI_ONLY',
      bing: 'UI_ONLY',
      renkoo: 'MANUAL_IMPORT',
      evidence: 'OBSERVED',
      note: 'Google GenAI report and Bing AI Performance show impressions/citations in UI only; RENKOO accepts user-exported rows labeled MANUAL_EXPORT.',
    },
    {
      capability: 'AI clicks',
      google: 'NOT_AVAILABLE',
      bing: 'NOT_AVAILABLE',
      renkoo: 'UNAVAILABLE',
      evidence: 'UNAVAILABLE',
      note: 'Google GenAI report exposes no clicks; Bing tracks citations, not clicks. Never shown, never zero-filled.',
    },
    {
      capability: 'AI citations',
      google: 'NOT_AVAILABLE',
      bing: 'UI_ONLY',
      renkoo: 'MANUAL_IMPORT',
      evidence: 'OBSERVED',
      note: 'Bing dashboard shows citation counts; no API. Google exposes no citation API.',
    },
    {
      capability: 'Cited URLs',
      google: 'UI_ONLY',
      bing: 'UI_ONLY',
      renkoo: 'MANUAL_IMPORT',
      evidence: 'OBSERVED',
      note: 'Pages dimension (Google) and page-level activity (Bing) are UI/export only.',
    },
    {
      capability: 'Cited domains',
      google: 'UI_ONLY',
      bing: 'UI_ONLY',
      renkoo: 'DERIVED',
      evidence: 'INFERRED',
      note: 'Derived deterministically from imported cited URLs; never authority-scored.',
    },
    {
      capability: 'Grounding queries',
      google: 'NOT_AVAILABLE',
      bing: 'UI_ONLY',
      renkoo: 'MANUAL_IMPORT',
      evidence: 'OBSERVED',
      note: 'Bing grounding phrases are a sample of retrieval queries, not user prompts. Google exposes no query data for AI features.',
    },
    {
      capability: 'Prompt/query data (AI)',
      google: 'NOT_AVAILABLE',
      bing: 'PARTIAL',
      renkoo: 'MANUAL_IMPORT',
      evidence: 'OBSERVED',
      note: 'Only Bing grounding-query samples exist (UI). RENKOO tracked prompts remain first-party observed data, not official.',
    },
    {
      capability: 'AI visibility',
      google: 'UI_ONLY',
      bing: 'UI_ONLY',
      renkoo: 'OBSERVED',
      evidence: 'OBSERVED',
      note: 'RENKOO visibility comes from recorded third-party answers, never presented as official data.',
    },
    {
      capability: 'Citation share',
      google: 'NOT_AVAILABLE',
      bing: 'UI_ONLY',
      renkoo: 'UNAVAILABLE',
      evidence: 'UNAVAILABLE',
      note: 'Bing Citation Share is observational (no competitor domains, no traffic share). No RENKOO equivalent is computed.',
    },
    {
      capability: 'Competitor citations',
      google: 'NOT_AVAILABLE',
      bing: 'NOT_AVAILABLE',
      renkoo: 'UNAVAILABLE',
      evidence: 'UNAVAILABLE',
      note: 'Neither provider exposes competitor citation data. RENKOO competitor radar stays third-party-observed only.',
    },
    {
      capability: 'Historical data',
      google: 'PARTIAL',
      bing: 'PARTIAL',
      renkoo: 'SNAPSHOTS',
      evidence: 'VERIFIED',
      note: 'GSC Search Analytics history via API (bounded windows); GenAI/Bing history starts at first import — never backfilled by invention.',
    },
    {
      capability: 'Country',
      google: 'AVAILABLE',
      bing: 'PARTIAL',
      renkoo: 'SYNCED',
      evidence: 'VERIFIED',
      note: 'GSC country dimension via API. Bing device/country filtering exists in UI; API absent.',
    },
    {
      capability: 'Device',
      google: 'AVAILABLE',
      bing: 'PARTIAL',
      renkoo: 'SYNCED',
      evidence: 'VERIFIED',
      note: 'GSC device dimension via API (Search surfaces).',
    },
    {
      capability: 'Page',
      google: 'AVAILABLE',
      bing: 'UI_ONLY',
      renkoo: 'SYNCED',
      evidence: 'VERIFIED',
      note: 'GSC page dimension via API reflects organic Web totals (AI-blended, never AI-isolated).',
    },
    {
      capability: 'Topic',
      google: 'NOT_AVAILABLE',
      bing: 'UI_ONLY',
      renkoo: 'UNAVAILABLE',
      evidence: 'UNAVAILABLE',
      note: 'Bing Topics preview is UI-only. RENKOO topic clusters stay first-party derived.',
    },
    {
      capability: 'Intent',
      google: 'NOT_AVAILABLE',
      bing: 'UI_ONLY',
      renkoo: 'UNAVAILABLE',
      evidence: 'UNAVAILABLE',
      note: 'Bing Intents preview is UI-only. RENKOO intent stays classifier-derived.',
    },
  ];

export function capabilityFor(
  capability: string,
): CapabilityRow | null {
  const key = capability.trim().toLowerCase();
  return (
    CAPABILITY_MATRIX.find(
      (row) => row.capability.toLowerCase() === key,
    ) ?? null
  );
}

/* ---------- semantic separation (mandatory) ---------- */

export const SEPARATE_CONCEPTS = [
  'GOOGLE_ORGANIC_RANKING',
  'GOOGLE_AI_OVERVIEW_VISIBILITY',
  'GOOGLE_AI_MODE_VISIBILITY',
  'BING_ORGANIC_RANKING',
  'BING_AI_PERFORMANCE',
  'CHATGPT_VISIBILITY',
  'GEMINI_VISIBILITY',
  'PERPLEXITY_VISIBILITY',
  'COPILOT_VISIBILITY',
] as const;

export type SeparateConcept =
  (typeof SEPARATE_CONCEPTS)[number];

export function isSeparateConcept(
  value: string,
): value is SeparateConcept {
  return (SEPARATE_CONCEPTS as readonly string[]).includes(
    value,
  );
}

/* ---------- official observation model ---------- */

export type OfficialProvider = 'GOOGLE' | 'BING';

export type OfficialMethod =
  | 'SEARCH_ANALYTICS_API'
  | 'MANUAL_EXPORT';

export type OfficialKind =
  | 'ORGANIC_DEMAND'
  | 'AI_IMPRESSION'
  | 'AI_CITATION';

export interface OfficialObservationInput {
  provider: OfficialProvider;
  method: OfficialMethod;
  kind: OfficialKind;
  date: string;
  query?: string | null;
  pageUrl?: string | null;
  country?: string | null;
  device?: string | null;
  impressions?: unknown;
  clicks?: unknown;
  citations?: unknown;
  groundingQuery?: string | null;
}

export interface NormalizedOfficialObservation {
  provider: OfficialProvider;
  method: OfficialMethod;
  kind: OfficialKind;
  concept: SeparateConcept;
  date: string;
  query: string | null;
  pageUrl: string | null;
  country: string | null;
  device: string | null;
  impressions: number | null;
  clicks: number | null;
  citations: number | null;
  groundingQuery: string | null;
  evidenceState: OfficialEvidenceState;
  identityKey: string;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0
    ? Math.floor(n)
    : null;
}

function validDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : value;
}

export function conceptFor(
  provider: OfficialProvider,
  kind: OfficialKind,
): SeparateConcept {
  if (provider === 'BING') return 'BING_AI_PERFORMANCE';
  if (kind === 'ORGANIC_DEMAND')
    return 'GOOGLE_ORGANIC_RANKING';
  return 'GOOGLE_AI_OVERVIEW_VISIBILITY';
}

export function normalizeOfficialObservation(
  input: OfficialObservationInput,
): NormalizedOfficialObservation | null {
  const date = validDate(clean(input.date));
  if (!date) return null;
  if (
    input.provider !== 'GOOGLE' &&
    input.provider !== 'BING'
  ) {
    return null;
  }
  if (
    input.method !== 'SEARCH_ANALYTICS_API' &&
    input.method !== 'MANUAL_EXPORT'
  ) {
    return null;
  }
  const kind: OfficialKind =
    input.kind === 'AI_IMPRESSION' ||
    input.kind === 'AI_CITATION'
      ? input.kind
      : 'ORGANIC_DEMAND';
  /* AI kinds require a page or grounding context;
   * organic demand requires query or page. */
  const query = clean(input.query) || null;
  const pageUrl = clean(input.pageUrl) || null;
  const groundingQuery =
    clean(input.groundingQuery) || null;
  if (kind === 'ORGANIC_DEMAND' && !query && !pageUrl) {
    return null;
  }
  if (
    (kind === 'AI_IMPRESSION' ||
      kind === 'AI_CITATION') &&
    !pageUrl &&
    !groundingQuery
  ) {
    return null;
  }
  const evidenceState: OfficialEvidenceState =
    input.method === 'SEARCH_ANALYTICS_API'
      ? 'VERIFIED'
      : 'OBSERVED';
  const identityKey = [
    input.provider,
    input.method,
    kind,
    date,
    (query ?? '').toLowerCase().replace(/\s+/g, ' '),
    (pageUrl ?? '').toLowerCase(),
    (clean(input.country) || 'ALL').toUpperCase(),
    (clean(input.device) || 'ALL').toUpperCase(),
    (groundingQuery ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' '),
  ].join('|');
  return {
    provider: input.provider,
    method: input.method,
    kind,
    concept: conceptFor(input.provider, kind),
    date,
    query,
    pageUrl,
    country: clean(input.country).toUpperCase() || null,
    device: clean(input.device).toLowerCase() || null,
    impressions: numOrNull(input.impressions),
    clicks:
      kind === 'ORGANIC_DEMAND'
        ? numOrNull(input.clicks)
        : null,
    citations:
      kind === 'AI_CITATION'
        ? numOrNull(input.citations)
        : null,
    groundingQuery,
    evidenceState,
    identityKey,
  };
}

/* ---------- backfill windows ---------- */

export function backfillWindow(
  days: 30 | 90,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  const end = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 3,
    ),
  );
  const start = new Date(
    end.getTime() - (days - 1) * 24 * 60 * 60 * 1000,
  );
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

/* ---------- manual CSV row validation ---------- */

export const MAX_IMPORT_ROWS = 500;

export function validateImportRows(
  provider: string,
  rows: unknown,
): {
  valid: OfficialObservationInput[];
  rejected: number;
} {
  const list = Array.isArray(rows) ? rows : [];
  const valid: OfficialObservationInput[] = [];
  let rejected = 0;
  for (const row of list.slice(0, MAX_IMPORT_ROWS)) {
    const record = (row ?? {}) as Record<string, unknown>;
    const normalized = normalizeOfficialObservation({
      provider:
        String(provider).toUpperCase() === 'BING'
          ? 'BING'
          : 'GOOGLE',
      method: 'MANUAL_EXPORT',
      kind:
        (record.kind as OfficialKind) ??
        'AI_IMPRESSION',
      date: String(record.date ?? ''),
      query:
        typeof record.query === 'string'
          ? record.query
          : null,
      pageUrl:
        typeof record.pageUrl === 'string'
          ? record.pageUrl
          : typeof record.url === 'string'
            ? record.url
            : null,
      country:
        typeof record.country === 'string'
          ? record.country
          : null,
      device:
        typeof record.device === 'string'
          ? record.device
          : null,
      impressions: record.impressions,
      clicks: record.clicks,
      citations:
        record.citations ?? record.totalCitations,
      groundingQuery:
        typeof record.groundingQuery === 'string'
          ? record.groundingQuery
          : null,
    });
    if (!normalized) {
      rejected += 1;
      continue;
    }
    valid.push({
      provider: normalized.provider,
      method: normalized.method,
      kind: normalized.kind,
      date: normalized.date,
      query: normalized.query,
      pageUrl: normalized.pageUrl,
      country: normalized.country,
      device: normalized.device,
      impressions: normalized.impressions,
      clicks: normalized.clicks,
      citations: normalized.citations,
      groundingQuery: normalized.groundingQuery,
    });
  }
  return { valid, rejected };
}
