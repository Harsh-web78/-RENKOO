'use client';

/*
 * RENKOO — Guided First-Value Sequencer 1.0 (Phase 40).
 * WEBSITE → CRAWL → GSC → PROPERTY → GA4 → PROPERTY →
 * BASELINE → TOP 3 → FIRST_VALUE_READY → Command Center.
 *
 * Steps reflect actual state from the status API. Skips
 * persist and resurface as CONTINUE SETUP. FAILED never
 * becomes COMPLETED. No fake progress, no fake
 * completion, no new intelligence.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getFirstValueStatus,
  recordFirstValueEvent,
  getWebsites,
  createWebsite,
  startCrawl,
  connectGoogle,
  getGoogleProperties,
  selectGoogleProperty,
  getGoogleAnalyticsProperties,
  selectGoogleAnalyticsProperty,
  type FirstValueStatus,
} from '@/lib/api';
import AppShell from '@/components/AppShell';
import {
  PageHeader,
  Panel,
  SecondaryButton,
  PrimaryButton,
  LoadingBlock,
  ErrorState,
  EmptyState,
  InsightBlock,
} from '@/components/ui';

const STORAGE_KEY = 'renkoo_website_id';

const STEP_LABELS: Record<string, string> = {
  WEBSITE: 'Website',
  CRAWL: 'Crawl',
  GSC_CONNECT: 'Connect GSC',
  GSC_PROPERTY: 'Select property',
  GA4_CONNECT: 'Connect GA4',
  GA4_PROPERTY: 'Select GA4 property',
  BASELINE: 'Baseline',
  TOP_ACTIONS: 'Top actions',
};

function stateChip(state: string) {
  const tone =
    state === 'COMPLETED'
      ? 'bg-emerald-50 text-emerald-700'
      : state === 'FAILED' || state === 'BLOCKED'
        ? 'bg-red-50 text-red-700'
        : state === 'SKIPPED'
          ? 'bg-amber-50 text-amber-700'
          : state === 'IN_PROGRESS'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-slate-100 text-rk-secondary';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>
      {state.replace(/_/g, ' ')}
    </span>
  );
}

export default function FirstValuePage() {
  const [navOpen, setNavOpen] = useState(false);
  const [websites, setWebsites] = useState<Array<{ id: string; name?: string; url?: string }>>([]);
  const [websiteId, setWebsiteId] = useState('');
  const [status, setStatus] = useState<FirstValueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [opError, setOpError] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [properties, setProperties] = useState<any[]>([]);
  const [gaProperties, setGaProperties] = useState<any[]>([]);
  const [readyFired, setReadyFired] = useState(false);
  /* Phase 41 — OAuth return signal (?google=connected|error).
   * Display-only: step state always comes from status(). */
  const [googleSignal, setGoogleSignal] = useState<
    'connected' | 'error' | null
  >(null);

  const loadWebsites = useCallback(async () => {
    try {
      const sites = await getWebsites();
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
      return valid;
    } catch {
      setWebsites([]);
      return '';
    }
  }, []);

  const loadStatus = useCallback(async (siteId: string, fresh = false) => {
    if (!siteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      /* Phase 41 (Group I): cached by default; fresh
       * after explicit actions and manual Refresh. */
      const s = await getFirstValueStatus(siteId, fresh);
      setStatus(s);
      if (s.ready && !readyFired) {
        setReadyFired(true);
        void recordFirstValueEvent(siteId, {
          kind: 'FIRST_VALUE_READY',
          status: 'COMPLETED',
        }).catch(() => null);
      }
    } catch (e: any) {
      setError(e?.message || 'First-value status failed to load.');
    } finally {
      setLoading(false);
    }
  }, [readyFired]);

  useEffect(() => {
    void (async () => {
      /* OAuth callback lands back here with ?google=…
       * Read it once, then drop it from the URL so a
       * reload never replays the signal. */
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(
          window.location.search,
        );
        const signal = params.get('google');
        if (signal === 'connected' || signal === 'error') {
          setGoogleSignal(signal);
          params.delete('google');
          const clean =
            `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
          window.history.replaceState(null, '', clean);
        }
      }
      const valid = await loadWebsites();
      if (valid) {
        void recordFirstValueEvent(valid, {
          kind: 'ONBOARDING_START',
          status: 'STARTED',
        }).catch(() => null);
        void loadStatus(valid);
      } else {
        setLoading(false);
      }
    })();
  }, [loadWebsites, loadStatus]);

  function pickWebsite(id: string) {
    setWebsiteId(id);
    setReadyFired(false);
    if (typeof window !== 'undefined' && id) {
      localStorage.setItem(STORAGE_KEY, id);
    }
    void loadStatus(id);
  }

  async function record(step: string, st: string) {
    if (!websiteId) return;
    try {
      await recordFirstValueEvent(websiteId, {
        kind: 'ONBOARDING_STEP',
        step,
        status: st,
      });
    } catch {
      /* event recording never blocks the flow */
    }
    void loadStatus(websiteId);
  }

  async function handleCreateWebsite() {
    if (!name.trim() || !url.trim() || busy) return;
    setBusy('website');
    setOpError('');
    try {
      const site: any = await createWebsite({
        name: name.trim(),
        url: url.trim(),
      });
      const id = String(site?.id ?? site?.website?.id ?? '');
      setName('');
      setUrl('');
      if (id) {
        await loadWebsites();
        pickWebsite(id);
      } else {
        void loadWebsites();
      }
    } catch (e: any) {
      setOpError(e?.message || 'Website creation failed.');
    } finally {
      setBusy('');
    }
  }

  async function handleCrawl() {
    if (!websiteId || busy) return;
    setBusy('crawl');
    setOpError('');
    try {
      await record('CRAWL', 'STARTED');
      await startCrawl(websiteId);
      await record('CRAWL', 'COMPLETED');
    } catch (e: any) {
      setOpError(e?.message || 'Crawl failed to start.');
      await record('CRAWL', 'FAILED');
    } finally {
      setBusy('');
      void loadStatus(websiteId, true);
    }
  }

  async function handleGoogleConnect() {
    setBusy('gsc');
    setOpError('');
    try {
      const res: any = await connectGoogle('first-value');
      const target =
        String(res?.authorizationUrl ?? res?.url ?? '');
      if (target && typeof window !== 'undefined') {
        window.location.href = target;
        return;
      }
      setOpError('Google did not return an authorization URL.');
    } catch (e: any) {
      setOpError(e?.message || 'Google connection failed.');
    } finally {
      setBusy('');
    }
  }

  async function handleSkip(step: string) {
    await record(step, 'SKIPPED');
  }

  async function loadPropertyPickers() {
    try {
      const [props, gaProps] = await Promise.all([
        getGoogleProperties().catch(() => []),
        getGoogleAnalyticsProperties().catch(() => []),
      ]);
      setProperties(Array.isArray(props) ? props : []);
      setGaProperties(Array.isArray(gaProps) ? gaProps : []);
    } catch {
      /* pickers stay empty with honest copy */
    }
  }

  useEffect(() => {
    if (websiteId) void loadPropertyPickers();
  }, [websiteId]);

  async function handleSelectProperty(siteUrl: string) {
    if (!siteUrl || busy) return;
    setBusy('gsc-prop');
    setOpError('');
    try {
      await selectGoogleProperty(siteUrl);
      await record('GSC_PROPERTY', 'COMPLETED');
      await record('GSC_CONNECT', 'COMPLETED');
    } catch (e: any) {
      setOpError(e?.message || 'Property selection failed.');
      await record('GSC_PROPERTY', 'FAILED');
    } finally {
      setBusy('');
      void loadStatus(websiteId, true);
    }
  }

  async function handleSelectGaProperty(propertyId: string) {
    if (!propertyId || busy) return;
    setBusy('ga-prop');
    setOpError('');
    try {
      await selectGoogleAnalyticsProperty(propertyId);
      await record('GA4_PROPERTY', 'COMPLETED');
      await record('GA4_CONNECT', 'COMPLETED');
    } catch (e: any) {
      setOpError(e?.message || 'GA4 property selection failed.');
      await record('GA4_PROPERTY', 'FAILED');
    } finally {
      setBusy('');
      void loadStatus(websiteId, true);
    }
  }

  const steps = status?.steps ?? [];
  const current =
    steps.find(
      (s) =>
        s.required &&
        s.state !== 'COMPLETED' &&
        (s.state === 'NOT_STARTED' ||
          s.state === 'FAILED' ||
          s.state === 'SKIPPED' ||
          s.state === 'IN_PROGRESS'),
    ) ??
    steps.find((s) => s.state !== 'COMPLETED') ??
    null;

  return (
    <AppShell
      mobileOpen={navOpen}
      onClose={() => setNavOpen(false)}
      onMenu={() => setNavOpen(true)}
    >
      <PageHeader
        eyebrow="First value"
        title="Get to your first baseline"
        description="One guided flow: website, crawl, connections, baseline, top 3 actions. Skips resurface — nothing fakes completion."
        actions={
          <div className="flex gap-2">
            <select
              aria-label="Website"
              className="rk-focusable min-w-0 rounded-rk-md border border-rk-border bg-rk-surface px-3 py-2 text-sm"
              value={websiteId}
              onChange={(e) => pickWebsite(e.target.value)}
            >
              <option value="">Select website</option>
              {websites.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || w.url || w.id}
                </option>
              ))}
            </select>
            <SecondaryButton
              type="button"
              onClick={() => void loadStatus(websiteId, true)}
            >
              Refresh
            </SecondaryButton>
          </div>
        }
      />

      {status?.continueSetup ? (
        <div className="mt-4">
          <InsightBlock eyebrow="Continue setup" title="Setup is not complete">
            {status.continueSetup}
            <span className="rk-metadata mt-1 block">
              Completed work is never repeated — only remaining blockers are listed below.
            </span>
          </InsightBlock>
        </div>
      ) : null}

      {status?.deadEnd?.dead ? (
        <div className="mt-4">
          <InsightBlock eyebrow="Dead end detected" title={String(status.deadEnd.pattern).replace(/_/g, ' ')}>
            {String(status.deadEnd.recovery ?? '')}
          </InsightBlock>
        </div>
      ) : null}

      {opError ? (
        <p className="mt-4 rounded-rk-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {opError}
        </p>
      ) : null}

      {googleSignal === 'connected' ? (
        <p className="mt-4 rounded-rk-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Google account connected — select your Search Console
          property below to continue. Connection state is verified
          from the status API, never from this message.
        </p>
      ) : null}

      {googleSignal === 'error' ? (
        <p className="mt-4 rounded-rk-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Google connection was not completed — you can retry
          below or skip and continue setup.
        </p>
      ) : null}

      {loading ? (
        <div className="mt-6">
          <LoadingBlock title="Reading setup state" />
        </div>
      ) : error ? (
        <div className="mt-6">
          <ErrorState
            title="First-value status failed"
            description={error}
            onRetry={() => void loadStatus(websiteId)}
          />
        </div>
      ) : !websiteId ? (
        <div className="mt-6">
          <Panel
            eyebrow="Step 1 of 6"
            title="Create your website"
            description="Everything starts with a website record. No baseline is fabricated before evidence exists."
          >
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                aria-label="Website name"
                className="input flex-1"
                placeholder="Acme Inc"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                aria-label="Website URL"
                className="input flex-1"
                placeholder="https://acme.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <PrimaryButton
                type="button"
                onClick={() => void handleCreateWebsite()}
              >
                {busy === 'website' ? 'Creating…' : 'Create website'}
              </PrimaryButton>
            </div>
          </Panel>
        </div>
      ) : status?.ready ? (
        <div className="mt-6 space-y-4">
          <Panel
            eyebrow="First value ready"
            title={`Your baseline for ${status.website.name || status.website.url}`}
            description="Reached through real data readiness — not screen completion."
          >
            <p className="text-sm text-rk-muted">{status.baseline.label}</p>
            <p className="rk-metadata mt-1">{status.progress.label}</p>
          </Panel>
          <Panel
            eyebrow="What matters most"
            title="Top 3 actions"
            description="Existing top actions surfaced — nothing invented."
          >
            {status.topActions.length === 0 ? (
              <EmptyState
                title="No action available"
                description={status.noActionAvailable ?? 'No supported action yet.'}
              />
            ) : (
              <ul className="space-y-2">
                {status.topActions.map((a, i) => (
                  <li key={a.id} className="rounded-rk-md border border-rk-border p-3">
                    <p className="text-sm">
                      <span className="rk-number mr-2 text-rk-muted">{String(i + 1).padStart(2, '0')}</span>
                      <span className="font-semibold text-rk-ink">{a.title}</span>{' '}
                      <span className="rk-metadata">[{a.priority}]</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              {/* Phase 41 — the primary post-ready
               * transition: Command Center is the
               * canonical home from here. */}
              <p className="text-sm text-rk-muted">
                Your primary home from here: what changed,
                what matters, what to do, what is blocked,
                what happened.
              </p>
              <div className="mt-2">
                <Link href="/command-center">
                  <PrimaryButton type="button">
                    Open your Command Center
                  </PrimaryButton>
                </Link>
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <Panel
            eyebrow="Progress"
            title={status ? status.progress.label : 'Setup progress'}
            description="Completed required steps only — no fake percentages."
          >
            <ol className="space-y-2">
              {steps.map((s) => (
                <li
                  key={s.step}
                  className="flex flex-wrap items-center gap-2 rounded-rk-md border border-rk-border p-3"
                >
                  <span className="text-sm font-semibold">
                    {STEP_LABELS[s.step] ?? s.step}
                  </span>
                  {stateChip(s.state)}
                  {!s.required ? (
                    <span className="rk-metadata">optional</span>
                  ) : null}
                  <span className="w-full text-sm text-rk-muted">{s.why}</span>
                  {s.step === 'WEBSITE' && s.state !== 'COMPLETED' ? (
                    <span className="flex w-full flex-col gap-2 sm:flex-row">
                      <input
                        aria-label="Website name"
                        className="input flex-1"
                        placeholder="Acme Inc"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <input
                        aria-label="Website URL"
                        className="input flex-1"
                        placeholder="https://acme.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                      <PrimaryButton
                        type="button"
                        onClick={() => void handleCreateWebsite()}
                      >
                        {busy === 'website' ? 'Creating…' : 'Create'}
                      </PrimaryButton>
                    </span>
                  ) : null}
                  {s.step === 'CRAWL' &&
                  (s.state === 'NOT_STARTED' || s.state === 'FAILED') ? (
                    <SecondaryButton
                      type="button"
                      onClick={() => void handleCrawl()}
                    >
                      {busy === 'crawl'
                        ? 'Starting…'
                        : s.state === 'FAILED'
                          ? 'Retry crawl'
                          : 'Run crawl'}
                    </SecondaryButton>
                  ) : null}
                  {s.step === 'GSC_CONNECT' && s.state !== 'COMPLETED' ? (
                    <span className="flex gap-2">
                      <PrimaryButton
                        type="button"
                        onClick={() => void handleGoogleConnect()}
                      >
                        {busy === 'gsc' ? 'Connecting…' : 'Connect Google'}
                      </PrimaryButton>
                      <SecondaryButton
                        type="button"
                        onClick={() => void handleSkip('GSC_CONNECT')}
                      >
                        Skip for now
                      </SecondaryButton>
                    </span>
                  ) : null}
                  {s.step === 'GSC_PROPERTY' &&
                  (s.state === 'NOT_STARTED' || s.state === 'FAILED') ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Search Console property"
                        className="input"
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) void handleSelectProperty(e.target.value);
                        }}
                      >
                        <option value="">Select property…</option>
                        {properties.map((p: any) => (
                          <option key={String(p.siteUrl || p.url || p.id)} value={String(p.siteUrl || p.url || p.id)}>
                            {String(p.siteUrl || p.url || p.id)}
                          </option>
                        ))}
                      </select>
                      <SecondaryButton
                        type="button"
                        onClick={() => void handleSkip('GSC_PROPERTY')}
                      >
                        Skip for now
                      </SecondaryButton>
                    </span>
                  ) : null}
                  {(s.step === 'GA4_CONNECT' || s.step === 'GA4_PROPERTY') &&
                  s.state !== 'COMPLETED' &&
                  s.state !== 'BLOCKED' ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {s.step === 'GA4_CONNECT' ? (
                        <SecondaryButton
                          type="button"
                          onClick={() => void handleGoogleConnect()}
                        >
                          {busy === 'gsc' ? 'Connecting…' : 'Connect Google'}
                        </SecondaryButton>
                      ) : null}
                      {s.step === 'GA4_PROPERTY' && gaProperties.length > 0 ? (
                        <select
                          aria-label="Analytics property"
                          className="input"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) void handleSelectGaProperty(e.target.value);
                          }}
                        >
                          <option value="">Select GA4 property…</option>
                          {gaProperties.map((p: any) => (
                            <option key={String(p.propertyId || p.id)} value={String(p.propertyId || p.id)}>
                              {String(p.displayName || p.propertyId || p.id)}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <SecondaryButton
                        type="button"
                        onClick={() => void handleSkip(s.step)}
                      >
                        Skip (optional)
                      </SecondaryButton>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
            {current ? (
              <p className="rk-metadata mt-2">
                Current focus: {STEP_LABELS[current.step] ?? current.step} —{' '}
                {current.next ?? current.why}
              </p>
            ) : null}
          </Panel>

          {(status?.resume ?? []).length > 0 ? (
            <Panel
              eyebrow="Resume"
              title="Continue setup"
              description="Only remaining blockers. Completed work is never repeated."
            >
              <ul className="space-y-1 text-sm">
                {(status?.resume ?? []).map((r) => (
                  <li key={r.step} className="flex justify-between gap-2">
                    <span>
                      {r.state === 'SKIPPED' ? '○' : '●'} {r.label}
                    </span>
                    <span className="rk-metadata">{r.action}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
