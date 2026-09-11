'use client';

/*
 * RENKOO — AI Source & Brand Authority Intelligence 1.0 (Phase 39).
 * Understand which sources shape search and AI answers — and where
 * the brand is missing. Presence is never influence; citation is
 * never recommendation. No scores, no outreach automation.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getSourceLandscape,
  getSourceCompetitors,
  getSourceAi,
  getSourceItem,
  getWebsites,
  type SourceLandscape,
  type SourceRow,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import {
  PageHeader,
  Panel,
  DataTable,
  Drawer,
  DrawerSection,
  DrawerMeta,
  SecondaryButton,
  PrimaryButton,
  LoadingBlock,
  ErrorState,
  EmptyState,
  InsightBlock,
  NextAction,
  type DataTableColumn,
} from '@/components/ui';

const STORAGE_KEY = 'renkoo_website_id';

function SourceTable({ rows, caption }: { rows: SourceRow[]; caption: string }) {
  const columns: DataTableColumn<any>[] = [
    {
      key: 'domain',
      label: 'Source',
      priority: 'high',
      render: (r) => (
        <span>
          <span className="font-semibold text-rk-ink">{String(r.domain)}</span>
          <span className="rk-metadata block">{String(r.type).replace(/_/g, ' ')}</span>
        </span>
      ),
    },
    {
      key: 'presence',
      label: 'Presence',
      render: (r) => (
        <span className="block max-w-[260px]" title={String(r.presenceNote)}>
          {String(r.presence).replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'citationsObserved',
      label: 'Citations',
      align: 'right',
      render: (r) => String(r.citationsObserved),
    },
    {
      key: 'opportunity',
      label: 'Opportunity',
      render: (r) => String(r.opportunity).replace(/_/g, ' '),
    },
  ];
  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      keyOf={(r: any) => String(r.fingerprint)}
      emptyTitle="No sources"
      emptyDescription="No observed sources in this group."
      pageSize={10}
    />
  );
}

export default function SourceIntelligencePage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Array<{ id: string; name?: string; url?: string }>>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [landscape, setLandscape] = useState<SourceLandscape | null>(null);
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [ai, setAi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWebsites()
      .then((sites) => {
        if (cancelled) return;
        const list = Array.isArray(sites) ? sites : [];
        setWebsites(list);
        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem(STORAGE_KEY)
            : null;
        const valid =
          stored && list.some((s: any) => s.id === stored)
            ? stored
            : list[0]?.id || '';
        setWebsiteId(valid);
      })
      .catch(() => {
        if (!cancelled) setWebsites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (siteId: string) => {
    if (!siteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [l, c, a] = await Promise.all([
        getSourceLandscape(siteId),
        getSourceCompetitors(siteId).catch(() => null),
        getSourceAi(siteId).catch(() => null),
      ]);
      setLandscape(l);
      setCompetitors(Array.isArray((c as any)?.competitors) ? (c as any).competitors : []);
      setAi(a);
    } catch (e: any) {
      setError(e?.message || 'Source intelligence failed to load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(websiteId);
  }, [websiteId, load]);

  async function openDetail(domain: string) {
    if (!websiteId) return;
    setDetailLoading(true);
    try {
      setDetail(await getSourceItem(websiteId, domain));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Source intelligence"
        title="Source intelligence"
        description="Understand which sources shape search and AI answers — and where your brand is missing."
        actions={
          <div className="flex gap-2">
            <select
              aria-label="Website"
              className="rk-focusable min-w-0 rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-sm"
              value={websiteId}
              onChange={(e) => {
                setWebsiteId(e.target.value);
                if (typeof window !== 'undefined' && e.target.value) {
                  localStorage.setItem(STORAGE_KEY, e.target.value);
                }
              }}
            >
              <option value="">Select website</option>
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || w.url || w.id}
                </option>
              ))}
            </select>
            <Link href="/decision-gap">
              <PrimaryButton type="button">Decision gaps</PrimaryButton>
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Mapping source landscape" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Source intelligence failed to load"
            description={error}
            onRetry={() => void load(websiteId)}
          />
        </div>
      ) : landscape ? (
        <>
          <section aria-label="Source landscape" className="mt-6">
            <Panel
              eyebrow="Source landscape"
              title={`${landscape.totals.sources} observed sources`}
              description={landscape.note}
            >
              <p className="rk-metadata">
                Ours {landscape.totals.ours} · Competitor-only {landscape.totals.competitorOnly} ·
                Shared {landscape.totals.shared} · {landscape.totals.prompts} prompts · Engines{' '}
                {landscape.totals.engines.join(', ') || 'none observed'}
              </p>
              <p className="rk-metadata mt-1">{landscape.diversityNote}</p>
              {landscape.unknowns.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-rk-muted">
                  {landscape.unknowns.map((u, i) => (
                    <li key={i}>· {u}</li>
                  ))}
                </ul>
              ) : null}
            </Panel>
          </section>

          <div className="mt-4">
            <Panel
              eyebrow="Competitor-only sources"
              title="Where competitors appear and we do not"
              description="Observed sources only — never claimed as the cause of advantage."
            >
              {landscape.competitorOnly.length === 0 ? (
                <EmptyState
                  title="No competitor-only sources"
                  description="No observed source carries competitors without us."
                />
              ) : (
                <SourceTable rows={landscape.competitorOnly} caption="Competitor-only sources" />
              )}
            </Panel>
          </div>

          <div className="mt-4">
            <Panel
              eyebrow="Shared sources"
              title="Where both appear"
              description="Often more actionable than new sources. Presence says nothing about sentiment."
            >
              {landscape.shared.length === 0 ? (
                <EmptyState
                  title="No shared sources"
                  description="No observed source carries both us and competitors."
                />
              ) : (
                <SourceTable rows={landscape.shared} caption="Shared sources" />
              )}
            </Panel>
          </div>

          <div className="mt-4">
            <Panel
              eyebrow="Our sources"
              title="Existing authority and source presence"
              description="Evidence of where the brand already appears."
            >
              {landscape.ours.length === 0 ? (
                <EmptyState
                  title="No own sources observed"
                  description="The brand does not appear in observed citations or SERP snapshots."
                />
              ) : (
                <SourceTable rows={landscape.ours} caption="Our sources" />
              )}
            </Panel>
          </div>

          {ai ? (
            <div className="mt-4">
              <Panel
                eyebrow="AI citation sources"
                title="Prompts, citations, recommendation state"
                description="Recommendation stays unknown unless a source provides it."
              >
                {(ai.prompts ?? []).length === 0 ? (
                  <EmptyState
                    title="No AI prompt evidence"
                    description="No recorded AI checks for this website."
                  />
                ) : (
                  <ul className="space-y-2">
                    {(ai.prompts as any[]).slice(0, 10).map((p: any, i: number) => (
                      <li key={i} className="rounded-rk-md border border-rk-border p-3">
                        <p className="text-sm font-semibold">{String(p.prompt)}</p>
                        <p className="rk-metadata mt-1">
                          Engines {(p.engines ?? []).join(', ') || '—'} · Mentioned{' '}
                          {String(p.ourMentioned)} · Cited {String(p.ourCited)} ·
                          Recommendation {String(p.recommendation)}
                        </p>
                        {(p.ourUrls ?? []).length > 0 ? (
                          <p className="rk-metadata mt-1">URLs: {(p.ourUrls as string[]).join(', ')}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                {(ai.unknowns ?? []).length > 0 ? (
                  <p className="rk-metadata mt-2">{(ai.unknowns as string[]).join(' ')}</p>
                ) : null}
              </Panel>
            </div>
          ) : null}

          {competitors.length > 0 ? (
            <div className="mt-4">
              <Panel
                eyebrow="Competitor sources"
                title="Observed competitor source footprints"
                description="Per-domain observed sources. Observed only."
              >
                <ul className="space-y-2">
                  {competitors.slice(0, 10).map((c: any) => (
                    <li key={c.domain} className="rounded-rk-md border border-rk-border p-3">
                      <p className="text-sm font-semibold">{c.domain}</p>
                      <p className="rk-metadata mt-1">
                        {c.sources} source(s) · prompts {(c.prompts ?? []).slice(0, 4).join('; ')}
                      </p>
                      <button
                        type="button"
                        className="rk-focusable mt-1 text-xs font-semibold text-rk-secondary underline underline-offset-2"
                        onClick={() => void openDetail(c.domain)}
                      >
                        Open source detail
                      </button>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          ) : null}
        </>
      ) : null}

      <Drawer
        open={detail !== null}
        onClose={() => setDetail(null)}
        eyebrow="Source detail"
        title={String(detail?.domain ?? 'Source')}
        description="Type, presence, citation, evidence, existing work, next decision. No score."
      >
        {detailLoading && !detail ? (
          <LoadingBlock title="Loading source" />
        ) : detail ? (
          <>
            <DrawerMeta
              items={[
                { label: 'Type', value: String(detail.type).replace(/_/g, ' ') },
                { label: 'Presence', value: String(detail.presence).replace(/_/g, ' ') },
                { label: 'Citations', value: String(detail.citationsObserved) },
                { label: 'Trust', value: detail.trust },
                { label: 'Freshness', value: detail.freshness },
                { label: 'Opportunity', value: String(detail.opportunity).replace(/_/g, ' ') },
              ]}
            />
            <DrawerSection title="Evidence">
              <p className="text-sm text-rk-muted">{detail.presenceNote}</p>
              <p className="rk-metadata mt-1">{detail.freshnessNote}</p>
              <p className="rk-metadata mt-1">{detail.claimSupport}</p>
              {(detail.buyerCriteria ?? []).length > 0 ? (
                <p className="rk-metadata mt-1">
                  Buyer criteria in prompts: {detail.buyerCriteria.join(', ')}
                </p>
              ) : null}
              {(detail.gaps ?? []).length > 0 ? (
                <p className="mt-1 text-sm">Gaps: {(detail.gaps as string[]).join(', ')}</p>
              ) : null}
            </DrawerSection>
            <DrawerSection title="Agency summary">
              <ul className="space-y-1 text-sm text-rk-muted">
                {(detail.agency ?? []).map((line: string, i: number) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </DrawerSection>
            <DrawerSection title="Existing work">
              {(detail.relatedWork ?? []).length === 0 ? (
                <p className="text-sm text-rk-muted">
                  NO_EXISTING_WORK — investigation label only, nothing auto-created.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {(detail.relatedWork as any[]).map((w: any) => (
                    <li key={w.id}>
                      {String(w.title)} ({String(w.status)})
                      {detail.work ? ` — ${String((detail.work as any).section)}` : ''}
                      {detail.outcome ? ` — outcome ${String((detail.outcome as any).signal)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex gap-2">
                <Link href="/decision-gap">
                  <SecondaryButton type="button">Open decision gaps</SecondaryButton>
                </Link>
                <Link href="/growth-work">
                  <SecondaryButton type="button">Open work queue</SecondaryButton>
                </Link>
              </div>
              <p className="rk-metadata mt-2">{detail.outreachBan}</p>
            </DrawerSection>
          </>
        ) : null}
      </Drawer>
    </AppShell>
  );
}
