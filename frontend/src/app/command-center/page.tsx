'use client';

/*
 * RENKOO Command Center 1.0 (Phase 17) — "The 5 things
 * most likely to grow your business." Decision UI over
 * existing priorities: do-this-first, top 5, what
 * changed, at risk, working, search→business, health,
 * cannot-measure. No scores, no manufactured tasks.
 */

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import AppShell from '@/components/AppShell';
import LearnTip from '@/components/tour/LearnTip';
import Drawer, {
  DrawerSection,
} from '@/components/ui/Drawer';
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
  getSearchCommandCenter,
  getGrowthNow,
  getGrowthToday,
  getRecentOutcomes,
  getSourceLandscape,
  getFirstValueStatus,
  getWebsites,
  type Website,
} from '@/lib/api';

function str(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

/* Recovery destination per backend missing[] line
 * (display-only mapping; the lines themselves come
 * from the API and are rendered verbatim). */
function missingHref(line: string): string {
  const text = line.toLowerCase();
  if (text.includes('search console')) return '/first-value';
  if (text.includes('business outcome')) return '/leads';
  return '/integrations';
}

function ConnectionsPanel({
  missing,
  connectivity,
}: {
  missing: unknown;
  connectivity: any;
}) {
  const missingLines = Array.isArray(missing)
    ? missing.map(str).filter(Boolean)
    : [];
  const rows: Array<{ label: string; state: string }> = [];
  if (connectivity && typeof connectivity === 'object') {
    for (const [key, label] of [
      ['search', 'Search Console'],
      ['traffic', 'Analytics traffic'],
      ['ai', 'AI monitoring'],
      ['local', 'Business profile'],
      ['authority', 'Authority provider'],
    ] as Array<[string, string]>) {
      const state = str(connectivity[key]);
      if (state) rows.push({ label, state });
    }
  }
  if (missingLines.length === 0 && rows.length === 0) {
    return null;
  }
  return (
    <Panel
      eyebrow="Connections"
      title="Finish connecting your data"
      description="Missing connections limit what RENKOO can observe. Intelligence never blocks on them."
    >
      {missingLines.length > 0 ? (
        <ul className="space-y-2">
          {missingLines.map((line, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center justify-between gap-2 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-sm"
            >
              <span className="font-medium text-rk-ink">
                {line}
              </span>
              <Link href={missingHref(line)}>
                <SecondaryButton type="button">
                  Connect
                </SecondaryButton>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {rows.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <span className="w-36 shrink-0 font-medium text-rk-ink">
                {row.label}
              </span>
              <StatusChip status={row.state} />
            </li>
          ))}
        </ul>
      ) : null}
      {str(connectivity?.href || '/integrations') ? (
        <div className="mt-3">
          <Link
            href={str(connectivity?.href || '/integrations')}
          >
            <SecondaryButton type="button">
              Open integrations
            </SecondaryButton>
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}

export default function CommandCenterPage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [days, setDays] = useState(28);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  /* Phase 34 — top 3 unified decisions alongside the
   * existing command-center composition. Best-effort:
   * never blocks the command center when unavailable. */
  const [growthNow, setGrowthNow] = useState<any[]>([]);
  /* Phase 36 — today's governed work alongside the
   * existing composition. Best-effort: never blocks
   * the command center when unavailable. */
  const [growthToday, setGrowthToday] = useState<any[]>([]);
  /* Phase 37 — outcomes to review (max 3). Best-effort. */
  const [growthOutcomes, setGrowthOutcomes] = useState<any[]>([]);
  /* Phase 39 — source gaps to review (max 3). Best-effort. */
  const [sourceGaps, setSourceGaps] = useState<any[]>([]);
  /* Phase 40 — SETUP REQUIRED when first value is not
   * ready. Best-effort: never blocks intelligence.
   * Phase 41 — fetch failure is tracked separately so
   * setup guidance degrades instead of disappearing. */
  const [firstValue, setFirstValue] = useState<any>(null);
  const [firstValueFailed, setFirstValueFailed] =
    useState(false);

  const load = useCallback(
    async (siteId: string, periodDays: number) => {
      if (!siteId) return;
      setLoading(true);
      setError('');
      try {
        setData(
          await getSearchCommandCenter(siteId, periodDays),
        );
      } catch (err: any) {
        setError(
          err?.message || 'Command Center failed to load.',
        );
      } finally {
        setLoading(false);
      }
      /*
       * Login TTI: the five secondary panels are
       * independent reads (siteId only) — one parallel
       * wave instead of five sequential round trips.
       * Each leg still degrades alone, exactly as
       * before; primary content already rendered above
       * and is never gated on these.
       */
      const [nowRes, todayRes, outcomesRes, landscapeRes, firstValueRes] =
        await Promise.allSettled([
          getGrowthNow(siteId),
          getGrowthToday(siteId),
          getRecentOutcomes(siteId),
          getSourceLandscape(siteId),
          getFirstValueStatus(siteId),
        ]);
      if (nowRes.status === 'fulfilled') {
        const now = nowRes.value;
        setGrowthNow(Array.isArray(now?.now) ? now.now : []);
      } else {
        setGrowthNow([]);
      }
      if (todayRes.status === 'fulfilled') {
        const today = todayRes.value;
        setGrowthToday(
          Array.isArray(today?.today) ? today.today.slice(0, 3) : [],
        );
      } else {
        setGrowthToday([]);
      }
      if (outcomesRes.status === 'fulfilled') {
        const outcomes = outcomesRes.value;
        setGrowthOutcomes(
          Array.isArray((outcomes as any)?.items)
            ? (outcomes as any).items.slice(0, 3)
            : [],
        );
      } else {
        setGrowthOutcomes([]);
      }
      if (landscapeRes.status === 'fulfilled') {
        const landscape = landscapeRes.value;
        const gaps = [
          ...((landscape as any)?.competitorOnly ?? []),
          ...((landscape as any)?.shared ?? []),
        ].slice(0, 3);
        setSourceGaps(gaps);
      } else {
        setSourceGaps([]);
      }
      if (firstValueRes.status === 'fulfilled') {
        setFirstValue(firstValueRes.value);
        setFirstValueFailed(false);
      } else {
        /* Degraded, not hidden: the setup panel below
         * renders retry + setup guidance from here. */
        setFirstValue(null);
        setFirstValueFailed(true);
      }
    },
    [],
  );

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
        if (valid) void load(valid, 28);
        else setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  function handleWebsite(id: string) {
    setWebsiteId(id);
    setData(null);
    setOpenId(null);
    setGrowthNow([]);
    setGrowthToday([]);
    setGrowthOutcomes([]);
    setSourceGaps([]);
    setFirstValue(null);
    setFirstValueFailed(false);
    if (typeof window !== 'undefined')
      localStorage.setItem('renkoo_website_id', id);
    if (id) void load(id, days);
  }

  const opportunities: any[] =
    data?.topOpportunities ?? [];
  const drawerOpp: any =
    opportunities.find((o: any) => o.id === openId) ?? null;
  const doFirst: any = data?.doThisFirst ?? null;
  const doFirstActionable =
    doFirst && str(doFirst.title || doFirst.note) !== '';

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="Command Center"
        title="What should I do?"
        description="Your search growth command center — the highest-value opportunities from everything RENKOO already knows."
        actions={
          <div className="flex gap-2">
            {[7, 28, 90].map((d) => (
              <SecondaryButton
                key={d}
                type="button"
                onClick={() => {
                  setDays(d);
                  setData(null);
                  if (websiteId) void load(websiteId, d);
                }}
                disabled={loading || days === d}
              >
                {d}d
              </SecondaryButton>
            ))}
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Website"
              value={websiteId}
              onChange={(e) => handleWebsite(e.target.value)}
              className="rounded-lg border border-rk-line bg-white px-3 py-2 text-sm text-rk-ink"
            >
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Composing your opportunities" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="Command Center failed to load"
            description={error}
            onRetry={() => {
              if (websiteId) void load(websiteId, days);
            }}
          />
        </div>
      ) : !websiteId ? (
        <div className="mt-6">
          <Panel
            eyebrow="Setup required"
            title="No website yet"
            description="Create a website to unlock your Command Center. Nothing is fabricated before evidence exists."
          >
            <div className="mt-3">
              <Link href="/first-value">
                <PrimaryButton type="button">
                  Go to setup
                </PrimaryButton>
              </Link>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* SETUP REQUIRED — Phase 40 first value.
           * Phase 41: also renders degraded when the
           * status fetch itself failed (retry + setup
           * path instead of silence). */}
          {firstValue && !firstValue.ready ? (
            <Panel
              eyebrow="Setup required"
              title="Finish setup to unlock full intelligence"
              description="Required setup remains. Completed work is never repeated."
            >
              <p className="text-sm text-rk-muted">
                {String(
                  firstValue.continueSetup ??
                    'Continue setup to connect data and build your baseline.',
                )}
              </p>
              {(firstValue.resume ?? []).length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {(firstValue.resume as any[]).map((r: any) => (
                    <li key={r.step} className="flex justify-between gap-2">
                      <span>
                        {r.state === 'SKIPPED' ? '○' : '●'} {String(r.label)}
                      </span>
                      <span className="rk-metadata">{String(r.action)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3">
                <Link href="/first-value">
                  <SecondaryButton type="button">
                    Continue setup
                  </SecondaryButton>
                </Link>
              </div>
            </Panel>
          ) : null}
          {firstValueFailed ? (
            <Panel
              eyebrow="Setup status unavailable"
              title="Could not read setup state"
              description="Intelligence above is unaffected. Retry the check or continue setup directly."
            >
              <div className="mt-3 flex flex-wrap gap-2">
                <SecondaryButton
                  type="button"
                  onClick={() => {
                    if (websiteId) void load(websiteId, days);
                  }}
                >
                  Retry setup check
                </SecondaryButton>
                <Link href="/first-value">
                  <SecondaryButton type="button">
                    Continue setup
                  </SecondaryButton>
                </Link>
              </div>
            </Panel>
          ) : null}

          {/* DO THIS FIRST */}
          <div data-tour="command-center">
          <Panel
            eyebrow="Do this first"
            title={
              doFirst?.title
                ? str(doFirst.title)
                : 'No high-confidence action yet'
            }
            description={
              doFirst?.title
                ? (doFirst.why ?? [])
                    .slice(0, 2)
                    .map(str)
                    .join(' Observed alongside. ')
                : str(
                    doFirst?.note ||
                      'RENKOO is still learning this website.',
                  )
            }
          >
            {doFirstActionable && doFirst?.title ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip
                  status={str(doFirst.priority || 'MEDIUM')}
                />
                <DataSourceBadge
                  source={`Action: ${str(doFirst.actionType)}`}
                  connected={false}
                />
                <span className="text-xs text-rk-muted">
                  {str(doFirst.measurement)}
                </span>
              </div>
            ) : null}
            {/* Phase 41 — the highest-priority decision
             * always carries a primary action into the
             * existing plan → queue flow. */}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/growth-plan">
                <PrimaryButton type="button">
                  Open growth plan
                </PrimaryButton>
              </Link>
              <Link href="/growth-work">
                <SecondaryButton type="button">
                  Open work queue
                </SecondaryButton>
              </Link>
            </div>
          </Panel>
          </div>

          {/* TOP 5 */}
          <div data-tour="top-actions">
          <Panel
            eyebrow="Your next growth decisions"
            title={
              growthNow.length > 0
                ? `Top ${growthNow.length} decisions — ordered by evidence`
                : 'Your next growth decisions'
            }
            description="Unified WHAT → WHY → EVIDENCE → NEXT STEP → STATUS from the growth plan. Deterministic ordering, never scored."
            actions={
              <LearnTip
                label="Growth decisions"
                what="The highest-priority growth decisions, ordered by available evidence."
                why="Focus beats coverage: the top items carry the most observed upside."
                next="Open Evidence on a card to see its reasoning, then send it to the work queue."
              />
            }
          >
            {growthNow.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-rk-muted">
                  No ordered decisions yet — evidence still being composed.
                </span>
                <Link href="/growth-plan">
                  <SecondaryButton type="button">
                    Open growth plan
                  </SecondaryButton>
                </Link>
              </div>
            ) : (
              <ol className="space-y-2">
                {growthNow.map((d: any, i: number) => (
                  <li key={d.fingerprint ?? i}>
                    <div className="rk-focusable flex w-full items-start gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left">
                      <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-rk-ink">
                          {str(d.title)}
                        </span>
                        <span className="mt-0.5 block break-words text-xs text-rk-secondary">
                          {str(d.whyFirst || d.summary)}
                        </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <StatusChip
                              status={str(d.decisionType)}
                            />
                            <StatusChip
                              status={str(d.status).replace(/_/g, ' ')}
                            />
                            <span className="text-xs text-rk-muted">
                              {str(d.nextAction)}
                            </span>
                            {/* Phase 41 — fingerprint
                             * preserved into the plan
                             * drawer; queue stays one
                             * click further, never
                             * bypassed. */}
                            <Link
                              href={
                                d.fingerprint
                                  ? `/growth-plan?fingerprint=${encodeURIComponent(str(d.fingerprint))}`
                                  : '/growth-plan'
                              }
                            >
                              <span className="text-xs font-semibold text-rk-secondary underline underline-offset-2">
                                Evidence
                              </span>
                            </Link>
                          </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
          </div>

          {/* TOP 5 */}
          <Panel
            eyebrow="Today's work"
            title={
              growthToday.length > 0
                ? `Today's work — top ${growthToday.length} governed items`
                : "Today's work"
            }
            description="What the team picks up now: what, why, status, blocker, next step. Planning is not execution."
          >
            {growthToday.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-rk-muted">
                  No governed work queued for today.
                </span>
                <Link href="/growth-work">
                  <SecondaryButton type="button">
                    Open work queue
                  </SecondaryButton>
                </Link>
              </div>
            ) : (
              <ol className="space-y-2">
                {growthToday.map((t: any, i: number) => (
                  <li key={t.fingerprint ?? i}>
                    <div className="rk-focusable flex w-full items-start gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left">
                      <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-rk-ink">
                          {str(t.title)}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusChip
                            status={str(t.status).replace(/_/g, ' ')}
                          />
                          {t.blocker ? (
                            <span className="text-xs text-rk-muted">
                              Blocker: {str(t.blocker).replace(/_/g, ' ')}
                            </span>
                          ) : null}
                          <span className="text-xs text-rk-muted">
                            {str(t.nextStep)}
                          </span>
                          <Link href="/growth-work">
                            <span className="text-xs font-semibold text-rk-secondary underline underline-offset-2">
                              Queue
                            </span>
                          </Link>
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* TOP 5 */}
          <Panel
            eyebrow="Outcomes to review"
            title={
              growthOutcomes.length > 0
                ? `Outcomes to review — ${growthOutcomes.length} observed`
                : 'Outcomes to review'
            }
            description="What changed after completed work, with evidence and next decision. Execution is never confused with outcome."
          >
            {growthOutcomes.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-rk-muted">
                  No measured outcomes yet — verified work still in its window.
                </span>
                <Link href="/growth-work">
                  <SecondaryButton type="button">
                    Open work queue
                  </SecondaryButton>
                </Link>
              </div>
            ) : (
              <ol className="space-y-2">
                {growthOutcomes.map((o: any, i: number) => (
                  <li key={o.actionId ?? i}>
                    <div className="rk-focusable flex w-full items-start gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left">
                      <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-rk-ink">
                          {str(o.title)}
                        </span>
                        <span className="mt-0.5 block break-words text-xs text-rk-secondary">
                          {str(o.headline?.changed ?? o.interpretation)}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusChip
                            status={str(o.signal).replace(/_/g, ' ')}
                          />
                          <span className="text-xs text-rk-muted">
                            Next: {str(o.nextDecision)}
                          </span>
                          <Link href="/growth-work">
                            <span className="text-xs font-semibold text-rk-secondary underline underline-offset-2">
                              Evidence
                            </span>
                          </Link>
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* TOP 5 */}
          <Panel
            eyebrow="Source gaps to review"
            title={
              sourceGaps.length > 0
                ? `Source gaps to review — ${sourceGaps.length} observed`
                : 'Source gaps to review'
            }
            description="Which external sources shape answers and where the brand is missing. Presence is never influence."
          >
            {sourceGaps.length === 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-rk-muted">
                  No observed source gaps — citation landscape still being composed.
                </span>
                <Link href="/source-intelligence">
                  <SecondaryButton type="button">
                    Open source intelligence
                  </SecondaryButton>
                </Link>
              </div>
            ) : (
              <ol className="space-y-2">
                {sourceGaps.map((s: any, i: number) => (
                  <li key={s.fingerprint ?? i}>
                    <div className="rk-focusable flex w-full items-start gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left">
                      <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-rk-ink">
                          {str(s.domain)} — {str(s.presence).replace(/_/g, ' ')}
                        </span>
                        <span className="mt-0.5 block break-words text-xs text-rk-secondary">
                          {str(s.presenceNote)}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-rk-muted">
                            Next: {str(s.opportunity).replace(/_/g, ' ')}
                          </span>
                          <Link href="/source-intelligence">
                            <span className="text-xs font-semibold text-rk-secondary underline underline-offset-2">
                              Evidence
                            </span>
                          </Link>
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* TOP 5 */}
          <Panel
            eyebrow="Top growth opportunities"
            title={`Your top ${opportunities.length} opportunities`}
            description="Opinionated top 5 from existing priorities — never manufactured, never scored."
          >
            {opportunities.length === 0 ? (
              <EmptyState
                title="RENKOO is still learning this website"
                description={(data?.missing ?? [])
                  .map(str)
                  .join(' · ')}
              />
            ) : (
              <ol className="space-y-2">
                {opportunities.map((opp: any, i: number) => (
                  <li key={opp.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(opp.id)}
                      className="rk-focusable flex w-full items-start gap-3 rounded-rk-sm border border-rk-border bg-white px-3 py-2 text-left"
                    >
                      <span className="rk-number mt-0.5 w-5 shrink-0 text-xs text-rk-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-rk-ink">
                          {str(opp.title)}
                        </span>
                        <span className="mt-0.5 block break-words text-xs text-rk-secondary">
                          {(opp.why ?? [])
                            .slice(0, 2)
                            .map(str)
                            .join(' · ')}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-2">
                          <StatusChip
                            status={str(opp.priority)}
                          />
                          <StatusChip
                            status={str(opp.status)}
                          />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {/* CHANGED + RISK */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              eyebrow="What changed"
              title="Observed changes"
              description="Observed alongside current evidence — never claimed as caused by any action."
            >
              {(data?.whatChanged ?? []).length === 0 &&
              (data?.changeDigest ?? []).length === 0 ? (
                <EmptyState
                  title="No changes observed"
                  description="No rank, CTR, AI, lead or revenue changes in this window."
                />
              ) : (
                <ul className="space-y-2">
                  {(data?.changeDigest ?? [])
                    .slice(0, 3)
                    .map((entry: any, i: number) => (
                      <li
                        key={`digest-${i}`}
                        className="text-sm text-rk-secondary"
                      >
                        <span className="font-semibold text-rk-ink">
                          {str(entry.label)}
                        </span>{' '}
                        — {str(entry.detail)}
                      </li>
                    ))}
                  {(data?.whatChanged ?? []).map(
                    (entry: any, i: number) => (
                      <li
                        key={i}
                        className="text-sm text-rk-secondary"
                      >
                        <span className="font-semibold text-rk-ink">
                          {str(entry.label)}
                        </span>{' '}
                        — {str(entry.statement)}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </Panel>
            <Panel
              eyebrow="At risk"
              title="Needs attention"
              description="Compact risk signals. No scores, no probabilities."
            >
              {(data?.atRisk ?? []).length === 0 ? (
                <EmptyState
                  title="Nothing flagged"
                  description="No ranking, CTR, AI or commercial risk observed."
                />
              ) : (
                <ul className="space-y-2">
                  {(data?.atRisk ?? []).map(
                    (risk: any, i: number) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <StatusChip
                          status={str(risk.state)}
                        />
                        <span className="font-semibold text-rk-ink">
                          {str(risk.label)}
                        </span>
                        <span className="w-full text-xs text-rk-muted">
                          {str(risk.detail)}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </Panel>
          </div>

          {/* WORKING */}
          <Panel
            eyebrow="What's working"
            title="Observed wins"
            description="Observed after action — never claimed as caused by it."
          >
            {(data?.working ?? []).length === 0 ? (
              <EmptyState
                title="No wins recorded yet"
                description="Improvements, protected pages and connected outcomes will appear here."
              />
            ) : (
              <ul className="space-y-2">
                {(data?.working ?? []).map(
                  (win: any, i: number) => (
                    <li
                      key={i}
                      className="text-sm text-rk-secondary"
                    >
                      <span className="font-semibold text-rk-ink">
                        {str(win.label)}
                      </span>{' '}
                      — {str(win.detail)}
                    </li>
                  ),
                )}
              </ul>
            )}
          </Panel>

          {/* RECENT WORK */}
          <Panel
            eyebrow="What happened after our work"
            title="Recent measured actions"
            description="Before → after over append-only evidence. Observational — never causal."
          >
            {(data?.recentWork ?? []).length === 0 &&
            (data?.executionAlerts ?? []).length === 0 ? (
              <EmptyState
                title="No measured work yet"
                description="Completed actions with observed measurement will appear here."
              />
            ) : (
              <ul className="space-y-2">
                {(data?.executionAlerts ?? [])
                  .slice(0, 3)
                  .map((alert: any, i: number) => (
                    <li
                      key={`alert-${i}`}
                      className="rounded-rk-sm border border-rk-border bg-rk-soft px-3 py-2"
                    >
                      <span className="block text-sm font-semibold text-rk-ink">
                        {str(alert.label)}
                      </span>
                      <span className="mt-0.5 block text-xs text-rk-muted">
                        {str(alert.detail)}
                      </span>
                    </li>
                  ))}
                {(data?.recentWork ?? []).map(
                  (work: any) => (
                    <li
                      key={str(work.id)}
                      className="flex flex-col gap-1 rounded-rk-sm border border-rk-border bg-white px-3 py-2"
                    >
                      <span className="text-sm font-semibold text-rk-ink">
                        {str(work.title)}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusChip
                          status={str(work.outcomeState)}
                        />
                        <span className="text-xs text-rk-muted">
                          {(work.observedChanges ?? [])
                            .slice(0, 2)
                            .map(
                              (row: any) =>
                                `${str(row.label)}: ${str(row.outcome)}`,
                            )
                            .join(' · ')}
                        </span>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Panel>

          {/* FUNNEL + HEALTH */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel
              eyebrow="Search to business"
              title="Unified funnel"
              description="Every stage carries its own evidence. Unavailable is never zero."
            >
              <ul className="space-y-1">
                {(data?.searchToRevenue ?? []).map(
                  (stage: any) => (
                    <li
                      key={str(stage.stage)}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="w-36 shrink-0 font-medium text-rk-ink">
                        {str(stage.stage).replaceAll(
                          '_',
                          ' ',
                        )}
                      </span>
                      <StatusChip
                        status={str(stage.state)}
                      />
                    </li>
                  ),
                )}
              </ul>
            </Panel>
            <Panel
              eyebrow="Health"
              title="Area status"
              description="Status summaries from existing evidence — not scores."
            >
              <div className="grid grid-cols-2 gap-3">
                {(data?.health ?? []).map((h: any) => (
                  <Metric
                    key={str(h.area)}
                    label={str(h.area)}
                    value={str(h.state)}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={str(
                    data?.roadmapHref || '/roadmap',
                  )}
                >
                  <PrimaryButton type="button">
                    View in roadmap
                  </PrimaryButton>
                </Link>
                <Link
                  href={str(
                    data?.baselineHref ||
                      '/search-baseline',
                  )}
                >
                  <SecondaryButton type="button">
                    All search opportunities
                  </SecondaryButton>
                </Link>
              </div>
            </Panel>
          </div>

          {/* CANNOT MEASURE */}
          <Panel
            eyebrow="Honesty"
            title="What RENKOO cannot measure"
            description="Explicit unavailable evidence — never presented as zero."
          >
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-rk-muted">
              {(data?.cannotMeasure ?? []).map(
                (line: string, i: number) => (
                  <li key={i}>{line}</li>
                ),
              )}
            </ul>
          </Panel>

          {/* CONNECTIONS — Phase 41 renders the backend
           * missing[] + connectivity recovery paths that
           * previously never reached the viewport. */}
          <ConnectionsPanel
            missing={data?.missing}
            connectivity={data?.connectivity}
          />
        </div>
      )}

      {/* DETAIL DRAWER */}
      <Drawer
        open={drawerOpp !== null}
        onClose={() => setOpenId(null)}
        eyebrow={drawerOpp ? str(drawerOpp.category) : ''}
        title={drawerOpp ? str(drawerOpp.title) : ''}
        description="Evidence-backed detail composed from existing systems."
        wide
      >
        {drawerOpp ? (
          <div className="space-y-4">
            <DrawerSection title="Why it matters">
              <ul className="list-disc space-y-1 pl-5 text-sm text-rk-secondary">
                {(drawerOpp.why ?? []).map(
                  (reason: string, i: number) => (
                    <li key={i}>{str(reason)}</li>
                  ),
                )}
              </ul>
              {drawerOpp.conflictNote ? (
                <p className="mt-2 text-sm font-medium text-rk-ink">
                  {str(drawerOpp.conflictNote)}
                </p>
              ) : null}
            </DrawerSection>
            <DrawerSection title="Evidence">
              <ul className="space-y-1">
                {(drawerOpp.evidence ?? []).map(
                  (entry: any, i: number) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <StatusChip
                        status={str(entry.evidenceState)}
                      />
                      <span className="text-rk-secondary">
                        {str(entry.source)} —{' '}
                        {str(entry.label)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </DrawerSection>
            <DrawerSection title="Recommended action">
              <p className="text-sm text-rk-secondary">
                {str(drawerOpp.actionType)} ·{' '}
                {str(drawerOpp.measurement)}
              </p>
              <p className="mt-1 text-xs text-rk-muted">
                Sources:{' '}
                {(drawerOpp.sources ?? [])
                  .map(str)
                  .join(', ')}
              </p>
              {/* Phase 41 — drawer decisions route into
               * the existing plan → queue flow. */}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/growth-plan">
                  <PrimaryButton type="button">
                    Open growth plan
                  </PrimaryButton>
                </Link>
                <Link href="/growth-work">
                  <SecondaryButton type="button">
                    Open work queue
                  </SecondaryButton>
                </Link>
              </div>
            </DrawerSection>
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  );
}
