'use client';

/*
 * =========================================================
 * PERSONA EXPERIENCE V1 — presentation only.
 *
 * Persona changes ordering, emphasis, quick actions and
 * suggested questions. It NEVER grants permissions:
 * RBAC (membership role), billing entitlements and
 * usage limits remain authoritative server-side.
 * Opportunity ranking below re-orders the engine's
 * real output; evidence, scores and priorities are
 * never fabricated or hidden.
 * =========================================================
 */

import { useCallback, useEffect, useState } from 'react';

import {
  getPersona as fetchPersona,
  setPersona as savePersona,
  type PersonaResponse,
} from './api';

export const PERSONA_IDS = [
  'BUSINESS_OWNER',
  'SEO_SPECIALIST',
  'CONTENT_MARKETER',
  'MARKETING_MANAGER',
  'AGENCY',
  'ADMIN',
] as const;

export type PersonaId =
  (typeof PERSONA_IDS)[number];

export const DEFAULT_PERSONA: PersonaId =
  'MARKETING_MANAGER';

export function isPersonaId(
  value: unknown,
): value is PersonaId {
  return (
    typeof value === 'string' &&
    (PERSONA_IDS as readonly string[]).includes(
      value,
    )
  );
}

export interface PersonaMeta {
  id: PersonaId;
  label: string;
  tagline: string;
  question: string;
}

export const PERSONA_META: Record<
  PersonaId,
  PersonaMeta
> = {
  BUSINESS_OWNER: {
    id: 'BUSINESS_OWNER',
    label: 'Business Owner',
    tagline:
      'I care about growth, leads and revenue.',
    question:
      'How is the business performing and what should I do next?',
  },
  SEO_SPECIALIST: {
    id: 'SEO_SPECIALIST',
    label: 'SEO Specialist',
    tagline:
      'I care about rankings, technical health and search visibility.',
    question:
      'What is hurting search visibility and what should I fix?',
  },
  CONTENT_MARKETER: {
    id: 'CONTENT_MARKETER',
    label: 'Content Marketer',
    tagline:
      'I care about content opportunities, topics and performance.',
    question:
      'What should we create, improve or refresh?',
  },
  MARKETING_MANAGER: {
    id: 'MARKETING_MANAGER',
    label: 'Marketing Manager',
    tagline:
      'I need a complete view of marketing performance.',
    question:
      'Which marketing activities are driving growth?',
  },
  AGENCY: {
    id: 'AGENCY',
    label: 'Agency',
    tagline:
      'I manage multiple websites and clients.',
    question:
      'Which client needs attention and what should my team do?',
  },
  ADMIN: {
    id: 'ADMIN',
    label: 'Admin',
    tagline:
      'I manage workspace, team and operations.',
    question:
      'Is the workspace configured and operating correctly?',
  },
};

/*
 * Canonical route order per persona. The Sidebar
 * keeps every entry (nothing is hidden — access
 * is decided by RBAC, not persona) and appends
 * any route missing from the list at the end.
 */
export const NAV_ORDER: Record<
  PersonaId,
  string[]
> = {
  BUSINESS_OWNER: [
    '/',
    '/opportunities',
    '/leads',
    '/business-brain',
    '/reports',
    '/actions',
    '/analytics',
    '/ai-visibility',
    '/search-visibility',
    '/competitors',
    '/content',
    '/keywords',
    '/technical-seo',
    '/integrations',
    '/settings',
  ],
  SEO_SPECIALIST: [
    '/',
    '/search-visibility',
    '/technical-seo',
    '/keywords',
    '/competitors',
    '/ai-visibility',
    '/backlinks',
    '/opportunities',
    '/actions',
    '/content',
    '/analytics',
    '/monitoring',
    '/reports',
    '/integrations',
    '/settings',
  ],
  CONTENT_MARKETER: [
    '/',
    '/content',
    '/opportunities',
    '/ai-visibility',
    '/keywords',
    '/search-visibility',
    '/competitors',
    '/actions',
    '/analytics',
    '/reports',
    '/business-brain',
    '/settings',
  ],
  MARKETING_MANAGER: [
    '/',
    '/analytics',
    '/search-visibility',
    '/ai-visibility',
    '/leads',
    '/opportunities',
    '/content',
    '/competitors',
    '/actions',
    '/reports',
    '/business-brain',
    '/monitoring',
    '/integrations',
    '/settings',
  ],
  AGENCY: [
    '/clients',
    '/',
    '/opportunities',
    '/actions',
    '/reports',
    '/leads',
    '/search-visibility',
    '/ai-visibility',
    '/content',
    '/competitors',
    '/monitoring',
    '/integrations',
    '/settings',
    '/billing',
  ],
  ADMIN: [
    '/',
    '/settings',
    '/integrations',
    '/billing',
    '/clients',
    '/monitoring',
    '/reports',
    '/opportunities',
    '/actions',
    '/analytics',
  ],
};

