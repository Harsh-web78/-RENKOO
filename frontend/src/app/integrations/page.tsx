'use client';

import { useEffect, useState } from 'react';

import {
  CheckCircle2,
  ExternalLink,
  Globe2,
  Loader2,
  Menu,
  RefreshCw,
} from 'lucide-react';

import Sidebar from '../../components/Sidebar';

import {
  connectGoogle,
  getGoogleConnectionStatus,
  getGoogleProperties,
  selectGoogleProperty,
  getGoogleAnalyticsProperties,
  selectGoogleAnalyticsProperty,
  GoogleProperty,
  GoogleAnalyticsProperty,
} from '../../lib/api';

export default function IntegrationsPage() {
  const [open, setOpen] = useState(false);

  const [connecting, setConnecting] =
    useState(false);

  const [loadingConnection, setLoadingConnection] =
    useState(true);

  const [loadingProperties, setLoadingProperties] =
    useState(false);

  const [selectingProperty, setSelectingProperty] =
    useState<string | null>(null);

  const [properties, setProperties] =
    useState<GoogleProperty[]>([]);

  const [selectedProperty, setSelectedProperty] =
    useState<string | null>(null);

  const [analyticsProperties, setAnalyticsProperties] =
    useState<GoogleAnalyticsProperty[]>([]);

  const [
    selectedAnalyticsProperty,
    setSelectedAnalyticsProperty,
  ] = useState<string | null>(null);

  const [
    loadingAnalyticsProperties,
    setLoadingAnalyticsProperties,
  ] = useState(false);

  const [
    selectingAnalyticsProperty,
    setSelectingAnalyticsProperty,
  ] = useState<string | null>(null);

  const [connected, setConnected] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  /*
   * =========================================================
   * CONNECT GOOGLE
   * =========================================================
   */

  async function handleConnectGoogle() {
    try {
      setConnecting(true);
      setError('');
      setSuccess('');

      const response =
        await connectGoogle();

      if (!response?.authorizationUrl) {
        throw new Error(
          'Google authorization URL was not returned.',
        );
      }

      window.location.href =
        response.authorizationUrl;
    } catch (err) {
      console.error(
        'Google connection failed:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to connect Google.',
      );

      setConnecting(false);
    }
  }

  /*
   * =========================================================
   * LOAD SEARCH CONSOLE PROPERTIES
   * =========================================================
   */

  async function loadProperties() {
    try {
      setLoadingProperties(true);
      setError('');

      const data =
        await getGoogleProperties();

      setProperties(
        Array.isArray(data)
          ? data
          : [],
      );

      setConnected(true);
    } catch (err) {
      console.error(
        'Unable to load Google properties:',
        err,
      );

      setProperties([]);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load Google properties.',
      );
    } finally {
      setLoadingProperties(false);
    }
  }

  /*
   * =========================================================
   * LOAD GA4 PROPERTIES
   * =========================================================
   */

  async function loadAnalyticsProperties() {
    try {
      setLoadingAnalyticsProperties(true);
      setError('');

      const data =
        await getGoogleAnalyticsProperties();

      setAnalyticsProperties(
        Array.isArray(data)
          ? data
          : [],
      );
    } catch (err) {
      console.error(
        'Unable to load GA4 properties:',
        err,
      );

      setAnalyticsProperties([]);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load Google Analytics properties.',
      );
    } finally {
      setLoadingAnalyticsProperties(false);
    }
  }

  /*
   * =========================================================
   * LOAD GOOGLE CONNECTION STATUS
   * =========================================================
   */

  async function loadConnection() {
    try {
      setLoadingConnection(true);
      setError('');

      const connection =
        await getGoogleConnectionStatus();

      setConnected(
        Boolean(connection.connected),
      );

      setSelectedProperty(
        connection.selectedProperty ??
          null,
      );

      setSelectedAnalyticsProperty(
        connection.selectedAnalyticsProperty ??
          null,
      );

      if (connection.connected) {
        await Promise.all([
          loadProperties(),
          loadAnalyticsProperties(),
        ]);
      } else {
        setProperties([]);
        setAnalyticsProperties([]);

        setSelectedProperty(null);
        setSelectedAnalyticsProperty(null);
      }
    } catch (err) {
      console.error(
        'Unable to load Google connection status:',
        err,
      );

      setConnected(false);

      setSelectedProperty(null);

      setSelectedAnalyticsProperty(null);

      setProperties([]);

      setAnalyticsProperties([]);

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to check Google connection.',
      );
    } finally {
      setLoadingConnection(false);
    }
  }

  /*
   * =========================================================
   * SELECT SEARCH CONSOLE PROPERTY
   * =========================================================
   */

  async function handleSelectProperty(
    siteUrl: string,
  ) {
    try {
      setSelectingProperty(siteUrl);
      setError('');
      setSuccess('');

      await selectGoogleProperty(
        siteUrl,
      );

      setSelectedProperty(
        siteUrl,
      );

      setSuccess(
        'Search Console property connected successfully.',
      );
    } catch (err) {
      console.error(
        'Unable to select Google property:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to select this property.',
      );
    } finally {
      setSelectingProperty(null);
    }
  }

  /*
   * =========================================================
   * SELECT GA4 PROPERTY
   * =========================================================
   */

  async function handleSelectAnalyticsProperty(
    propertyId: string,
  ) {
    try {
      setSelectingAnalyticsProperty(
        propertyId,
      );

      setError('');
      setSuccess('');

      await selectGoogleAnalyticsProperty(
        propertyId,
      );

      setSelectedAnalyticsProperty(
        propertyId,
      );

      setSuccess(
        'Google Analytics 4 property connected successfully.',
      );
    } catch (err) {
      console.error(
        'Unable to select GA4 property:',
        err,
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to select Google Analytics property.',
      );
    } finally {
      setSelectingAnalyticsProperty(
        null,
      );
    }
  }

  /*
   * =========================================================
   * INITIALIZE PAGE
   * =========================================================
   */

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const params =
        new URLSearchParams(
          window.location.search,
        );

      const googleStatus =
        params.get('google');

      if (
        googleStatus === 'connected'
      ) {
        if (mounted) {
          setSuccess(
            'Google account connected successfully.',
          );
        }

        window.history.replaceState(
          {},
          '',
          '/integrations',
        );
      }

      if (
        googleStatus === 'error'
      ) {
        if (mounted) {
          setError(
            'Google connection failed. Please try again.',
          );
        }

        window.history.replaceState(
          {},
          '',
          '/integrations',
        );
      }

      await loadConnection();
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * =========================================================
   * UI
   * =========================================================
   */

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Sidebar
        mobileOpen={open}
        onClose={() => setOpen(false)}
      />

      <main className="lg:pl-[270px]">
        {/* HEADER */}

        <header className="flex h-[72px] items-center border-b border-slate-200 bg-white px-5 lg:px-8">
          <button
            className="mr-4 lg:hidden"
            onClick={() =>
              setOpen(true)
            }
            aria-label="Open menu"
          >
            <Menu />
          </button>

          <div>
            <div className="text-sm font-bold">
              RENKOO
            </div>

            <div className="text-xs text-slate-400">
              Integrations
            </div>
          </div>
        </header>

        <section className="mx-auto max-w-[1100px] p-5 lg:p-8">

          {/* PAGE HEADER */}

          <div>
            <h1 className="text-3xl font-bold">
              Integrations
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Connect your marketing and search
              platforms to power RENKOO with real
              business data.
            </p>
          </div>

          {/* ERROR */}

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <div className="font-semibold">
                Something went wrong
              </div>

              <div className="mt-1">
                {error}
              </div>
            </div>
          )}

          {/* SUCCESS */}

          {success && (
            <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={17} />

              {success}
            </div>
          )}

          {/* =================================================
              GOOGLE ACCOUNT
              ================================================= */}

          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">

              {/* ICON */}

              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <Globe2 size={26} />
              </div>

              {/* CONTENT */}

              <div className="flex-1">

                <div className="flex flex-wrap items-center gap-3">

                  <h2 className="text-lg font-bold">
                    Google Search Console
                  </h2>

                  {loadingConnection && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <Loader2
                        size={14}
                        className="animate-spin"
                      />

                      Checking connection...
                    </div>
                  )}

                </div>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Connect Search Console to bring real
                  impressions, clicks, CTR, rankings and
                  search queries into RENKOO.
                </p>

                {connected && (
                  <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-600">
                    <CheckCircle2 size={17} />

                    Connected
                  </div>
                )}

                {!connected &&
                  !loadingConnection && (
                    <div className="mt-3 text-xs font-medium text-slate-400">
                      Not connected
                    </div>
                  )}

              </div>

              {/* ACTION */}

              <div className="shrink-0">

                {!connected ? (
                  <button
                    type="button"
                    onClick={
                      handleConnectGoogle
                    }
                    disabled={
                      connecting ||
                      loadingConnection
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >

                    {connecting ? (
                      <>
                        <Loader2
                          size={17}
                          className="animate-spin"
                        />

                        Connecting...
                      </>
                    ) : (
                      <>
                        Connect Google

                        <ExternalLink
                          size={16}
                        />
                      </>
                    )}

                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      loadProperties();
                      loadAnalyticsProperties();
                    }}
                    disabled={
                      loadingProperties ||
                      loadingAnalyticsProperties
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >

                    <RefreshCw
                      size={16}
                      className={
                        loadingProperties ||
                        loadingAnalyticsProperties
                          ? 'animate-spin'
                          : ''
                      }
                    />

                    Refresh

                  </button>
                )}

              </div>

            </div>
          </div>

          {/* =================================================
              SEARCH CONSOLE PROPERTIES
              ================================================= */}

          {connected && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <div>
                <h2 className="text-lg font-bold">
                  Search Console Properties
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Select the Google Search Console
                  property you want RENKOO to analyze.
                </p>
              </div>

              {loadingProperties ? (

                <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2
                    size={17}
                    className="animate-spin"
                  />

                  Loading properties...
                </div>

              ) : properties.length === 0 ? (

                <div className="mt-6 rounded-xl bg-slate-50 p-5">

                  <div className="text-sm font-semibold text-slate-700">
                    No Search Console properties found
                  </div>

                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Make sure this Google account has
                    access to at least one Search Console
                    property.
                  </div>

                  <button
                    type="button"
                    onClick={
                      loadProperties
                    }
                    className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >

                    <RefreshCw size={14} />

                    Try again

                  </button>

                </div>

              ) : (

                <div className="mt-5 space-y-3">

                  {properties.map(
                    (property) => {

                      const isSelected =
                        selectedProperty ===
                        property.siteUrl;

                      const isSelecting =
                        selectingProperty ===
                        property.siteUrl;

                      const anotherPropertySelecting =
                        selectingProperty !== null &&
                        !isSelecting;

                      return (
                        <button
                          key={
                            property.siteUrl
                          }
                          type="button"
                          onClick={() =>
                            handleSelectProperty(
                              property.siteUrl,
                            )
                          }
                          disabled={
                            anotherPropertySelecting ||
                            isSelecting
                          }
                          className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
                            isSelected
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
                          } ${
                            anotherPropertySelecting
                              ? 'cursor-not-allowed opacity-50'
                              : ''
                          }`}
                        >

                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white">

                            {isSelecting ? (
                              <Loader2
                                size={19}
                                className="animate-spin text-blue-600"
                              />
                            ) : (
                              <Globe2
                                size={19}
                                className="text-blue-600"
                              />
                            )}

                          </div>

                          <div className="min-w-0 flex-1">

                            <div className="truncate text-sm font-semibold text-slate-800">
                              {
                                property.siteUrl
                              }
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              Permission:{' '}
                              {property.permissionLevel ??
                                'Unknown'}
                            </div>

                          </div>

                          {isSelected && (
                            <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-blue-600">

                              <CheckCircle2
                                size={18}
                              />

                              Selected

                            </div>
                          )}

                        </button>
                      );
                    },
                  )}

                </div>

              )}

            </div>
          )}

          {/* =================================================
              ACTIVE SEARCH CONSOLE PROPERTY
              ================================================= */}

          {selectedProperty && (
            <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-6">

              <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
                Active Search Console Property
              </div>

              <div className="mt-2 break-all text-lg font-bold text-slate-900">
                {selectedProperty}
              </div>

              <div className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600">

                <CheckCircle2
                  size={17}
                  className="mt-0.5 shrink-0 text-emerald-600"
                />

                <p>
                  RENKOO is ready to pull real Google
                  Search Console performance data for
                  this property.
                </p>

              </div>

            </div>
          )}

          {/* =================================================
              GOOGLE ANALYTICS 4
              ================================================= */}

          {connected && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">

                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-purple-50 text-purple-600">
                  <span className="text-sm font-black">
                    GA4
                  </span>
                </div>

                <div className="flex-1">

                  <h2 className="text-lg font-bold">
                    Google Analytics 4
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Connect GA4 to bring users, sessions,
                    engagement, page views and conversions
                    into RENKOO.
                  </p>

                  {selectedAnalyticsProperty && (
                    <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-600">

                      <CheckCircle2 size={17} />

                      GA4 Connected

                    </div>
                  )}

                </div>

                <button
                  type="button"
                  onClick={
                    loadAnalyticsProperties
                  }
                  disabled={
                    loadingAnalyticsProperties
                  }
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >

                  <RefreshCw
                    size={16}
                    className={
                      loadingAnalyticsProperties
                        ? 'animate-spin'
                        : ''
                    }
                  />

                  Refresh

                </button>

              </div>

            </div>
          )}

          {/* =================================================
              GA4 PROPERTIES
              ================================================= */}

          {connected && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

              <div>
                <h2 className="text-lg font-bold">
                  Google Analytics 4 Properties
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Select the GA4 property you want RENKOO
                  to analyze.
                </p>
              </div>

              {loadingAnalyticsProperties ? (

                <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">

                  <Loader2
                    size={17}
                    className="animate-spin"
                  />

                  Loading GA4 properties...

                </div>

              ) : analyticsProperties.length === 0 ? (

                <div className="mt-6 rounded-xl bg-slate-50 p-5">

                  <div className="text-sm font-semibold text-slate-700">
                    No Google Analytics properties found
                  </div>

                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    Make sure this Google account has
                    access to at least one GA4 property.
                  </div>

                  <button
                    type="button"
                    onClick={
                      loadAnalyticsProperties
                    }
                    className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >

                    <RefreshCw size={14} />

                    Try again

                  </button>

                </div>

              ) : (

                <div className="mt-5 space-y-3">

                  {analyticsProperties.map(
                    (property) => {

                      const isSelected =
                        selectedAnalyticsProperty ===
                        property.propertyId;

                      const isSelecting =
                        selectingAnalyticsProperty ===
                        property.propertyId;

                      const anotherPropertySelecting =
                        selectingAnalyticsProperty !== null &&
                        !isSelecting;

                      return (
                        <button
                          key={
                            property.propertyId
                          }
                          type="button"
                          onClick={() =>
                            handleSelectAnalyticsProperty(
                              property.propertyId ?? '',
                            )
                          }
                          disabled={
                            anotherPropertySelecting ||
                            isSelecting
                          }
                          className={`flex w-full items-center gap-4 rounded-xl border p-4 text-left transition ${
                            isSelected
                              ? 'border-purple-300 bg-purple-50'
                              : 'border-slate-200 bg-white hover:border-purple-200 hover:bg-slate-50'
                          } ${
                            anotherPropertySelecting
                              ? 'cursor-not-allowed opacity-50'
                              : ''
                          }`}
                        >

                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white">

                            {isSelecting ? (
                              <Loader2
                                size={19}
                                className="animate-spin text-purple-600"
                              />
                            ) : (
                              <span className="text-xs font-black text-purple-600">
                                GA4
                              </span>
                            )}

                          </div>

                          <div className="min-w-0 flex-1">

                            <div className="truncate text-sm font-semibold text-slate-800">
                              {property.displayName ||
                                property.propertyId}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              Property ID:{' '}
                              {property.propertyId}
                            </div>

                            {(property.currencyCode ||
                              property.timeZone) && (
                              <div className="mt-1 text-xs text-slate-400">

                                {property.currencyCode
                                  ? `Currency: ${property.currencyCode}`
                                  : ''}

                                {property.currencyCode &&
                                property.timeZone
                                  ? ' â€¢ '
                                  : ''}

                                {property.timeZone
                                  ? property.timeZone
                                  : ''}

                              </div>
                            )}

                          </div>

                          {isSelected && (
                            <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-purple-600">

                              <CheckCircle2
                                size={18}
                              />

                              Selected

                            </div>
                          )}

                        </button>
                      );
                    },
                  )}

                </div>

              )}

            </div>
          )}

          {/* =================================================
              ACTIVE GA4 PROPERTY
              ================================================= */}

          {selectedAnalyticsProperty && (
            <div className="mt-6 rounded-2xl border border-purple-100 bg-purple-50 p-6">

              <div className="text-xs font-bold uppercase tracking-wide text-purple-600">
                Active Google Analytics 4 Property
              </div>

              <div className="mt-2 break-all text-lg font-bold text-slate-900">
                {selectedAnalyticsProperty}
              </div>

              <div className="mt-3 flex items-start gap-2 text-sm leading-6 text-slate-600">

                <CheckCircle2
                  size={17}
                  className="mt-0.5 shrink-0 text-emerald-600"
                />

                <p>
                  RENKOO is ready to pull Google Analytics
                  4 traffic and engagement data for this
                  property.
                </p>

              </div>

            </div>
          )}

          {/* =================================================
              SETUP GUIDE
              ================================================= */}

          {!loadingConnection &&
            !connected && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

                <h2 className="text-sm font-bold text-slate-900">
                  Why connect Google?
                </h2>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">

                  <InfoCard
                    title="Search performance"
                    description="Clicks and impressions from real Google Search Console data."
                  />

                  <InfoCard
                    title="GA4 traffic"
                    description="Users, sessions, engagement, page views and conversions."
                  />

                  <InfoCard
                    title="SEO decisions"
                    description="Combine search visibility, traffic and technical SEO data."
                  />

                </div>

              </div>
            )}

        </section>
      </main>
    </div>
  );
}

/*
 * =========================================================
 * INFO CARD
 * =========================================================
 */

function InfoCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">

      <div className="text-sm font-semibold text-slate-800">
        {title}
      </div>

      <div className="mt-1 text-xs leading-5 text-slate-500">
        {description}
      </div>

    </div>
  );
}
