'use client';

/*
 * RENKOO Keyword Research 2.0 — shared client helpers.
 * Labels, tones, CSV export and localStorage persistence
 * for keyword lists + recent research. No metrics are
 * invented here; unavailable metrics render as "—".
 */

import type { ResearchIdea } from '@/lib/api';

export const UNAVAILABLE_LABEL = '—';

export function intentLabel(intent: string): string {
  switch ((intent || '').toUpperCase()) {
    case 'TRANSACTIONAL':
      return 'Transactional';
    case 'COMMERCIAL':
      return 'Commercial';
    case 'NAVIGATIONAL':
      return 'Navigational';
    case 'LOCAL':
      return 'Local';
    case 'COMPARISON':
      return 'Comparison';
    case 'ALTERNATIVES':
      return 'Alternatives';
    case 'PROBLEM_SOLUTION':
      return 'Problem–solution';
    case 'BUYER_RESEARCH':
      return 'Buyer research';
    case 'INFORMATIONAL':
      return 'Informational';
    default:
      return 'Mixed';
  }
}

export function decisionLabel(
  decision: string,
): string {
  switch ((decision || '').toUpperCase()) {
    case 'TARGET_NOW':
      return 'Target now';
    case 'GOOD_OPPORTUNITY':
      return 'Good opportunity';
    case 'WATCH':
      return 'Watch';
    case 'AVOID':
      return 'Avoid';
    default:
      return 'Low priority';
  }
}

export function decisionTone(
  decision: string,
): 'positive' | 'warning' | 'negative' | 'neutral' {
  switch ((decision || '').toUpperCase()) {
    case 'TARGET_NOW':
      return 'positive';
    case 'GOOD_OPPORTUNITY':
      return 'positive';
    case 'WATCH':
      return 'warning';
    case 'AVOID':
      return 'negative';
    default:
      return 'neutral';
  }
}

export function opportunityTone(
  score: number,
): 'positive' | 'warning' | 'neutral' {
  if (score >= 70) return 'positive';
  if (score >= 40) return 'warning';
  return 'neutral';
}

export function bucketLabel(bucket: string): string {
  switch ((bucket || '').toUpperCase()) {
    case 'TARGET_NOW':
      return 'Target now';
    case 'QUICK_WIN':
      return 'Quick win';
    case 'GROW':
      return 'Grow';
    case 'PROTECT':
      return 'Protect';
    case 'CREATE':
      return 'Create content';
    case 'CONSOLIDATE':
      return 'Consolidate';
    case 'MONITOR':
      return 'Monitor';
    default:
      return 'Ignore';
  }
}

export function bucketTone(
  bucket: string,
): 'positive' | 'warning' | 'negative' | 'neutral' {
  switch ((bucket || '').toUpperCase()) {
    case 'TARGET_NOW':
    case 'QUICK_WIN':
      return 'positive';
    case 'GROW':
    case 'CREATE':
      return 'warning';
    case 'IGNORE':
      return 'negative';
    default:
      return 'neutral';
  }
}

export function pageMappingLabel(
  mapping: string,
): string {
  switch ((mapping || '').toUpperCase()) {
    case 'IMPROVE':
      return 'Improve';
    case 'OPTIMIZE':
      return 'Optimize';
    case 'CREATE':
      return 'Create';
    case 'CONSOLIDATE':
      return 'Consolidate';
    case 'PROTECT':
      return 'Protect';
    default:
      return 'Ignore';
  }
}