export function orderNav<T extends { href: string }>(
  items: readonly T[],
  persona: PersonaId,
): T[] {
  const order = NAV_ORDER[persona] ?? [];
  const rank = new Map(
    order.map((href, index) => [href, index]),
  );

  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ra = rank.get(a.item.href);
      const rb = rank.get(b.item.href);

      if (ra === undefined && rb === undefined) {
        return a.index - b.index;
      }

      if (ra === undefined) return 1;
      if (rb === undefined) return -1;

      return ra - rb || a.index - b.index;
    })
    .map((entry) => entry.item);
}

/* =========================================================
 * OPPORTUNITY RANKING (client-side, evidence-first)
 * ========================================================= */

export interface RankableOpportunity {
  id: string;
  source: string;
  type: string;
  title: string;
  priority: string;
  score: number;
  businessRelevance?: 'HIGH' | 'MEDIUM' | null;
}

export interface RankedOpportunity<T> {
  opportunity: T;
  personaBoost: number;
  personaReason: string | null;
}

const PRIORITY_WEIGHT: Record<string, number> = {
  HIGH: 30,
  MEDIUM: 20,
  LOW: 10,
};

function matchesHaystack(
  opportunity: RankableOpportunity,
  keywords: string[],
): string | null {
  const haystack =
    `${opportunity.source} ${opportunity.type} ${opportunity.title}`.toLowerCase();

  for (const keyword of keywords) {
    if (haystack.includes(keyword)) {
      return keyword;
    }
  }

  return null;
}

const PERSONA_KEYWORDS: Record<
  Exclude<PersonaId, 'ADMIN'>,
  string[]
> = {
  BUSINESS_OWNER: [
    'revenue',
    'lead',
    'roi',
    'conversion',
    'business',
  ],
  SEO_SPECIALIST: [
    'technical',
    'crawl',
    'ranking',
    'rank',
    'keyword',
    'search console',
    'gsc',
    'competitor',
    'backlink',
    'index',
    'schema',
    'speed',
    'core web',
  ],
  CONTENT_MARKETER: [
    'content',
    'brief',
    'topic',
    'page',
    'refresh',
    'declin',
    'gap',
    'ai visibility',
    'aeo',
    'geo',
  ],
  MARKETING_MANAGER: [
    'traffic',
    'channel',
    'campaign',
    'lead',
    'revenue',
    'visibility',
    'competitor',
    'content',
  ],
  AGENCY: [
    'urgent',
    'overdue',
    'critical',
    'client',
    'revenue',
    'lead',
  ],
};

/*
 * Stable, transparent re-rank. Base order always
 * comes from the engine (score + priority);
 * persona adds a bounded boost with a human-
 * readable reason. Items are never removed and
 * scores are never rewritten.
 */
export function rankOpportunities<
  T extends RankableOpportunity,
