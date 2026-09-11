'use client';

/*
 * RENKOO Authority Intelligence 1.0 (Phase 18).
 * Decision-first authority evidence: overview, competitor
 * gaps, opportunities, important pages, new/lost,
 * comparison, import, cannot-measure. No backlink index,
 * no DR/DA, no scores, no fake totals.
 */

import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import AppShell from '@/components/AppShell';
import {
  PageHeader,
  Panel,
  Metric,
  StatusChip,
  DataSourceBadge,
  LoadingBlock,
  ErrorState,
  EmptyState,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui';
import {
  confirmAuthorityImport,
  getAuthorityCompetitorGap,
  getAuthorityOpportunities,
  getAuthorityOverview,
  getAuthorityPages,
  getWebsites,
  previewAuthorityImport,
  type Website,
} from '@/lib/api';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

export default function AuthorityPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [overview, setOverview] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [gap, setGap] = useState<any[]>([]);
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importBusy, setImportBusy] = useState(false);

  const load = useCallback(async (siteId: string) => {
    if (!siteId) return;
    setLoading(true);
    setError('');
    try {
      const [ov, opps, intersect, pg] = await Promise.all([
        getAuthorityOverview(siteId).catch(() => null),
        getAuthorityOpportunities(siteId).catch(() => null),
        getAuthorityCompetitorGap(siteId).catch(() => null),
        getAuthorityPages(siteId).catch(() => null),
      ]);
      setOverview(ov);
      setOpportunities(
        Array.isArray(opps?.opportunities)
          ? opps.opportunities
          : [],
      );
      setGap(
        Array.isArray(intersect?.domains)
          ? intersect.domains
          : [],
      );
      setPages(
        Array.isArray(pg?.pages) ? pg.pages : [],
      );
    } catch (err: any) {
      setError(
        err?.message || 'Authority evidence failed to load.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getWebsites()
      .then((sites) => {
        if (cancelled) return;
        const list = Array.isArray(sites) ? sites : [];
        setWebsites(list);
        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem('renkoo_website_id')
            : null;
        const valid =
          stored && list.some((s) => s.id === stored)
            ? stored
            : list[0]?.id || '';
        setWebsiteId(valid);
        if (valid) void load(valid);
        else setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function runPreview() {
    if (!websiteId || !csv.trim()) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      setPreview(await previewAuthorityImport(websiteId, csv));
    } catch (err: any) {
      setPreview({
        error: err?.message || 'Preview failed.',
      });
    } finally {
      setImportBusy(false);
    }
  }

  async function runConfirm() {
    if (!websiteId || !csv.trim()) return;
    setImportBusy(true);
    try {
      const result = await confirmAuthorityImport(
        websiteId,
        csv,
      );
      setImportResult(result);
      setPreview(null);
      void load(websiteId);
    } catch (err: any) {
      setImportResult({
        error: err?.message || 'Import failed.',
      });
    } finally {
      setImportBusy(false);
    }
  }

  const totals = overview?.totals ?? null;
  const hasEvidence =
    (totals?.observedLinks ?? 0) > 0 ||
    opportunities.length > 0;

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Authority"
        title="Authority evidence"
        description="Understand whether link evidence is limiting your search growth — observed evidence only, never invented scores."
        meta={
          <select
            aria-label="Website"
            value={websiteId}
            onChange={(e) => {
              setWebsiteId(e.target.value);
              if (typeof window !== 'undefined')
                localStorage.setItem(
                  'renkoo_website_id',
                  e.target.value,
                );
              if (e.target.value) void load(e.target.value);
            }}
            className="rounded-lg border border-rk-line bg-white px-3 py-2 text-sm text-rk-ink"
          >
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Reading authority evidence" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Authority evidence failed to load"
            description={error}
            onRetry={() => {
              if (websiteId) void load(websiteId);
            }}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* OVERVIEW */}
          <Panel
            eyebrow="Authority evidence"
            title="Observed coverage"
            description={str(
              overview?.coverage?.note ||
                'Backlink intelligence requires a backlink data source.',
            )}
          >
            {totals ? (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Metric
                  label="Observed links"
                  value={str(totals.observedLinks ?? '—')}
                  detail={`Evidence: ${str(overview?.source?.sourceType || 'UNAVAILABLE')}`}
                />
                <Metric
                  label="Referring domains"
                  value={str(totals.observedDomains ?? '—')}
                />
                <Metric
                  label="New evidence"
                  value={str(totals.newEvidence ?? '—')}
                />
                <Metric
                  label="Lost evidence"
                  value={str(totals.lostEvidence ?? '—')}
                />
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <DataSourceBadge
                source={`Source: ${str(overview?.source?.sourceType || 'UNAVAILABLE')}`}
                connected={hasEvidence}
              />
              <StatusChip
                status={str(
                  overview?.diagnosis?.state ||
                    'AUTHORITY_UNAVAILABLE',
                )}
              />
            </div>
            {!hasEvidence ? (
              <div className="mt-3">
                <EmptyState
                  title="Authority evidence is limited"
                  description="RENKOO does not currently have a complete backlink data source for this website. Import backlink data below to enable gap analysis."
                />
              </div>
            ) : null}
          </Panel>

          {/* OPPORTUNITIES */}
          <Panel
            eyebrow="Top authority opportunities"
            title="What to pursue"
            description="Deterministic opportunities from observed evidence. Review manually — no auto-send, no spam."
          >
            {opportunities.length === 0 ? (
              <EmptyState
                title="No link opportunities"
                description="No open link opportunities in stored evidence."
              />
            ) : (
              <ul className="space-y-2">
                {opportunities.slice(0, 10).map((opp: any) => (
                  <li
                    key={opp.id}
                    className="flex flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-semibold text-rk-ink">
                        {str(opp.sourceDomain)} →{' '}
                        {str(opp.targetUrl || 'target page')}
                      </span>
                      <span className="mt-0.5 block text-xs text-rk-muted">
                        {str(opp.opportunityType).replaceAll(
                          '_',
                          ' ',
                        )}{' '}
                        · {str(opp.reason)}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <StatusChip
                        status={str(opp.priority)}
                      />
                      <StatusChip
                        status={str(opp.status)}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* COMPETITOR GAP */}
          <Panel
            eyebrow="Competitor link gaps"
            title="Domains linking to competitors"
            description="Target links not observed in available evidence — not proof they do not exist, and not proof links cause ranking differences."
          >
            {gap.length === 0 ? (
              <EmptyState
                title="No competitor gap evidence"
                description="Import backlink data with competitor tags to compute link intersections."
              />
            ) : (
              <ul className="space-y-2">
                {gap.slice(0, 10).map((entry: any) => (
                  <li
                    key={str(entry.referringDomain)}
                    className="flex flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                  >
                    <span className="break-words text-sm font-semibold text-rk-ink">
                      {str(entry.referringDomain)}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <StatusChip
                        status={str(entry.state)}
                      />
                      <span className="text-xs text-rk-muted">
                        {str(entry.targetNote)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* PAGES */}
          <Panel
            eyebrow="Important pages"
            title="Page link coverage"
            description="Which important pages have search opportunity but limited observed link evidence."
          >
            {pages.length === 0 ? (
              <EmptyState
                title="No page coverage"
                description="No observed page-level link evidence."
              />
            ) : (
              <ul className="space-y-2">
                {pages.slice(0, 8).map((page: any) => (
                  <li
                    key={str(page.url)}
                    className="flex flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-rk-ink">
                        {str(page.url)}
                      </span>
                      <span className="mt-0.5 block text-xs text-rk-muted">
                        {str(page.observedLinks)} links ·{' '}
                        {str(page.observedDomains)} domains ·{' '}
                        {str(page.note)}
                      </span>
                    </span>
                    <StatusChip status={str(page.state)} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* IMPORT */}
          <Panel
            eyebrow="Backlink import"
            title="Import backlink data"
            description="CSV up to 5,000 rows / 10 MB. Preview validates before anything is stored. Charged: false."
          >
            <textarea
              aria-label="Backlink CSV"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="sourceUrl,sourceDomain,targetUrl,anchorText,linkType,nofollow,firstSeen,lastSeen,status,competitor,notes"
              rows={4}
              className="w-full rounded-lg border border-rk-line bg-white px-3 py-2 font-mono text-xs text-rk-ink"
            />
            <div className="mt-2 flex gap-2">
              <SecondaryButton
                type="button"
                onClick={() => void runPreview()}
                disabled={importBusy || !csv.trim()}
              >
                {importBusy ? 'Working…' : 'Preview'}
              </SecondaryButton>
              <PrimaryButton
                type="button"
                onClick={() => void runConfirm()}
                disabled={importBusy || !csv.trim()}
              >
                Confirm import
              </PrimaryButton>
            </div>
            {preview && !preview.error ? (
              <p className="mt-2 text-xs text-rk-muted">
                {str(preview.received)} received ·{' '}
                {str(preview.valid)} valid ·{' '}
                {str(preview.invalid)} invalid ·{' '}
                {str(preview.duplicates)} duplicates
                {preview.truncated ? ' · truncated at 5,000' : ''}.
              </p>
            ) : null}
            {preview?.error ? (
              <p className="mt-2 text-xs text-rk-danger">
                {str(preview.error)}
              </p>
            ) : null}
            {importResult && !importResult.error ? (
              <p className="mt-2 text-xs text-rk-muted">
                {str(importResult.received)} received ·{' '}
                {str(importResult.imported)} imported ·{' '}
                {str(importResult.updated)} updated ·{' '}
                {str(importResult.opportunities)} competitor
                opportunities · {str(importResult.duplicates)}{' '}
                duplicates · {str(importResult.invalid)}{' '}
                invalid · {str(importResult.skipped)} skipped.
              </p>
            ) : null}
            {importResult?.error ? (
              <p className="mt-2 text-xs text-rk-danger">
                {str(importResult.error)}
              </p>
            ) : null}
          </Panel>

          {/* CANNOT MEASURE */}
          <Panel
            eyebrow="Honesty"
            title="What RENKOO cannot measure"
            description="Explicit unavailable evidence — never presented as zero."
          >
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-rk-muted">
              {(overview?.cannotMeasure ?? []).map(
                (line: string, i: number) => (
                  <li key={i}>{line}</li>
                ),
              )}
            </ul>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
