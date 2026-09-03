'use client';

import { useState } from 'react';
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
} from '../../lib/api';

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

  const [googleConnected, setGoogleConnected] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [googleLoading, setGoogleLoading] =
    useState(false);

  const [error, setError] = useState('');

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

      await createWebsite({
        name: cleanName,
        url: cleanUrl,
        industry:
          industry.trim() || undefined,
        country:
          country.trim() || undefined,
      });

      setWebsiteCreated(true);
      setStep(2);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Could not add your website.',
      );
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
    router.push('/');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10">
      <div className="mx-auto max-w-3xl">

        {/* BRAND */}
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-2xl font-black text-white">
            R
          </div>

          <h1 className="mt-5 text-3xl font-bold text-slate-900">
            Set up your RENKOO workspace
          </h1>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
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
                ? 'bg-blue-500'
                : 'bg-slate-200'
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
                ? 'bg-blue-500'
                : 'bg-slate-200'
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
          <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ================================================= */}
        {/* STEP 1 */}
        {/* ================================================= */}

        {step === 1 && (
          <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">

            <div className="mb-7 flex items-start gap-4 rounded-2xl bg-blue-50 p-5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-blue-600">
                <Globe2 size={21} />
              </div>

              <div>
                <div className="font-bold text-slate-900">
                  Add your first website
                </div>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  This becomes the primary website
                  RENKOO will analyze and grow.
                  You can add more websites later.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleWebsiteSubmit}
              className="space-y-5"
            >
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Website URL
                </label>

                <div className="relative">
                  <Globe2
                    size={18}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    type="text"
                    value={url}
                    onChange={(event) =>
                      setUrl(event.target.value)
                    }
                    placeholder="https://example.com"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <p className="mt-2 text-xs text-slate-400">
                  Example: https://beecreativess.com
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                    Industry
                  </label>

                  <input
                    value={industry}
                    onChange={(event) =>
                      setIndustry(event.target.value)
                    }
                    placeholder="Dental, SaaS, Restaurant..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                    Country
                  </label>

                  <input
                    value={country}
                    onChange={(event) =>
                      setCountry(event.target.value)
                    }
                    placeholder="India"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
          <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">

            <div className="text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 size={28} />
              </div>

              <h2 className="mt-5 text-xl font-bold text-slate-900">
                Website connected
              </h2>

              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                Now connect Google Search Console to
                bring real search performance data into
                RENKOO.
              </p>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Search size={23} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900">
                    Google Search Console
                  </div>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    RENKOO can use impressions, clicks,
                    CTR, rankings and search queries to
                    identify real growth opportunities.
                  </p>

                  <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-emerald-600"
                      />
                      Search performance
                    </div>

                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-emerald-600"
                      />
                      Keyword opportunities
                    </div>

                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-emerald-600"
                      />
                      Ranking data
                    </div>

                    <div className="flex items-center gap-2">
                      <CheckCircle2
                        size={14}
                        className="text-emerald-600"
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
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Skip for now
              </button>
            </div>

            <p className="mt-4 text-center text-xs text-slate-400">
              You can connect Google later from
              Integrations.
            </p>
          </section>
        )}

        {/* ================================================= */}
        {/* STEP 3 */}
        {/* ================================================= */}

        {step === 3 && (
          <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">

            <div className="text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-50 to-violet-50 text-blue-600">
                <Sparkles size={30} />
              </div>

              <h2 className="mt-5 text-2xl font-bold text-slate-900">
                Your RENKOO workspace is ready
              </h2>

              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Your website is connected. You can now
                start auditing your website and building
                your growth strategy.
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <SetupCard
                icon={<Globe2 size={20} />}
                title="Website"
                description="Connected"
              />

              <SetupCard
                icon={<ShieldCheck size={20} />}
                title="Technical SEO"
                description="Ready to audit"
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

            <button
              onClick={finishSetup}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-700"
            >
              Go to RENKOO
              <ArrowRight size={18} />
            </button>
          </section>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
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
            ? 'bg-emerald-500 text-white'
            : active
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-400'
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
            ? 'text-slate-900'
            : 'text-slate-400'
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
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-blue-600">
        {icon}
      </div>

      <div className="mt-3 text-sm font-bold text-slate-900">
        {title}
      </div>

      <div className="mt-1 text-xs text-slate-500">
        {description}
      </div>
    </div>
  );
}