>(
  items: readonly T[],
  persona: PersonaId,
): RankedOpportunity<T>[] {
  return items
    .map((opportunity, index) => {
      const base =
        (Number.isFinite(opportunity.score)
          ? opportunity.score
          : 0) +
        (PRIORITY_WEIGHT[
          String(
            opportunity.priority ?? '',
          ).toUpperCase()
        ] ?? 0);

      let boost = 0;
      let reason: string | null = null;

      if (
        opportunity.businessRelevance ===
          'HIGH' &&
        (persona === 'BUSINESS_OWNER' ||
          persona === 'MARKETING_MANAGER' ||
          persona === 'AGENCY')
      ) {
        boost += 25;
        reason = 'High business relevance';
      }

      if (persona !== 'ADMIN') {
        const hit = matchesHaystack(
          opportunity,
          PERSONA_KEYWORDS[persona],
        );

        if (hit) {
          boost += 15;
          reason = reason
            ? `${reason} · matches your focus (${hit})`
            : `Matches your focus (${hit})`;
        }
      }

      return {
        opportunity,
        personaBoost: boost,
        personaReason: reason,
        total: base + boost,
        index,
      };
    })
    .sort(
      (a, b) =>
        b.total - a.total || a.index - b.index,
    )
    .map(
      ({
        opportunity,
        personaBoost,
        personaReason,
      }) => ({
        opportunity,
        personaBoost,
        personaReason,
      }),
    );
}

/* =========================================================
 * INTELLIGENCE PROMPTS (context-aware, same engine)
 * ========================================================= */

export const INTELLIGENCE_PROMPTS: Record<
  PersonaId,
  string[]
> = {
  BUSINESS_OWNER: [
    'Why did my growth change?',
    'What should I focus on this week?',
    'Which issue could affect revenue?',
  ],
  SEO_SPECIALIST: [
    'Why did rankings drop?',
    'Which technical issue should I fix first?',
    'Which competitor gap matters most?',
  ],
  CONTENT_MARKETER: [
    'What content should we create?',
    'Which pages should be refreshed?',
    'Where are our content gaps?',
  ],
  MARKETING_MANAGER: [
    'Which channel changed?',
    'What is driving qualified leads?',
    'What should marketing focus on?',
  ],
  AGENCY: [
    'Which client needs attention?',
    'Which websites have critical issues?',
    'What should my team work on today?',
  ],
  ADMIN: [
    'Is the workspace healthy?',
    'Which integrations need attention?',
    'What changed this week?',
  ],
};

/* =========================================================
 * QUICK ACTIONS (navigation to real screens only)
 * ========================================================= */

export interface QuickAction {
  label: string;
  detail: string;
  href: string;
}

export const QUICK_ACTIONS: Record<
  PersonaId,
  QuickAction[]
> = {
  BUSINESS_OWNER: [
    {
      label: 'Review biggest opportunity',
      detail: 'Ranked by business relevance',
      href: '/opportunities',
    },
    {
      label: 'View revenue impact',
      detail: 'Leads, revenue and ROI',
      href: '/leads',
    },
    {
      label: 'Generate executive report',
      detail: 'Share-ready growth report',
      href: '/reports',
    },
    {
      label: 'Review growth changes',
      detail: 'Monitoring timeline',
      href: '/monitoring',
    },
  ],
  SEO_SPECIALIST: [
    {
      label: 'Review technical issues',
      detail: 'Crawl + technical health',
      href: '/technical-seo',
    },
    {
      label: 'Review ranking changes',
      detail: 'Search visibility trends',
      href: '/search-visibility',
    },
    {
      label: 'Review competitor gaps',
      detail: 'Where rivals are ahead',
      href: '/competitors',
    },
    {
      label: 'Create SEO action',
      detail: 'Turn a finding into work',
      href: '/actions',
    },
  ],
  CONTENT_MARKETER: [
    {
      label: 'Review content opportunities',
      detail: 'Create, refresh, expand',
      href: '/content',
    },
    {
      label: 'Check AI visibility gaps',
      detail: 'AEO/GEO exposure',
      href: '/ai-visibility',
    },
    {
      label: 'Review keyword gaps',
      detail: 'Demand you do not cover',
      href: '/keywords',
    },
    {
      label: 'Create content action',
      detail: 'Briefs and refreshes',
      href: '/actions',
    },
  ],
  MARKETING_MANAGER: [
    {
      label: 'Review growth pulse',
      detail: 'Traffic, leads, revenue',
      href: '/analytics',
    },
    {
      label: 'Review channel changes',
      detail: 'Search + AI visibility',
      href: '/search-visibility',
    },
    {
      label: 'Review opportunities',
      detail: 'Cross-module impact',
      href: '/opportunities',
    },
    {
      label: 'Generate marketing report',
      detail: 'Share-ready summary',
      href: '/reports',
    },
  ],
  AGENCY: [
    {
      label: 'Open client attention queue',
      detail: 'Clients needing work',
      href: '/clients',
    },
    {
      label: 'Review urgent opportunities',
      detail: 'Highest impact first',
      href: '/opportunities',
    },
    {
      label: 'Review overdue actions',
      detail: 'Team follow-ups',
      href: '/actions',
    },
    {
      label: 'Generate client report',
      detail: 'Share-ready reporting',
      href: '/reports',
    },
  ],
  ADMIN: [
    {
      label: 'Manage team',
      detail: 'Members, roles, invites',
      href: '/settings',
    },
    {
      label: 'Review integrations',
      detail: 'Google, providers, keys',
      href: '/integrations',
    },
    {
      label: 'Review usage and billing',
      detail: 'Plan, limits, invoices',
      href: '/billing',
    },
    {
      label: 'Check monitoring',
      detail: 'Operational timeline',
      href: '/monitoring',
    },
  ],
};

