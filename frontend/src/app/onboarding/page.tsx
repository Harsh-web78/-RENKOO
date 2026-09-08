'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import {
  connectGoogle,
  createWebsite,
  startCrawl,
  getGoogleConnectionStatus,
  getWebsites,
  isLimitError,
  limitDetails,
  limitUsageText,
} from '../../lib/api';
import { limitTitle } from '../../lib/plans';
import { readRememberedSnapshotDomain } from '../../lib/snapshot';
import PersonaSelector from '../../components/PersonaSelector';

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('India');

  const [websiteCreated, setWebsiteCreated] =
    useState(false);

  const [firstCrawlResult, setFirstCrawlResult] =
    useState<Awaited<ReturnType<typeof startCrawl>> | null>(null);

  const [googleConnected, setGoogleConnected] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [googleLoading, setGoogleLoading] =
    useState(false);

  const [existingCount, setExistingCount] =
    useState<number | null>(null);

  const [error, setError] = useState('');
  const [limitError, setLimitError] =
    useState<unknown>(null);

  /*
   * Snapshot handoff endpoint: prefill the website URL field
   * from a remembered, validated snapshot domain — only when
   * the field is still empty. Nothing is created automatically;
   * the normal website-creation flow stays authoritative.
   */
  useEffect(() => {
    try {
      const remembered =
        readRememberedSnapshotDomain();
      if (remembered) {
        setUrl((current) =>
          current.trim()
            ? current
            : `https://${remembered}`,
        );
      }
    } catch {
      // prefill must never break onboarding
    }
  }, []);

  // Honest OAuth-return + existing-website handling.
  // Reads only real signals: URL params from the Google redirect
  // and the real connection/website status from the API.
  useEffect(() => {
    let cancelled = false;

    async function checkReturnState() {
      let googleSignal = false;

      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(
          window.location.search,
        );

        googleSignal =
          params.get('google') === 'connected' ||
          params.get('connected') === 'true' ||
          params.get('google_connected') === 'true' ||
          params.get('step') === '3';
      }

      try {
        const websites = await getWebsites();

        if (cancelled) return;

        setExistingCount(
          Array.isArray(websites)
            ? websites.length
            : 0,
        );

        // A returning user already has a website; treat the
        // website step as satisfied without inventing data.
        if (
          Array.isArray(websites) &&
          websites.length > 0
        ) {
          setWebsiteCreated(true);
        }
      } catch {
        if (!cancelled) setExistingCount(0);
      }

      try {
        const status =
          await getGoogleConnectionStatus();

        if (cancelled) return;

        if (status?.connected) {
          setGoogleConnected(true);

          // OAuth redirect lands back here with a fresh state;
          // advance honestly only when Google is really connected.
          if (googleSignal) setStep(3);
        } else if (googleSignal) {
          // Redirect signal without a real connection:
          // keep the Skip flow, do not claim a connection.
          setGoogleConnected(false);
        }
      } catch {
        // No signal exists — keep Skip flow, Step-3 card
        // renders from real status only (defaults to "Connect later").
      }
    }

    checkReturnState();

    return () => {
      cancelled = true;
    };
  }, []);

  function normalizeUrl(value: string) {
    let finalUrl = value.trim();

    if (
      finalUrl &&
      !finalUrl.startsWith('http://') &&
      !finalUrl.startsWith('https://')
    ) {
      finalUrl = `https://${finalUrl}`;
    }

    return finalUrl;
  }

  async function handleWebsiteSubmit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    setError('');

    const cleanName = name.trim();
    const cleanUrl = normalizeUrl(url);

    if (cleanName.length < 2) {
      setError(
        'Please enter a valid business or website name.',
      );
      return;
    }

    if (!cleanUrl) {
      setError(
        'Please enter your website URL.',
      );
      return;
    }

    try {
      setLoading(true);
      setLimitError(null);

      const createdWebsite = await createWebsite({
        name: cleanName,
        url: cleanUrl,
        industry:
          industry.trim() || undefined,
        country:
          country.trim() || undefined,
      });

      setWebsiteCreated(true);

      const crawlResult = await startCrawl(createdWebsite.id);
      setFirstCrawlResult(crawlResult);

      setStep(2);
    } catch (err) {
      console.error(err);

      if (isLimitError(err)) {
        setLimitError(err);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Could not add your website.',
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleConnect() {
    try {
      setGoogleLoading(true);
      setError('');

      const response =
        await connectGoogle();

      if (
        !response?.authorizationUrl
      ) {
        throw new Error(
          'Google authorization URL was not returned.',
        );
      }

      window.location.href =
        response.authorizationUrl;
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Could not connect Google Search Console.',
      );

      setGoogleLoading(false);
    }
  }

  function finishSetup() {
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="rk-page min-h-screen bg-rk-bg px-4 py-10 sm:px-5">
      <div className="mx-auto max-w-3xl">

        {/* BRAND */}
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-[16px] bg-rk-ink text-2xl font-black text-white shadow-rk-md">
            R
          </div>

          <p className="rk-label mt-5">Onboarding</p>

          <h1 className="mx-auto mt-1 max-w-xl text-3xl font-extrabold tracking-[-0.03em] text-rk-ink">
            Set up your RENKOO workspace
          </h1>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-rk-secondary">
            Connect your business and data so RENKOO
            can start finding growth opportunities.
          </p>
        </div>

        {/* PROGRESS */}
        <div className="mx-auto mt-8 flex max-w-xl items-center justify-center">
          <StepIndicator
            number={1}
            label="Website"
            active={step === 1}
            completed={step > 1}
          />

          <div
            className={`h-px w-16 sm:w-24 ${
              step > 1
                ? 'bg-rk-accent'
                : 'bg-rk-border'
            }`}
          />

          <StepIndicator
            number={2}
            label="Google"
            active={step === 2}
            completed={step > 2}
          />

          <div
            className={`h-px w-16 sm:w-24 ${
              step > 2
                ? 'bg-rk-accent'
                : 'bg-rk-border'
            }`}
          />

          <StepIndicator
            number={3}
            label="Ready"
            active={step === 3}
            completed={false}
          />
        </div>

        {/* ERROR */}
        {error && (
          <div className="mx-auto mt-6 max-w-2xl rounded-rk-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {limitError ? (
          <div className="mx-auto mt-6 max-w-2xl rounded-rk-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-bold text-amber-900">
              {limitTitle(
                limitDetails(limitError)?.planCode,
              )}
            </p>

            <p className="mt-1">
              This workspace already uses its
              included website slot. Your
              existing data is untouched.
              {limitUsageText(limitError)
                ? ` ${limitUsageText(limitError)}.`
                : ''}
            </p>

            <a
              href="/billing"
              className="mt-3 inline-flex items-center gap-2 rounded-rk-md bg-rk-ink px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              View plans
            </a>
          </div>
        ) : null}

        {/* ================================================= */}
        {/* STEP 1 */}
        {/* ================================================= */}

        {step === 1 && (
          <section className="mt-8 rounded-rk-lg border border-rk-border bg-white p-6 shadow-sm sm:p-8">

            <div className="mb-7 flex items-start gap-4 rounded-rk-md bg-rk-infoSoft p-5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-rk-md bg-white text-rk-accent">
                <Globe2 size={21} />
              </div>

              <div>
                <div className="font-bold text-rk-ink">
                  Add your first website
                </div>

                <p className="mt-1 text-xs leading-5 text-rk-secondary">
                  This becomes the primary website
                  RENKOO will analyze and grow.
                  You can add more websites later.
                </p>
              </div>
            </div>

            {existingCount !== null &&
              existingCount > 0 && (
                <div className="mb-5 rounded-rk-md border border-rk-border bg-rk-successSoft p-5">
                  <div className="text-sm font-bold text-rk-success">
                    You already have{' '}
                    {existingCount} website
                    {existingCount === 1
                      ? ''
                      : 's'}
                  </div>

                  <p className="mt-1 text-xs leading-5 text-rk-success">
                    You can continue with your
                    existing workspace or add
                    another website below.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <a
                      href="/dashboard"
                      className="rounded-rk-md bg-rk-success px-5 py-3 text-center text-sm font-bold text-white transition hover:opacity-90"
                    >
                      Open Growth Command Center
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        setWebsiteCreated(true);
                        setStep(2);
                      }}
                      className="rounded-rk-md border border-rk-border bg-white px-5 py-3 text-sm font-semibold text-rk-success transition hover:bg-rk-successSoft"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

            <form
              onSubmit={handleWebsiteSubmit}
              className="space-y-5"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-rk-ink">
                  Business / Website Name
                </label>

                <input
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="Example: SmileCare Dental"
                  required
                  minLength={2}
                  className="w-full rounded-rk-md border border-rk-border bg-white px-4 py-3 text-sm outline-none transition focus:border-rk-ink focus:ring-2 focus:ring-rk-border"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-rk-ink">
                  Website URL
                </label>

                <div className="relative">
                  <Globe2
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-rk-muted"
                  />

                  <input
                    type="text"
                    value={url}
                    onChange={(event) =>
                      setUrl(event.target.value)
                    }
                    placeholder="https://example.com"
                    required
                    className="w-full rounded-rk-md border border-rk-border bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-rk-ink focus:ring-2 focus:ring-rk-border"
                  />
                </div>

                <p className="mt-2 text-xs text-rk-muted">
                  Example: https://beecreativess.com
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-rk-ink">
                    Industry
                  </label>

                  <input
                    value={industry}
                    onChange={(event) =>
                      setIndustry(event.target.value)
                    }
                    placeholder="Dental, SaaS, Restaurant..."
                    className="w-full rounded-rk-md border border-rk-border bg-white px-4 py-3 text-sm outline-none transition focus:border-rk-ink focus:ring-2 focus:ring-rk-border"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-rk-ink">
                    Country
                  </label>

                  <input
                    value={country}
                    onChange={(event) =>
                      setCountry(event.target.value)
                    }
                    placeholder="India"
                    className="w-full rounded-rk-md border border-rk-border bg-white px-4 py-3 text-sm outline-none transition focus:border-rk-ink focus:ring-2 focus:ring-rk-border"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-rk-md bg-rk-ink px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                    Connecting website...
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </section>
        )}

        {/* ================================================= */}
        {/* STEP 2 */}
        {/* ================================================= */}

        {step === 2 && (
          <section className="mt-8 rounded-rk-lg border border-rk-border bg-white p-6 shadow-sm sm:p-8">

            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-rk-md bg-rk-successSoft text-rk-success">
                <CheckCircle2 size={28} />
              </div>

              <h2 className="mt-5 text-xl font-bold text-rk-ink">
                Website connected
              </h2>

              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-rk-secondary">
                Now connect Google Search Console to
                bring real search performance data into
                RENKOO.
              </p>
            </div>

            <div className="mt-8 rounded-rk-md border border-rk-border p-5">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-rk-md bg-rk-infoSoft text-rk-accent">
                  <Search size={23} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-bold text-rk-ink">
                    Google Search Console
                  </div>

                  <p className="mt-1 text-xs leading-5 text-rk-secondary">
                    RENKOO can use impressions, clicks,
                    CTR, rankings and search queries to
                    identify real growth opportunities.
                  </p>

                  <div className="mt-4 grid gap-2 text-xs text-rk-secondary sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-rk-success"
                      />
                      Search performance
                    </div>

                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-rk-success"
                      />
                      Keyword opportunities
                    </div>

                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-rk-success"
                      />
                      Ranking data
                    </div>

                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-rk-success"
                      />
                      Search queries
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleGoogleConnect}
                disabled={googleLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-rk-md bg-rk-ink px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {googleLoading ? (
                  <>
                    <Loader2
                      size={18}
                      className="animate-spin"
                    />
                    Connecting Google...
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    Connect Google Search Console
                  </>
                )}
              </button>

              <button
                onClick={() => setStep(3)}
                disabled={googleLoading}
                className="rounded-rk-md border border-rk-border bg-white px-5 py-3.5 text-sm font-semibold text-rk-secondary transition hover:bg-rk-soft disabled:opacity-50"
              >
                Skip for now
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-rk-muted">
              You can connect Google later from
              Integrations.
            </p>
          </section>
        )}

        {/* ================================================= */}
        {/* STEP 3 */}
        {/* ================================================= */}

        {step === 3 && (
          <section className="mt-8 rounded-rk-lg border border-rk-border bg-white p-6 shadow-sm sm:p-8">

            {firstCrawlResult && (
              <div className="mb-8 overflow-hidden rounded-rk-md border border-rk-border bg-rk-soft">
                <div className="border-b border-rk-border px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-rk-accent">
                    First crawl complete
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-rk-ink">
                    Your first growth snapshot
                  </h3>
                  <p className="mt-1 text-sm text-rk-secondary">
                    RENKOO has analyzed your website and created your technical baseline.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-px bg-rk-border sm:grid-cols-4">
                  <div className="bg-rk-surface p-4">
                    <p className="text-xs font-semibold text-rk-secondary">SEO score</p>
                    <p className="mt-1 text-3xl font-black text-rk-ink">
                      {firstCrawlResult.summary.score}
                      <span className="ml-1 text-sm font-semibold text-rk-muted">/100</span>
                    </p>
                  </div>

                  <div className="bg-rk-surface p-4">
                    <p className="text-xs font-semibold text-rk-secondary">Pages analyzed</p>
                    <p className="mt-1 text-3xl font-black text-rk-ink">
                      {firstCrawlResult.pagesCrawled}
                    </p>
                  </div>

                  <div className="bg-rk-surface p-4">
                    <p className="text-xs font-semibold text-rk-secondary">Open issues</p>
                    <p className="mt-1 text-3xl font-black text-rk-ink">
                      {firstCrawlResult.summary.open}
                    </p>
                  </div>

                  <div className="bg-rk-surface p-4">
                    <p className="text-xs font-semibold text-rk-secondary">Critical issues</p>
                    <p className="mt-1 text-3xl font-black text-rk-ink">
                      {firstCrawlResult.summary.critical}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-rk-md bg-rk-soft text-rk-accent">
                <Sparkles size={30} />
              </div>

              <h2 className="mt-5 text-2xl font-bold text-rk-ink">
                Your RENKOO workspace is ready
              </h2>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-rk-secondary">
                Your website is connected. You can now
                start auditing your website and building
                your growth strategy.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <SetupCard
                icon={<Globe2 size={20} />}
                title="Website"
                description={
                  websiteCreated ||
                  (existingCount !== null &&
                    existingCount > 0)
                    ? 'Connected'
                    : 'Not added yet'
                }
              />

              <SetupCard
                icon={<Search size={20} />}
                title="Search data"
                description={
                  googleConnected
                    ? 'Connected'
                    : 'Connect later'
                }
              />
            </div>

            <div className="mt-4 rounded-rk-md border border-rk-border p-5">
              <div className="font-bold text-rk-ink">
                Choose your role focus
              </div>

              <p className="mt-1 text-xs leading-5 text-rk-secondary">
                This only changes ordering and
                emphasis across RENKOO. It never
                changes what you are allowed to do.
              </p>

              <div className="mt-3">
                <PersonaSelector />
              </div>
            </div>

            <div className="mt-4 rounded-rk-md border border-rk-border p-5">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-rk-md bg-rk-infoSoft text-rk-accent">
                  <ShieldCheck size={23} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-bold text-rk-ink">
                    What to do next
                  </div>

                  <p className="mt-1 text-xs leading-5 text-rk-secondary">Your first crawl is complete. Use your snapshot above to decide what to improve first.</p>

                  <div className="mt-4 grid gap-2">
                    <a
                      href="/dashboard"
                      className="flex items-center justify-between gap-2 rounded-rk-md bg-rk-ink px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                    >
                      Open Growth Command Center
                      <ArrowRight size={16} />
                    </a>

                    <a
                      href="/technical-seo"
                      className="flex items-center justify-between gap-2 rounded-rk-md border border-rk-border bg-white px-4 py-3 text-sm font-semibold text-rk-ink transition hover:bg-rk-soft"
                    >
                      View your technical findings
                      Technical SEO
                      <ArrowRight size={16} />
                    </a>

                    <a
                      href="/opportunities"
                      className="flex items-center justify-between gap-2 rounded-rk-md border border-rk-border bg-white px-4 py-3 text-sm font-semibold text-rk-ink transition hover:bg-rk-soft"
                    >
                      See first opportunities
                      <ArrowRight size={16} />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={finishSetup}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-rk-md bg-rk-ink px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              Go to RENKOO
              <ArrowRight size={18} />
            </button>
          </section>
        )}

        <p className="mt-6 text-center text-xs text-rk-muted">
          You can change your website and connections
          later from your RENKOO workspace.
        </p>
      </div>
    </main>
  );
}

function StepIndicator({
  number,
  label,
  active,
  completed,
}: {
  number: number;
  label: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`grid h-9 w-9 place-items-center rounded-full text-xs font-bold ${
          completed
            ? 'bg-rk-success text-white'
            : active
              ? 'bg-rk-ink text-white'
              : 'bg-rk-soft text-rk-muted'
        }`}
      >
        {completed ? (
          <CheckCircle2 size={17} />
        ) : (
          number
        )}
      </div>

      <span
        className={`text-[10px] font-semibold ${
          active
            ? 'text-rk-ink'
            : 'text-rk-muted'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function SetupCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-rk-md border border-rk-border bg-rk-soft p-4">
      <div className="grid h-10 w-10 place-items-center rounded-rk-md bg-white text-rk-accent">
        {icon}
      </div>

      <div className="mt-3 text-sm font-bold text-rk-ink">
        {title}
      </div>

      <div className="mt-1 text-xs text-rk-secondary">
        {description}
      </div>
    </div>
  );
}





