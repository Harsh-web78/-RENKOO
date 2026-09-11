'use client';

/*
 * AGENT READINESS 1.0 (Phase 15) — page detail section.
 * Evidence-backed diagnostic over existing RENKOO evidence.
 * No scores, no "optimized for AI" claims. Reuses shared
 * UI primitives; mobile-safe; loading/error/empty states.
 */

import { useState } from 'react';
import { getAgentReadiness } from '@/lib/api';
import {
  Panel,
  StatusChip,
  DataSourceBadge,
  FreshnessBadge,
  LoadingBlock,
  ErrorState,
  EmptyState,
  InsightBlock,
  SecondaryButton,
  PrimaryButton,
} from '@/components/ui';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function Row({
  label,
  state,
  evidence,
  source,
  detail,
}: {
  label: string;
  state: unknown;
  evidence: unknown;
  source: unknown;
  detail?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-rk-line py-2 last:border-b-0 sm:flex-row sm:items-center sm:gap-3">
      <div className="sm:w-44 sm:shrink-0">
        <p className="text-sm font-medium text-rk-ink">{label}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip status={str(state) || 'UNKNOWN'} />
        <DataSourceBadge
          source={str(source) || 'Stored evidence'}
          connected={str(evidence) !== 'UNAVAILABLE'}
        />
      </div>
      {detail ? (
        <p className="text-xs text-rk-muted sm:ml-auto sm:max-w-[46%] sm:text-right">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export default function AgentReadinessPanel({
  websiteId,
}: {
  websiteId: string;
}) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  async function run() {
    if (!websiteId || !url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await getAgentReadiness(websiteId, url.trim());
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Agent readiness failed to load.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const diagnosis: any[] = Array.isArray(data?.diagnosis?.reasons)
    ? data.diagnosis.reasons
    : [];
  const strong = [
    data?.discoverability,
    data?.access,
    data?.content,
    data?.entity,
    data?.internalSupport,
  ].filter((s: any) =>
    ['STRONG', 'ACCESSIBLE', 'CLEAR', 'VALID'].includes(str(s?.state)),
  ).length;
  const issues = diagnosis.length;

  return (
    <Panel
      eyebrow="Agent readiness"
      title="Evidence-backed agent readiness"
      description="Can this page be reliably discovered, understood and acted on from the evidence RENKOO holds? Observed signals only — never a promise that AI will recommend it."
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/services"
          inputMode="url"
          aria-label="Page URL"
          className="w-full rounded-lg border border-rk-line bg-white px-3 py-2 text-sm text-rk-ink"
        />
        <div className="flex gap-2">
          <PrimaryButton
            type="button"
            onClick={() => void run()}
            disabled={loading || !url.trim()}
          >
            {loading ? 'Checking…' : 'Check page'}
          </PrimaryButton>
          {data ? (
            <SecondaryButton type="button" onClick={() => setData(null)}>
              Clear
            </SecondaryButton>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-4">
          <LoadingBlock title="Reading stored evidence" />
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <ErrorState
            title="Agent readiness failed to load"
            description={error}
            onRetry={() => void run()}
          />
        </div>
      ) : null}
      {!loading && !error && !data ? (
        <div className="mt-4">
          <EmptyState
            title="No page checked yet"
            description="Enter a page URL to compose discoverability, access, clarity, agent activity and diagnosis from stored evidence."
          />
        </div>
      ) : null}

      {data && !loading ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <FreshnessBadge
              label={`Strong signals: ${strong} · Issues: ${issues} · Freshness: ${str(data?.freshness?.state) || 'UNKNOWN'}`}
            />
            <DataSourceBadge
              source={`Top action: ${str(data?.diagnosis?.suggestedNbaCategory) || 'MONITOR_CHANGE'}`}
              connected={issues === 0}
            />
          </div>

          <Row
            label="1. Discoverability"
            state={data?.discoverability?.state}
            evidence={data?.discoverability?.evidenceState}
            source={data?.discoverability?.source}
            detail={data?.discoverability?.statement}
          />
          <Row
            label="2. Access"
            state={data?.access?.state}
            evidence={data?.access?.evidenceState}
            source={data?.access?.source}
            detail={data?.access?.note}
          />
          <Row
            label="3. Content clarity"
            state={data?.content?.state}
            evidence={data?.content?.evidenceState}
            source={data?.content?.source}
          />
          <Row
            label="4. Entity clarity"
            state={data?.entity?.state}
            evidence={data?.entity?.evidenceState}
            source={data?.entity?.source}
          />
          <Row
            label="5. Offering clarity"
            state={data?.offering?.state}
            evidence={data?.offering?.evidenceState}
            source={data?.offering?.source}
          />
          <Row
            label="6. Supporting evidence"
            state={data?.evidence?.state}
            evidence={data?.evidence?.evidenceState}
            source={data?.evidence?.source}
          />
          <Row
            label="7. Structured data"
            state={data?.structuredData?.state}
            evidence={data?.structuredData?.evidenceState}
            source={data?.structuredData?.source}
            detail={data?.structuredData?.note}
          />
          <Row
            label="8. Internal support"
            state={data?.internalSupport?.state}
            evidence={data?.internalSupport?.evidenceState}
            source={data?.internalSupport?.source}
          />
          <Row
            label="9. Agent activity"
            state={data?.agentActivity?.state}
            evidence={data?.agentActivity?.evidenceState}
            source={data?.agentActivity?.source}
            detail={data?.agentActivity?.note}
          />
          <Row
            label="10. AI citation evidence"
            state={data?.aiCitations?.state}
            evidence={data?.aiCitations?.evidenceState}
            source={data?.aiCitations?.source}
            detail={data?.aiCitations?.note}
          />
          <Row
            label="11. Actionability"
            state={data?.actionability?.state}
            evidence={data?.actionability?.evidenceState}
            source={data?.actionability?.source}
            detail={data?.actionability?.executionNote}
          />
          <Row
            label="12. Freshness"
            state={data?.freshness?.state}
            evidence={data?.freshness?.crawlAgeDays ?? 'UNKNOWN'}
            source="Latest completed crawl"
            detail={data?.freshness?.note}
          />

          <InsightBlock
            eyebrow="Diagnosis"
            title="Why is this page not agent-ready?"
          >
            <ul className="space-y-2">
              {diagnosis.map((d: any, i: number) => (
                <li key={`${str(d?.reason)}-${i}`} className="text-sm">
                  <span className="font-semibold text-rk-ink">
                    {str(d?.reason).replaceAll('_', ' ')}
                  </span>
                  <span className="text-rk-muted">
                    {' — '}
                    {str(d?.statement)}
                  </span>
                </li>
              ))}
              {diagnosis.length === 0 ? (
                <li className="text-sm text-rk-muted">
                  No blocking gap was observed in stored evidence.
                  Unknowns remain unknowns.
                </li>
              ) : null}
            </ul>
          </InsightBlock>
        </div>
      ) : null}
    </Panel>
  );
}
