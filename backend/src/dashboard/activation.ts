/*
 * =========================================================
 * ACTIVATION + CLIENT ONBOARDING + TIME-TO-FIRST-VALUE
 * 1.0 — pure functions (Phase 30).
 *
 * New account → website → business context → data
 * connections → baseline → snapshot → first actions →
 * growth plan. Progressive disclosure; at most five
 * checklist items; READY/PARTIAL/BLOCKED, never
 * percentages; first value = an evidence-backed
 * decision, never "dashboard loaded".
 *
 * Research grounding (2026):
 * - Activation = % reaching a defined value moment;
 *   median B2B SaaS ~36–38%; TTV beats completion as
 *   the headline (VENDOR_RESEARCH, convergent).
 * - First value in session one; checklists of 3–5
 *   critical tasks; value event = observable behavior
 *   predicting retention (VENDOR_RESEARCH).
 * - SEO onboarding: expectation calibration, access in
 *   2 weeks, triage audit, quick wins (page 11–20,
 *   unindexed pages, title CTR, NAP), 60–90 day first
 *   movement honesty, never promised rankings
 *   (practitioner consensus, INFERENCE-grade).
 *
 * Rules: no fake readiness/completion/GSC/AI/crawl/
 * competitor/need/context/value; no causal claims
 * ("guaranteed", "will increase", "will rank"); no
 * duplicate engines; unavailable stays unavailable.
 * =========================================================
 */

export type ActivationState =
  | 'NEW'
  | 'WEBSITE_ADDED'
  | 'WEBSITE_VALIDATING'
  | 'WEBSITE_READY'
  | 'CRAWL_RUNNING'
  | 'CRAWL_READY'
  | 'GSC_NOT_CONNECTED'
  | 'GSC_CONNECTED'
  | 'GA4_NOT_CONNECTED'
  | 'GA4_CONNECTED'
  | 'BUSINESS_CONTEXT_PARTIAL'
  | 'BUSINESS_CONTEXT_READY'
  | 'BASELINE_READY'
  | 'FIRST_VALUE_READY'
  | 'ACTIVE'
  | 'BLOCKED'
  | 'ERROR';

export type ReadinessLevel = 'READY' | 'PARTIAL' | 'BLOCKED';
export type DoneOptionalBlocked = 'DONE' | 'OPTIONAL' | 'BLOCKED';
export type FieldEvidence =
  | 'USER_PROVIDED'
  | 'OBSERVED'
  | 'INFERRED'
  | 'UNAVAILABLE';

export type ActivationEvent =
  | 'ONBOARDING_STARTED'
  | 'WEBSITE_ADDED'
  | 'BUSINESS_CONTEXT_SAVED'
  | 'GSC_CONNECTED'
  | 'CRAWL_COMPLETED'
  | 'BASELINE_READY'
  | 'FIRST_VALUE_READY'
  | 'FIRST_ACTION_OPENED'
  | 'FIRST_PROPOSAL_CREATED'
  | 'FIRST_APPROVAL'
  | 'FIRST_EXECUTION'
  | 'FIRST_VERIFICATION'
  | 'FIRST_MEASUREMENT';

export const ACTIVATION_FUNNEL: readonly ActivationEvent[] =
  [
    'WEBSITE_ADDED',
    'CRAWL_COMPLETED',
    'BASELINE_READY',
    'FIRST_VALUE_READY',
    'FIRST_ACTION_OPENED',
    'FIRST_PROPOSAL_CREATED',
    'FIRST_APPROVAL',
    'FIRST_EXECUTION',
    'FIRST_VERIFICATION',
    'FIRST_MEASUREMENT',
  ];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

/* ---------- URL validation ---------- */

export function validateWebsiteUrl(
  raw: unknown,
): { ok: boolean; normalized: string | null; reason: string | null } {
  const text = clean(raw);
  if (!text)
    return { ok: false, normalized: null, reason: 'URL is required.' };
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(text) ? text : `https://${text}`,
    );
  } catch {
    return { ok: false, normalized: null, reason: 'Malformed URL.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    // Allow http but prefer https; still valid.
    return { ok: false, normalized: null, reason: 'Malformed URL.' };
  }
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '[::1]'
  ) {
    return {
      ok: false,
      normalized: null,
      reason: 'Local and private hosts are not supported.',
    };
  }
  if (!host.includes('.')) {
    return { ok: false, normalized: null, reason: 'Malformed URL.' };
  }
  const normalized = `https://${host}${url.port && url.port !== '443' ? `:${url.port}` : ''}${url.pathname.replace(/\/+$/, '') || ''}`;
  return {
    ok: true,
    normalized,
    reason: url.protocol === 'http:' ? 'HTTPS is preferred.' : null,
  };
}

/* ---------- business context ---------- */

export interface ContextField {
  value: string | null;
  evidence: FieldEvidence;
}

