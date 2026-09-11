'use client';

/*
 * RENKOO Why-Not-#1 Engine 1.0 — evidence-backed
 * diagnosis for one important keyword. Single composed
 * request (GET /keywords/diagnose): GSC + strategy +
 * SERP cache + crawl + links. No new scores, no
 * invented competitors, no ranking guarantees.
 *
 * Hierarchy: KEYWORD+RANKING → PRIMARY DIAGNOSIS →
 * EXPLANATION → ACTION → EVIDENCE → COMPETITORS.
 */

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import AppShell from '@/components/AppShell';
import {
  DataSourceBadge,
  EmptyState,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Panel,
  SecondaryButton,
} from '@/components/ui';
import {
  createAction,
  diagnoseKeyword,
  diagnoseKeywordBatch,
  generateContentBrief,
  getWebsites,
  type KeywordDiagnosis,
  type Website,
} from '@/lib/api';

function fmtPos(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 'unranked';
  return `#${n.toFixed(1).replace(/\.0$/, '')}`;
}

function compactUrl(url: unknown): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '—';
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .slice(0, 72);
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: 'positive' | 'warning' | 'negative' | 'neutral';
}) {
  const cls =
    tone === 'positive'
      ? 'border-rk-success/30 bg-rk-success/10 text-rk-success'
      : tone === 'warning'
        ? 'border-rk-border bg-rk-warningSoft text-rk-warning'
        : tone === 'negative'
          ? 'border-rk-border bg-rk-dangerSoft text-rk-danger'
          : 'border-rk-border bg-rk-soft text-rk-secondary';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-rk-sm border px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function diagnosisLabel(type: unknown): string {
  switch (String(type ?? '').toUpperCase()) {
    case 'INTENT_GAP':
      return 'Intent gap';
    case 'CONTENT_COVERAGE_GAP':
      return 'Content coverage';
    case 'INTERNAL_LINK_GAP':
      return 'Internal links';
    case 'TECHNICAL_BLOCKER':
      return 'Technical blocker';
    case 'AUTHORITY_GAP':
      return 'Authority gap';
    case 'SERP_FORMAT_GAP':
      return 'SERP format';
    case 'FRESHNESS_GAP':
      return 'Freshness';
    case 'CANNIBALIZATION_RISK':
      return 'Cannibalization';
    case 'INSUFFICIENT_DATA':
      return 'Insufficient data';
    default:
      return 'No clear gap';
  }
}

function StatusMark({ state }: { state: string }) {
  if (state === 'OK') {
    return (
      <span aria-hidden className="text-rk-success">
        ✓
      </span>
    );
  }
  if (state === 'ATTENTION') {
    return (
      <span aria-hidden className="text-rk-warning">
        ⚠
      </span>
    );
  }
  return (
    <span aria-hidden className="text-rk-muted">
      ?
    </span>
  );
}

export default function WhyNotNumberOnePage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [diagnosis, setDiagnosis] =
    useState<KeywordDiagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [batch, setBatch] = useState<Array<
    Record<string, any>
  > | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const runDiagnosis = useCallback(
    async (siteId: string, keyword: string) => {
      const clean = keyword.trim();
      if (!siteId || !clean || loading) return;
      setLoading(true);
      setError('');
      setDiagnosis(null);
      try {
        const res = await diagnoseKeyword({
          websiteId: siteId,
          keyword: clean,
        });
        setDiagnosis(res);
      } catch (err: any) {
        setError(
          err?.message || 'Diagnosis failed to load.',
        );
      } finally {
        setLoading(false);
      }
    },
    [loading],
  );

  /* Deep-link support: /why-not-number-one?websiteId=&keyword= */
  useEffect(() => {
    let cancelled = false;
    getWebsites()
      .then((sites) => {
        if (cancelled) return;
        const list = Array.isArray(sites) ? sites : [];
        setWebsites(list);
        const params =
          typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search)
            : null;
        const paramSite = params?.get('websiteId') ?? '';
        const paramKeyword = params?.get('keyword') ?? '';
        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem('renkoo_website_id')
            : null;
        const valid =
          paramSite &&
          list.some((s) => s.id === paramSite)
            ? paramSite
            : stored &&
                list.some((s) => s.id === stored)
              ? stored
              : list[0]?.id || '';
        setWebsiteId(valid);
        if (paramKeyword) {
          setKeywordInput(paramKeyword);
          if (valid)
            void runDiagnosis(valid, paramKeyword);
        }
        setPageLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setWebsites([]);
          setPageLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleWebsiteChange(id: string) {
    setWebsiteId(id);
    setDiagnosis(null);
    setBatch(null);
    if (typeof window !== 'undefined') {
      if (id) localStorage.setItem('renkoo_website_id', id);
      else localStorage.removeItem('renkoo_website_id');
    }
  }

  async function runBatch() {
    if (!websiteId || batchLoading) return;
    setBatchLoading(true);
    setError('');
    try {
      const res = await diagnoseKeywordBatch({
        websiteId,
        limit: 5,
      });
      setBatch(res.diagnoses ?? []);
    } catch (err: any) {
      setError(
        err?.message || 'Batch diagnosis failed.',
      );
    } finally {
      setBatchLoading(false);
    }
  }

  async function createBrief() {
    if (!diagnosis || !websiteId || actionBusy) return;
    setActionBusy(true);
    setActionMsg('');
    setActionErr('');
    try {
      await generateContentBrief({
        websiteId,
        query: diagnosis.keyword,
        page: diagnosis.currentRanking.page ?? undefined,
      });
      setActionMsg('Brief created in the Content Engine.');
    } catch (err: any) {
      setActionErr(
        err?.message || 'Brief creation failed.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function createDiagnosisAction() {
    if (!diagnosis || !websiteId || actionBusy) return;
    setActionBusy(true);
    setActionMsg('');
    setActionErr('');
    try {
      await createAction({
        websiteId,
        type: 'DIAGNOSIS',
        title: `${diagnosis.recommendedAction.label}: “${diagnosis.keyword}”`,
        description: diagnosis.explanation.body,
        url:
          diagnosis.currentRanking.page ?? undefined,
        priority:
          diagnosis.strategy?.priority ?? 'MEDIUM',
        metadata: {
          strategyKeyword: diagnosis.keyword
            .trim()
            .toLowerCase(),
          diagnosis: diagnosis.primaryDiagnosis,
          source: 'WHY_NOT_1',
        },
      });
      setActionMsg(
        'Action created in the Action Engine.',
      );
    } catch (err: any) {
      setActionErr(
        err?.message || 'Action creation failed.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  const activeWebsite =
    websites.find((w) => w.id === websiteId) ?? null;

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Diagnosis"
        title="Why are you not #1?"
        description="Evidence-backed reasons one important keyword ranks where it does — and the exact next step that addresses the biggest gap."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge
              source="GSC + Strategy + Crawl"
              connected={diagnosis !== null}
            />
            {activeWebsite ? (
              <span className="truncate text-xs text-rk-secondary">
                {activeWebsite.name}
              </span>
            ) : null}
          </div>
        }
      />

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex min-h-[44px] items-center gap-2 text-xs font-semibold text-rk-secondary">
          Website
          <select
            value={websiteId}
            onChange={(e) =>
              handleWebsiteChange(e.target.value)
            }
            aria-label="Website"
            className="input w-auto min-h-[44px]"
          >
            {websites.length === 0 ? (
              <option value="">No websites</option>
            ) : null}
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 sm:max-w-md">
          <span className="sr-only">Keyword to diagnose</span>
          <input
            value={keywordInput}
            onChange={(e) =>
              setKeywordInput(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && websiteId) {
                void runDiagnosis(
                  websiteId,
                  keywordInput,
                );
              }
            }}
            placeholder="e.g. crm software for startups"
            className="input min-h-[44px]"
          />
        </label>
        <SecondaryButton
          type="button"
          onClick={() => {
            if (websiteId)
              void runDiagnosis(websiteId, keywordInput);
          }}
          disabled={
            !websiteId || !keywordInput.trim() || loading
          }
        >
          {loading ? 'Diagnosing…' : 'Diagnose'}
        </SecondaryButton>
        <SecondaryButton
          type="button"
          onClick={() => void runBatch()}
          disabled={!websiteId || batchLoading}
        >
          {batchLoading
            ? 'Diagnosing top 5…'
            : 'Diagnose top 5'}
        </SecondaryButton>
      </div>

      {pageLoading || loading ? (
        <div className="mt-4 space-y-4" aria-busy="true">
          <LoadingBlock title="Gathering ranking evidence…" />
          <LoadingBlock
            title="Comparing against SERP and crawl facts…"
            lines={2}
          />
        </div>
      ) : error ? (
        <div className="mt-4">
          <ErrorState
            title="Diagnosis failed to load"
            description={error}
            onRetry={() => {
              if (batch) void runBatch();
              else if (websiteId && keywordInput)
                void runDiagnosis(
                  websiteId,
                  keywordInput,
                );
            }}
          />
        </div>
      ) : diagnosis ? (
        <div className="mt-4 space-y-6">
          {/* 1. KEYWORD + RANKING + PRIMARY DIAGNOSIS */}
          <section aria-label="Diagnosis summary">
            <Panel
              eyebrow="Diagnosis"
              title={diagnosis.explanation.title}
              description={diagnosis.explanation.body}
              actions={
                <span className="flex flex-wrap gap-2">
                  <a
                    href="#diagnosis-evidence"
                    className="rk-focusable rounded-rk-md border border-rk-border bg-white px-4 py-2 text-xs font-bold text-rk-ink"
                  >
                    View evidence
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      void createDiagnosisAction()
                    }
                    disabled={actionBusy || !websiteId}
                    className="rk-focusable rounded-rk-md bg-rk-ink px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {diagnosis.recommendedAction.label}
                  </button>
                </span>
              }
            >
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <p className="text-sm text-rk-secondary">
                  Keyword:{' '}
                  <span className="font-semibold text-rk-ink">
                    {diagnosis.keyword}
                  </span>
                </p>
                <p className="text-sm text-rk-secondary">
                  Your page:{' '}
                  <span className="font-semibold text-rk-ink">
                    {fmtPos(
                      diagnosis.currentRanking.position,
                    )}
                  </span>{' '}
                  {diagnosis.currentRanking.page ? (
                    <span className="break-all text-xs text-rk-muted">
                      {compactUrl(
                        diagnosis.currentRanking.page,
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-rk-muted">
                      page uncertain
                    </span>
                  )}
                </p>
                <p className="flex items-center gap-2 text-sm">
                  <span className="text-rk-secondary">
                    Biggest gap:
                  </span>
                  <Chip
                    label={diagnosisLabel(
                      diagnosis.primaryDiagnosis,
                    )}
                    tone={
                      diagnosis.primaryDiagnosis ===
                        'NO_CLEAR_GAP' ||
                      diagnosis.primaryDiagnosis ===
                        'INSUFFICIENT_DATA'
                        ? 'neutral'
                        : 'warning'
                    }
                  />
                </p>
              </div>
              {/* Phase 11 — persistent rank history (observed only). */}
              {diagnosis.rankHistory &&
              diagnosis.rankHistory.evidenceState !==
                'UNAVAILABLE' ? (
                <p className="mt-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-xs text-rk-secondary">
                  <span className="font-semibold text-rk-ink">
                    Rank history:{' '}
                  </span>
                  {diagnosis.rankHistory.statement}
                </p>
              ) : null}
              {/* Checklist: text + icon, never color alone */}
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {diagnosis.checklist.map((item: any) => (
                  <li
                    key={item.label}
                    className="flex items-start gap-2 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-xs"
                  >
                    <StatusMark state={item.state} />
                    <span>
                      <span className="font-semibold text-rk-ink">
                        {item.label}
                        <span className="sr-only">
                          {item.state === 'OK'
                            ? ' — healthy'
                            : item.state === 'ATTENTION'
                              ? ' — needs attention'
                              : ' — unknown'}
                        </span>
                      </span>
                      <span className="block text-rk-muted">
                        {item.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {actionMsg ? (
                <p
                  role="status"
                  className="mt-2 text-xs font-semibold text-rk-success"
                >
                  {actionMsg}{' '}
                  <Link
                    href="/actions"
                    className="underline"
                  >
                    Open Actions
                  </Link>
                </p>
              ) : null}
              {actionErr ? (
                <p
                  role="alert"
                  className="mt-2 text-xs font-semibold text-rk-danger"
                >
                  {actionErr}
                </p>
              ) : null}
            </Panel>
          </section>

          {/* 2. SECONDARY DIAGNOSES */}
          {diagnosis.secondaryDiagnoses.length > 0 ? (
            <section aria-label="Supporting gaps">
              <Panel
                eyebrow="Also relevant"
                title="Supporting gaps"
                description="Confirmed alongside the primary diagnosis — worth addressing after the biggest gap."
              >
                <ul className="flex flex-wrap gap-2">
                  {diagnosis.secondaryDiagnoses.map(
                    (type: string) => (
                      <li key={type}>
                        <Chip
                          label={diagnosisLabel(type)}
                          tone="neutral"
                        />
                      </li>
                    ),
                  )}
                </ul>
              </Panel>
            </section>
          ) : null}

          {/* 3. STRATEGY + CONTENT PATH */}
          <section aria-label="Strategy and content path">
            <Panel
              eyebrow="Existing path"
              title="Strategy and content"
              description="The diagnosis reuses live Strategy and Content state — nothing here creates a parallel plan."
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-rk-secondary">
                {diagnosis.strategy ? (
                  <>
                    <Chip
                      label={
                        diagnosis.strategy.priority ??
                        'UNRATED'
                      }
                      tone={
                        String(
                          diagnosis.strategy.priority ??
                            '',
                        ).toUpperCase() === 'HIGH'
                          ? 'positive'
                          : String(
                                diagnosis.strategy
                                  .priority ?? '',
                              ).toUpperCase() ===
                              'MEDIUM'
                            ? 'warning'
                            : 'neutral'
                      }
                    />
                    <span>
                      {diagnosis.strategy.bucket ?? ''} ·{' '}
                      {diagnosis.strategy.pageMapping ??
                        ''}
                      {diagnosis.strategy.topic
                        ? ` · ${diagnosis.strategy.topic}`
                        : ''}
                    </span>
                  </>
                ) : (
                  <span>
                    No strategy opportunity for this
                    keyword yet.
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href="/keywords?tab=strategy"
                  className="rk-focusable rounded-rk-md border border-rk-border bg-white px-4 py-2 text-xs font-bold text-rk-ink"
                >
                  Open Strategy
                </Link>
                {diagnosis.content.brief ? (
                  <Link
                    href="/content"
                    className="rk-focusable rounded-rk-md border border-rk-border bg-white px-4 py-2 text-xs font-bold text-rk-ink"
                  >
                    Open existing brief
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => void createBrief()}
                    disabled={actionBusy || !websiteId}
                    className="rk-focusable rounded-rk-md border border-rk-border bg-white px-4 py-2 text-xs font-bold text-rk-ink disabled:opacity-40"
                  >
                    Create content brief
                  </button>
                )}
                <Link
                  href="/content"
                  className="rk-focusable rounded-rk-md border border-rk-border bg-white px-4 py-2 text-xs font-bold text-rk-ink"
                >
                  Open Content
                </Link>
              </div>
            </Panel>
          </section>

          {/* 4. INTERNAL LINK EVIDENCE */}
          <section aria-label="Internal link evidence">
            <Panel
              eyebrow="Link support"
              title="Internal links"
              description="Observed inbound links and verified opportunities for this target — anchors suggested, never observed as recommendations."
            >
              {diagnosis.internalLinks
                .opportunities.length === 0 ? (
                <p className="rk-body">
                  {diagnosis.internalLinks
                    .inboundCount !== null
                    ? `${diagnosis.internalLinks.inboundCount} inbound internal link(s) observed. No open link opportunities for this keyword.`
                    : 'Inbound graph unavailable — run a crawl to observe internal links.'}
                </p>
              ) : (
                <ul className="space-y-2">
                  {diagnosis.internalLinks.opportunities.map(
                    (rec: any, i: number) => (
                      <li
                        key={`${rec.sourceUrl}|${rec.targetUrl}|${i}`}
                        className="rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-xs"
                      >
                        <p className="break-all text-rk-secondary">
                          <span className="font-semibold text-rk-ink">
                            From:
                          </span>{' '}
                          {rec.sourceUrl}
                        </p>
                        <p className="break-all text-rk-secondary">
                          <span className="font-semibold text-rk-ink">
                            Suggested anchor:
                          </span>{' '}
                          “{rec.suggestedAnchor}”
                        </p>
                        {rec.verification ? (
                          <p className="mt-0.5 text-rk-muted">
                            Verification:{' '}
                            {rec.verification.status} ·{' '}
                            {rec.verification.reason}
                          </p>
                        ) : null}
                      </li>
                    ),
                  )}
                </ul>
              )}
              <Link
                href="/keywords?tab=strategy"
                className="rk-focusable mt-2 inline-block text-xs font-bold text-rk-ink underline"
              >
                View link opportunities
              </Link>
            </Panel>
          </section>

          {/* 5. COMPETITORS (compact, expandable) */}
          <section aria-label="Top competitors">
            <Panel
              eyebrow="SERP context"
              title="Who ranks above"
              description={
                diagnosis.serp.available
                  ? 'Cached SERP observation — only observed signals shown.'
                  : 'SERP intelligence is unavailable for this keyword. Nothing was invented.'
              }
            >
              {!diagnosis.serp.available ? (
                <EmptyState
                  title="No cached SERP data"
                  description="Competitor comparison needs a cached SERP observation. Load the SERP from Discover first."
                />
              ) : (
                <ol className="space-y-2">
                  {diagnosis.serp.top.map(
                    (row: any, i: number) => (
                      <li key={`${row.url}-${i}`}>
                        <details className="rounded-rk-sm border border-rk-border bg-white px-3 py-2">
                          <summary className="rk-focusable cursor-pointer text-sm">
                            <span className="rk-number mr-2 text-xs text-rk-muted">
                              #{i + 1}
                            </span>
                            <span className="font-semibold text-rk-ink">
                              {row.domain ?? row.url}
                            </span>{' '}
                            <span className="text-xs text-rk-muted">
                              {row.contentType ?? ''} ·{' '}
                              {row.pageStrength ?? ''}
                            </span>
                          </summary>
                          <div className="mt-1 space-y-0.5 text-xs text-rk-secondary">
                            <p className="break-all">
                              {row.url}
                            </p>
                            {row.title ? (
                              <p>{row.title}</p>
                            ) : null}
                            {row.referringDomains !==
                            null ? (
                              <p>
                                Referring domains:{' '}
                                {row.referringDomains}
                                {row.backlinks !== null
                                  ? ` · Backlinks: ${row.backlinks}`
                                  : ''}
                              </p>
                            ) : (
                              <p>
                                Authority signals
                                unavailable for this
                                result.
                              </p>
                            )}
                          </div>
                        </details>
                      </li>
                    ),
                  )}
                </ol>
              )}
            </Panel>
          </section>

          {/* 6. EVIDENCE (progressive disclosure) */}
          <section
            aria-label="Evidence"
            id="diagnosis-evidence"
          >
            <Panel
              eyebrow="Transparency"
              title="View evidence"
              description="Every claim above traces to one of these rows. Types: VERIFIED (measured), OBSERVED (crawled), INFERRED (rules), ESTIMATED (computed), UNAVAILABLE (missing)."
            >
              <ul className="space-y-1.5">
                {diagnosis.evidence.map(
                  (row: any, i: number) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-rk-ink">
                        {row.source}
                      </span>
                      <span className="min-w-0 flex-1 text-rk-secondary">
                        {row.label}
                      </span>
                      <Chip
                        label={row.evidenceType}
                        tone={
                          row.evidenceType ===
                          'UNAVAILABLE'
                            ? 'neutral'
                            : row.evidenceType ===
                                'VERIFIED'
                              ? 'positive'
                              : 'warning'
                        }
                      />
                      {row.date ? (
                        <span className="tabular-nums text-rk-muted">
                          {String(row.date).slice(0, 10)}
                        </span>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
            </Panel>
          </section>
        </div>
      ) : batch ? (
        <div className="mt-4">
          <Panel
            eyebrow="Batch"
            title={`Top candidates (${batch.length})`}
            description="Each row carries its primary diagnosis and recommended action. Open one for full evidence."
          >
            {batch.length === 0 ? (
              <EmptyState
                title="No candidates with enough evidence"
                description="No high-priority ranking opportunity has enough evidence yet."
              />
            ) : (
              <ul className="space-y-2">
                {batch.map((d: any) => (
                  <li
                    key={d.keyword}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 font-semibold text-rk-ink">
                      {d.keyword}{' '}
                      <span className="font-normal tabular-nums text-rk-muted">
                        {d.position !== null &&
                        d.position !== undefined
                          ? `#${Number(d.position).toFixed(1).replace(/\.0$/, '')}`
                          : 'unranked'}
                      </span>
                    </span>
                    <Chip
                      label={d.primaryDiagnosis}
                      tone="neutral"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setKeywordInput(d.keyword);
                        if (websiteId)
                          void runDiagnosis(
                            websiteId,
                            d.keyword,
                          );
                      }}
                      className="rk-focusable font-bold text-rk-ink underline"
                    >
                      Diagnose
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            title="Diagnose an important keyword"
            description="Enter a keyword above — or run the top-5 batch. Connect Google Search Console first for verified ranking evidence."
            actionLabel="Open integrations"
            actionHref="/integrations"
          />
        </div>
      )}
    </AppShell>
  );
}