export function priorityTone(
  priority: string,
): 'positive' | 'warning' | 'neutral' {
  switch ((priority || '').toUpperCase()) {
    case 'HIGH':
      return 'positive';
    case 'MEDIUM':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function evidenceSourceLabel(
  source: string,
): string {
  switch (source) {
    case 'OBSERVED':
      return 'Observed by RENKOO';
    case 'PROVIDER':
      return 'Provider data';
    default:
      return 'RENKOO inference';
  }
}

export function actionTypeLabel(action: string): string {
  switch (action) {
    case 'IMPROVE_PAGE':
      return 'Improve page';
    case 'OPTIMIZE_PAGE':
      return 'Optimize page';
    case 'CREATE_PAGE':
      return 'Create page';
    case 'CONSOLIDATE_PAGES':
      return 'Consolidate pages';
    case 'PROTECT_PAGE':
      return 'Protect page';
    default:
      return 'Track keyword';
  }
}

export function sourceLabel(
  source: string,
): string {
  switch (source) {
    case 'SITE_CORPUS':
      return 'Your site';
    case 'COMPETITOR_CORPUS':
      return 'Competitors';
    case 'DERIVED_FROM_SEED':
      return 'Seed idea';
    default:
      return source;
  }
}

export function categoryLabel(cat: string): string {
  switch (cat) {
    case 'questions':
      return 'Questions';
    case 'long-tail':
      return 'Long-tail';
    case 'comparison':
      return 'Comparison';
    case 'transactional':
      return 'Transactional';
    case 'commercial':
      return 'Commercial';
    case 'problem-aware':
      return 'Problem-aware';
    case 'solution-aware':
      return 'Solution-aware';
    case 'local':
      return 'Local';
    case 'matching':
      return 'Matching';
    case 'informational':
      return 'Informational';
    default:
      return cat;
  }
}

export function fmtVolume(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n >= 1000000)
    return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function trendLabel(trend: unknown): string {
  switch (String(trend ?? '').toLowerCase()) {
    case 'rising':
      return 'Rising';
    case 'declining':
      return 'Declining';
    case 'seasonal':
      return 'Seasonal';
    case 'stable':
      return 'Stable';
    default:
      return '—';
  }
}

export function serpFeatureLabel(type: string): string {
  const t = String(type ?? '')
    .toLowerCase()
    .replace(/_/g, ' ');
  return t
    .split(' ')
    .map((w) =>
      w ? w.charAt(0).toUpperCase() + w.slice(1) : w,
    )
    .join(' ');
}

export function fmtDate(iso: unknown): string {
  if (!iso) return '—';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

/* CSV export — actual data only, unavailable as empty. */
export function ideasToCsv(
  ideas: ResearchIdea[],
): string {
  const header = [
    'Keyword',
    'Intent',
    'Opportunity',
    'Decision',
    'Site pages',
    'Competitors covering',
    'Parent topic',
    'Sources',
    'Volume',
    'KD',
    'CPC',
    'Traffic potential',
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s)
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = ideas.map((i) =>
    [
      i.keyword,
      intentLabel(i.intent),
      i.opportunityScore,
      decisionLabel(i.targetDecision),
      i.sitePages,
      i.competitorCount,
      i.parentTopic,
      i.sources.join('|'),
      i.volume ?? '',
      i.keywordDifficulty ?? '',
      i.cpc ?? '',
      '',
    ]
      .map(esc)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

export function downloadCsv(
  filename: string,
  csv: string,
) {
  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Keyword lists (localStorage, per website). */
export interface KeywordList {
  id: string;
  name: string;
  websiteId: string;
  keywords: string[];
  createdAt: string;
}

function listsKey(websiteId: string) {
  return `renkoo_kw_lists_${websiteId || 'global'}`;
}

export function loadLists(
  websiteId: string,
): KeywordList[] {
  try {
    const raw = localStorage.getItem(
      listsKey(websiteId),
    );
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLists(
  websiteId: string,
  lists: KeywordList[],
) {
  try {
    localStorage.setItem(
      listsKey(websiteId),
      JSON.stringify(lists),
    );
  } catch {
    /* Storage full/blocked — lists stay in memory. */
  }
}

/* Recent research seeds. */
const RECENT_KEY = 'renkoo_kw_recent';

export function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((s) => typeof s === 'string')
      : [];
  } catch {
    return [];
  }
}

export function pushRecent(seed: string) {
  try {
    const next = [
      seed,
      ...loadRecent().filter((s) => s !== seed),
    ].slice(0, 8);
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(next),
    );
  } catch {
    /* ignore */
  }
}
