/*
 * RENKOO public AI Visibility Snapshot — tiny unauthenticated client.
 * No auth token is attached; the backend treats this as anonymous.
 */

function apiBase(): string {
  const configured = (
    process.env.NEXT_PUBLIC_API_URL ?? ''
  ).replace(/\/+$/, '');
  if (configured) return configured;
  return 'http://localhost:4000/api';
}

export interface SnapshotResultItem {
  prompt: string;
  provider: string;
  providerDisplayName: string;
  model?: string;
  resultType?: string;
  resultLabel?: string;
  mentioned: boolean | null;
  excerpt: string;
  competitorMentions: unknown[];
  error?: string;
}

export interface SnapshotReport {
  domain: string;
  normalizedDomain: string;
  brand?: string;
  brandConfidence?: string;
  enginesTested: string[];
  enginesUnavailable: Array<{
    id: string;
    displayName: string;
    state: string;
    reason: string;
  }>;
  prompts: string[];
  results: SnapshotResultItem[];
  summary?: {
    mentionedCount: number;
    totalChecks: number;
    note: string;
  };
  competitorsNote?: string;
  citationsNote?: string;
  citationsReason?: string;
  providerStates?: unknown;
  generatedAt: string;
  cached: boolean;
  limits?: Record<string, unknown>;
  cta?: { label: string; href: string };
}

export const SNAPSHOT_DOMAIN_STORAGE_KEY =
  'renkoo_snapshot_domain';

/*
 * Client-side mirror of the backend domain guard (defense in
 * depth for the signup handoff only — the backend re-validates
 * everything). Returns '' for anything that is not a plausible
 * public domain.
 */
export function normalizeSnapshotDomain(
  input: unknown,
): string {
  if (typeof input !== 'string') return '';
  let value = input.trim().toLowerCase();
  if (!value || value.length > 253) return '';
  if (value.includes('@')) return '';
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const hash = value.indexOf('#');
  if (hash !== -1) value = value.slice(0, hash);
  const query = value.indexOf('?');
  if (query !== -1) value = value.slice(0, query);
  const slash = value.indexOf('/');
  if (slash !== -1) value = value.slice(0, slash);
  if (value.startsWith('www.')) value = value.slice(4);
  value = value.replace(/\.*$/, '');
  if (!value || value.length > 253) return '';
  if (
    !/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.[a-z]{2,63}$/.test(
      value,
    )
  ) {
    return '';
  }
  if (
    value === 'localhost' ||
    /(^|\.)localhost$/.test(value) ||
    /(^|\.)(local|internal|invalid|example|test)$/.test(value)
  ) {
    return '';
  }
  return value;
}

export function rememberSnapshotDomain(
  domain: string,
): void {
  try {
    const clean = normalizeSnapshotDomain(domain);
    if (clean) {
      window.localStorage.setItem(
        SNAPSHOT_DOMAIN_STORAGE_KEY,
        clean,
      );
    }
  } catch {
    // storage must never break signup
  }
}

export function readRememberedSnapshotDomain(): string {
  try {
    return normalizeSnapshotDomain(
      window.localStorage.getItem(
        SNAPSHOT_DOMAIN_STORAGE_KEY,
      ) ?? '',
    );
  } catch {
    return '';
  }
}

export async function runSnapshot(
  domain: string,
): Promise<SnapshotReport> {
  const response = await fetch(
    `${apiBase()}/snapshot/ai-visibility`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain }),
      cache: 'no-store',
    },
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.message === 'string'
        ? data.message
        : Array.isArray(data?.message)
          ? data.message.join(', ')
          : `Snapshot failed with status ${response.status}`;
    const error = new Error(message) as Error & {
      status?: number;
      code?: string;
    };
    error.status = response.status;
    error.code =
      typeof data?.code === 'string'
        ? data.code
        : undefined;
    throw error;
  }

  return data as SnapshotReport;
}