export function contextReadiness(
  fields: Record<string, ContextField>,
): 'READY' | 'PARTIAL' | 'MISSING' {
  const names = Object.keys(fields);
  if (names.length === 0) return 'MISSING';
  const filled = names.filter(
    (name) =>
      clean(fields[name].value).length > 0 &&
      fields[name].evidence !== 'UNAVAILABLE',
  ).length;
  if (filled === 0) return 'MISSING';
  const required = ['businessName', 'country', 'services'];
  const requiredFilled = required.filter(
    (name) =>
      fields[name] &&
      clean(fields[name].value).length > 0,
  ).length;
  if (requiredFilled === required.length) return 'READY';
  return 'PARTIAL';
}

export function contextChecklist(
  fields: Record<string, ContextField>,
): Array<{ label: string; done: boolean }> {
  const label: Record<string, string> = {
    businessName: 'Company',
    website: 'Website',
    country: 'Country',
    services: 'Services',
  };
  return Object.keys(label).map((name) => ({
    label: label[name],
    done:
      clean(fields[name]?.value).length > 0 &&
      fields[name]?.evidence !== 'UNAVAILABLE',
  }));
}

/* ---------- checklist (max 5) ---------- */

export interface ChecklistItem {
  key: string;
  label: string;
  state: DoneOptionalBlocked;
}

export function onboardingChecklist(input: {
  hasWebsite: boolean;
  crawlReady: boolean | null;
  gscConnected: boolean;
  contextReady: boolean;
  hasFirstValue: boolean;
}): ChecklistItem[] {
  return [
    {
      key: 'website',
      label: 'Website',
      state: input.hasWebsite ? 'DONE' : 'BLOCKED',
    },
    {
      key: 'crawl',
      label: 'Crawl',
      state:
        input.crawlReady === true
          ? 'DONE'
          : input.crawlReady === null
            ? 'OPTIONAL'
            : 'BLOCKED',
    },
    {
      key: 'gsc',
      label: 'GSC',
      state: input.gscConnected ? 'DONE' : 'OPTIONAL',
    },
    {
      key: 'business-context',
      label: 'Business context',
      state: input.contextReady ? 'DONE' : 'OPTIONAL',
    },
    {
      key: 'first-opportunity',
      label: 'First growth opportunity',
      state: input.hasFirstValue ? 'DONE' : 'OPTIONAL',
    },
  ];
}

/* ---------- first value ---------- */

export interface FirstValueInput {
  hasDecision: boolean;
  decisionLabel: string | null;
}

export function firstValueReady(
  input: FirstValueInput,
): boolean {
  return (
    input.hasDecision &&
    clean(input.decisionLabel).length > 0
  );
}

export function topInsightsCap<T>(items: T[]): T[] {
  return items.slice(0, 5);
}

export function topActionsCap<T>(items: T[]): T[] {
  return items.slice(0, 3);
}

/* ---------- funnel (counts only) ---------- */

export function funnelProgress(
  reached: ActivationEvent[],
): Array<{ event: ActivationEvent; reached: boolean }> {
  const reachedSet = new Set(reached);
  return ACTIVATION_FUNNEL.map((event) => ({
    event,
    reached: reachedSet.has(event),
  }));
}

/* ---------- empty/error copy ---------- */

export function emptyCopy(
  missing: 'GSC' | 'CRAWL' | 'AI' | 'COMPETITORS' | 'OUTCOMES',
): { what: string; why: string; action: string } {
  switch (missing) {
    case 'GSC':
      return {
        what: 'Verified query demand and impressions are missing.',
        why: 'Search Console is not connected.',
        action:
          'Connect Google Search Console to see verified query demand and impressions.',
      };
    case 'CRAWL':
      return {
        what: 'Technical and content evidence is missing.',
        why: 'No completed crawl exists for this website.',
        action: 'Run a crawl. If it fails, retry from the crawl status.',
      };
    case 'AI':
      return {
        what: 'AI visibility evidence is missing.',
        why: 'AI monitoring has not run for this website.',
        action: 'Continue without AI evidence or configure AI monitoring.',
      };
    case 'COMPETITORS':
      return {
        what: 'Competitor context is missing.',
        why: 'No competitors are configured or observed.',
        action: 'Continue with available evidence or add competitors.',
      };
    case 'OUTCOMES':
      return {
        what: 'Business outcome linkage is missing.',
        why: 'No recorded leads or revenue link to search evidence.',
        action: 'Record outcomes to unlock business linkage.',
      };
    default:
      return {
        what: 'Evidence is missing.',
        why: 'The source is not connected.',
        action: 'Connect the source or continue with available evidence.',
      };
  }
}

export function containsCausalClaim(
  text: unknown,
): boolean {
  const lowered = ` ${clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')} `;
  return [
    'guaranteed',
    'will increase',
    'will rank',
    'will improve',
    'caused ',
    'because of ',
  ].some((phrase) => lowered.includes(` ${phrase.trim()} `));
}