/* =========================================================
 * PERSONA STATE (server truth, local cache)
 * ========================================================= */

export interface PersonaState {
  persona: PersonaId | null;
  effectivePersona: PersonaId;
  suggestedPersona: PersonaId;
  source: 'selected' | 'default';
  role: string | null;
  personaSelectedAt: string | null;
}

const STORAGE_KEY = 'renkoo_persona_effective';
export const PERSONA_EVENT =
  'renkoo:persona-changed';

function readCached(): PersonaId | null {
  try {
    const raw =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;

    return isPersonaId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function usePersona(): {
  effectivePersona: PersonaId;
  persona: PersonaId | null;
  source: 'selected' | 'default';
  loading: boolean;
  refresh: () => Promise<void>;
  setPersona: (
    persona: PersonaId | null,
  ) => Promise<PersonaResponse>;
} {
  const [state, setState] = useState<{
    effectivePersona: PersonaId;
    persona: PersonaId | null;
    source: 'selected' | 'default';
  }>(() => ({
    effectivePersona:
      readCached() ?? DEFAULT_PERSONA,
    persona: null,
    source: 'default',
  }));
  const [loading, setLoading] =
    useState(true);

  const refresh = useCallback(async () => {
    try {
      const remote: PersonaResponse =
        await fetchPersona();
      const effective = isPersonaId(
        remote.effectivePersona,
      )
        ? remote.effectivePersona
        : DEFAULT_PERSONA;

      setState({
        effectivePersona: effective,
        persona: isPersonaId(remote.persona)
          ? remote.persona
          : null,
        source: remote.source,
      });

      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          effective,
        );
      } catch {
        // Cache is best-effort only.
      }
    } catch {
      // Offline/expired session: keep cached order.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const onChange = () => {
      void refresh();
    };

    window.addEventListener(
      PERSONA_EVENT,
      onChange,
    );

    return () => {
      window.removeEventListener(
        PERSONA_EVENT,
        onChange,
      );
    };
  }, [refresh]);

  const setPersona = useCallback(
    async (persona: PersonaId | null) => {
      const remote: PersonaResponse =
        await savePersona(persona);
      const effective = isPersonaId(
        remote.effectivePersona,
      )
        ? remote.effectivePersona
        : DEFAULT_PERSONA;

      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          effective,
        );
      } catch {
        // Cache is best-effort only.
      }

      window.dispatchEvent(
        new CustomEvent(PERSONA_EVENT),
      );

      return remote;
    },
    [],
  );

  return { ...state, loading, refresh, setPersona };
}
