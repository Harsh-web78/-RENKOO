'use client';

/*
 * RENKOO — Integrations (V2 design-system pass).
 * UI ONLY: shared PageHeader / Panel / badges / buttons /
 * states / ConfirmDialog with rk-* tokens. Google OAuth,
 * GSC/GA4 connection, property selection, disconnect,
 * refresh behavior, API calls, permissions and all
 * business logic are unchanged. No connection state is
 * invented — every badge reflects a real API response.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import {
  CheckCircle2,
  ExternalLink,
  Globe2,
  Loader2,
  RefreshCw,
  X,
  AlertTriangle,
} from 'lucide-react';

import AppShell from '../../components/AppShell';

import ConfirmDialog from '../../components/ui/ConfirmDialog';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
} from '../../components/ui/buttons';
import {
  Badge,
  StatusBadge,
} from '../../components/ui/badge';
import {
  EmptyState,
  LoadingBlock,
} from '../../components/ui/states';

import {
  connectGoogle,
  disconnectGoogle,
  getCapabilitiesMatrix,
  getGbpStatus,
  getGoogleConnectionStatus,
  getGoogleHealth,
  getGoogleProperties,
  selectGoogleProperty,
  getGoogleAnalyticsProperties,
  selectGoogleAnalyticsProperty,
  getIntegrationsHub,
  getWebsites,
  GoogleProperty,
  GoogleAnalyticsProperty,
  GoogleIntegrationHealth,
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

  const [health, setHealth] =
    useState<GoogleIntegrationHealth | null>(
      null,
    );

  const [gbpStatus, setGbpStatus] =
    useState<{
      status: string;
      limitation?: string | null;
      dataAvailable?: boolean | null;
    } | null>(null);

  const [disconnecting, setDisconnecting] =
    useState(false);

  const [disconnectOpen, setDisconnectOpen] =
    useState(false);

  const [hub, setHub] = useState<any>(null);

  const [capabilities, setCapabilities] =
    useState<any[]>([]);

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

      /*
       * Status gates the property lists below, but
       * health and GBP state are independent of it —
       * fetch all three at once instead of in sequence.
       */
      const [
        connection,
        healthData,
        gbpData,
        hubData,
      ] = await Promise.all([
        getGoogleConnectionStatus(),
        getGoogleHealth().catch(
          () => null,
        ),
        getGbpStatus().catch(
          () => null,
        ),
        /* Stored metadata only — no provider calls. */
        getIntegrationsHub().catch(
          () => null,
        ),
      ]);

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

      setHealth(healthData);
      setGbpStatus(gbpData);
      setHub(hubData);

      /* Capability matrix for the active website —
       * stored metadata only. */
      try {
        const sites = await getWebsites().catch(
          () => [],
        );
        const list = Array.isArray(sites) ? sites : [];
        const stored =
          typeof window !== 'undefined'
            ? localStorage.getItem('renkoo_website_id')
            : null;
        const valid =
          stored &&
          list.some((s: any) => s.id === stored)
            ? stored
            : list[0]?.id || '';
        if (valid) {
          const matrix = await getCapabilitiesMatrix(
            valid,
          ).catch(() => null);
          setCapabilities(
            Array.isArray(matrix?.capabilities)
              ? matrix.capabilities
              : [],
          );
        }
      } catch {
        setCapabilities([]);
      }

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
   * DISCONNECT GOOGLE
   * =========================================================
   */

  async function handleDisconnectGoogle() {
    if (disconnecting) {
      return;
    }

    try {
      setDisconnecting(true);
      setError('');
      setSuccess('');

      const result =
        await disconnectGoogle();

      setConnected(false);
      setHealth(null);
      setSelectedProperty(null);
      setSelectedAnalyticsProperty(null);
      setProperties([]);
      setAnalyticsProperties([]);

      setSuccess(
        result.message ??
          'Google has been disconnected.',
      );

      setDisconnectOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to disconnect Google.',
      );
    } finally {
      setDisconnecting(false);
    }
  }

  /*
   * =========================================================
   * SYNC FRESHNESS (honest: only what getGoogleHealth returns)
   * =========================================================
   */

  function formatSyncDate(
    value?: string | null,
  ): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleString();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * =========================================================
   * UI
   * =========================================================
   */

  return (
    <AppShell
      mobileOpen={open}
      onClose={() => setOpen(false)}
      onMenu={() => setOpen(true)}
    >
      <div className="rk-page">
        <PageHeader
          eyebrow="Connections"
          title="Integrations"
          description="Connect your marketing and search platforms to power RENKOO with real business data."
          meta={
            <>
              {loadingConnection ? (
                <span>Checking connection…</span>
              ) : connected ? (
                <>
                  <Badge label="Google connected" tone="positive" />
                  {selectedProperty ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="rk-technical-value truncate !text-rk-muted">
                        {selectedProperty}
                      </span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden>·</span>
                      <span>No property selected</span>
                    </>
                  )}
                </>
              ) : (
                <Badge label="Not connected" tone="neutral" />
              )}
            </>
          }
          actions={
            <SecondaryButton
              onClick={() => void loadConnection()}
              disabled={loadingConnection}
            >
              <RefreshCw
                size={14}
                aria-hidden
                className={loadingConnection ? 'animate-spin' : ''}
              />
              Refresh
            </SecondaryButton>
          }
        />

        {error ? (
          <div className="mt-4">
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-rk-md border border-rk-danger/30 bg-rk-dangerSoft px-3.5 py-3 text-sm font-medium leading-5 text-rk-danger"
            >
              <AlertTriangle
                size={16}
                aria-hidden
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0 flex-1">{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                aria-label="Dismiss error"
                className="rk-focusable grid h-7 w-7 shrink-0 place-items-center rounded-rk-sm hover:bg-rk-danger/10"
              >
                <X size={15} aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        {success ? (
          <div className="mt-4">
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-rk-md border border-rk-success/30 bg-rk-successSoft px-3.5 py-3 text-sm font-medium leading-5 text-rk-success"
            >
              <CheckCircle2
                size={16}
                aria-hidden
                className="mt-0.5 shrink-0"
              />
              <span className="min-w-0 flex-1">{success}</span>
              <button
                type="button"
                onClick={() => setSuccess('')}
                aria-label="Dismiss message"
                className="rk-focusable grid h-7 w-7 shrink-0 place-items-center rounded-rk-sm hover:bg-rk-success/10"
              >
                <X size={15} aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6">
          <Panel
            eyebrow="Search"
            title="Search (GSC + GA4)"
            description="Google Search Console and Analytics data, powered by the existing Google connection. Provider: Google."
            footer={
              <span>
                <strong className="text-rk-ink">
                  Workspace context:
                </strong>{' '}
                the selected properties apply workspace-wide
                to every website here. Website ownership is
                managed in Clients — this page never invents
                per-website mapping.
              </span>
            }
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-rk-md bg-rk-soft text-rk-secondary">
                <Globe2 size={22} aria-hidden />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                    Google Search Console
                  </h3>

                  {loadingConnection ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rk-muted">
                      <Loader2
                        size={14}
                        aria-hidden
                        className="animate-spin"
                      />
                      Checking connection…
                    </span>
                  ) : connected ? (
                    <Badge label="Connected" tone="positive" />
                  ) : (
                    <Badge label="Not connected" tone="neutral" />
                  )}
                </div>

                <p className="mt-1 text-sm leading-6 text-rk-secondary">
                  Connect Search Console to bring real
                  impressions, clicks, CTR, rankings and
                  search queries into RENKOO.
                </p>

                {connected && health && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rk-field-label">GSC</span>
                      <StatusBadge
                        status={
                          health.gsc?.status ??
                          'UNKNOWN'
                        }
                      />
                    </span>

                    <span className="inline-flex items-center gap-1.5">
                      <span className="rk-field-label">GA4</span>
                      <StatusBadge
                        status={
                          health.ga4?.status ??
                          'UNKNOWN'
                        }
                      />
                    </span>

                    <span className="inline-flex items-center gap-1.5">
                      <span className="rk-field-label">GBP</span>
                      <StatusBadge
                        status={
                          health.gbp?.status ??
                          'UNKNOWN'
                        }
                      />
                    </span>
                  </div>
                )}

                {connected && (
                  <div className="rk-metadata mt-2 space-y-1">
                    <p>
                      Provider:{' '}
                      {health?.provider ??
                        'Google'}{' '}
                      · GSC data:{' '}
                      {typeof health?.gsc
                        ?.dataAvailable ===
                      'boolean'
                        ? health.gsc
                            .dataAvailable
                          ? 'Yes'
                          : 'No'
                        : 'Unknown'}{' '}
                      · GA4 data:{' '}
                      {typeof health?.ga4
                        ?.dataAvailable ===
                      'boolean'
                        ? health.ga4
                            .dataAvailable
                          ? 'Yes'
                          : 'No'
                        : 'Unknown'}
                    </p>

                    {health?.lastSuccessfulRequestAt ? (
                      <p>
                        Last synced{' '}
                        {formatSyncDate(
                          health.lastSuccessfulRequestAt,
                        )}
                      </p>
                    ) : (
                      <p>
                        Sync status unavailable —
                        connection state only
                      </p>
                    )}

                    {health?.lastErrorCode && (
                      <p>
                        Last error{' '}
                        {health.lastErrorCode}
                        {health?.lastErrorAt
                          ? ` at ${formatSyncDate(health.lastErrorAt)}`
                          : ''}
                      </p>
                    )}

                    {(health?.limitation ||
                      health?.gsc?.limitation ||
                      health?.ga4?.limitation) && (
                      <p>
                        {[
                          health?.limitation,
                          health?.gsc?.limitation,
                          health?.ga4?.limitation,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                )}

                {connected &&
                  health?.status ===
                    'RECONNECT_REQUIRED' && (
                    <p className="mt-2 text-xs font-bold text-rk-danger">
                      Google authorization needs
                      attention. Reconnect your
                      account to restore data.
                    </p>
                  )}

                {connected && (
                  <p className="mt-2 text-xs leading-5 text-rk-secondary">
                    <span className="font-bold text-rk-ink">
                      Next action:{' '}
                    </span>

                    {health?.status ===
                    'RECONNECT_REQUIRED'
                      ? 'Reconnect your Google account to restore data.'
                      : !selectedProperty
                        ? 'Select a Search Console property below to start importing search data.'
                        : !selectedAnalyticsProperty
                          ? 'Select a GA4 property below to start importing traffic data.'
                          : 'You are set — RENKOO pulls real data automatically.'}
                  </p>
                )}
              </div>

              <div className="shrink-0">
                {!connected ? (
                  <PrimaryButton
                    onClick={() =>
                      void handleConnectGoogle()
                    }
                    disabled={
                      connecting ||
                      loadingConnection
                    }
                    className="w-full sm:w-auto"
                  >
                    {connecting ? (
                      <>
                        <Loader2
                          size={15}
                          aria-hidden
                          className="animate-spin"
                        />
                        Connecting…
                      </>
                    ) : (
                      <>
                        Connect Google
                        <ExternalLink
                          size={14}
                          aria-hidden
                        />
                      </>
                    )}
                  </PrimaryButton>
                ) : (
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    {health?.status ===
                      'RECONNECT_REQUIRED' && (
                      <PrimaryButton
                        onClick={() =>
                          void handleConnectGoogle()
                        }
                        disabled={
                          connecting ||
                          loadingConnection
                        }
                        className="w-full sm:w-auto"
                      >
                        {connecting ? (
                          <>
                            <Loader2
                              size={15}
                              aria-hidden
                              className="animate-spin"
                            />
                            Reconnecting…
                          </>
                        ) : (
                          <>
                            Reconnect Google
                            <ExternalLink
                              size={14}
                              aria-hidden
                            />
                          </>
                        )}
                      </PrimaryButton>
                    )}

                    <SecondaryButton
                      onClick={() => {
                        void loadProperties();
                        void loadAnalyticsProperties();
                      }}
                      disabled={
                        loadingProperties ||
                        loadingAnalyticsProperties
                      }
                      className="w-full sm:w-auto"
                    >
                      <RefreshCw
                        size={14}
                        aria-hidden
                        className={
                          loadingProperties ||
                          loadingAnalyticsProperties
                            ? 'animate-spin'
                            : ''
                        }
                      />
                      Refresh
                    </SecondaryButton>

                    <DangerButton
                      onClick={() =>
                        setDisconnectOpen(true)
                      }
                      disabled={disconnecting}
                      className="w-full sm:w-auto"
                    >
                      {disconnecting
                        ? 'Disconnecting…'
                        : 'Disconnect'}
                    </DangerButton>
                  </div>
                )}
              </div>
            </div>

            {connected && (
              <div className="mt-6 border-t border-rk-border pt-5">
                <h3 className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                  Search Console properties
                </h3>

                <p className="mt-1 text-[13px] leading-6 text-rk-secondary">
                  Select the Google Search Console
                  property you want RENKOO to analyze.
                </p>

                {loadingProperties ? (
                  <div className="mt-4">
                    <LoadingBlock title="Loading properties…" lines={3} />
                  </div>
                ) : properties.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState
                      title="No Search Console properties found"
                      description="Make sure this Google account has access to at least one Search Console property."
                      actionLabel="Try again"
                      onAction={() => void loadProperties()}
                    />
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
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
                          <PropertyOption
                            key={
                              property.siteUrl
                            }
                            icon={
                              isSelecting ? (
                                <Loader2
                                  size={17}
                                  aria-hidden
                                  className="animate-spin text-rk-info"
                                />
                              ) : (
                                <Globe2
                                  size={17}
                                  aria-hidden
                                  className="text-rk-secondary"
                                />
                              )
                            }
                            title={
                              property.siteUrl
                            }
                            subtitle={`Permission: ${property.permissionLevel ?? 'Unknown'}`}
                            selected={isSelected}
                            selectedLabel="Selected"
                            disabled={
                              anotherPropertySelecting ||
                              isSelecting
                            }
                            onSelect={() =>
                              void handleSelectProperty(
                                property.siteUrl,
                              )
                            }
                          />
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedProperty && (
              <div className="mt-4 rounded-rk-md border border-rk-info/30 bg-rk-infoSoft/50 px-4 py-3.5">
                <p className="rk-field-label">
                  Active Search Console property
                </p>

                <p className="rk-technical-value mt-1 break-all !text-rk-ink">
                  {selectedProperty}
                </p>

                <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-rk-secondary">
                  <CheckCircle2
                    size={15}
                    aria-hidden
                    className="mt-1 shrink-0 text-rk-success"
                  />
                  <span>
                    RENKOO is ready to pull real Google
                    Search Console performance data for
                    this property.
                  </span>
                </p>
              </div>
            )}

            {connected && (
              <div className="mt-6 border-t border-rk-border pt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-rk-md bg-rk-soft text-rk-secondary">
                      <span className="text-[11px] font-black">
                        GA4
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                          Google Analytics 4
                        </h3>

                        <StatusBadge
                          status={
                            health?.ga4?.status ??
                            'UNKNOWN'
                          }
                        />
                      </div>

                      <p className="mt-0.5 text-[13px] leading-6 text-rk-secondary">
                        Users, sessions, engagement, page
                        views and conversions.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedAnalyticsProperty && (
                      <Badge label="GA4 connected" tone="positive" />
                    )}
                    <SecondaryButton
                      size="sm"
                      onClick={() =>
                        void loadAnalyticsProperties()
                      }
                      disabled={
                        loadingAnalyticsProperties
                      }
                    >
                      <RefreshCw
                        size={14}
                        aria-hidden
                        className={
                          loadingAnalyticsProperties
                            ? 'animate-spin'
                            : ''
                        }
                      />
                      Refresh
                    </SecondaryButton>
                  </div>
                </div>

                <p className="mt-1 text-[13px] leading-6 text-rk-secondary">
                  Select the GA4 property you want RENKOO
                  to analyze.
                </p>

                {loadingAnalyticsProperties ? (
                  <div className="mt-4">
                    <LoadingBlock title="Loading GA4 properties…" lines={3} />
                  </div>
                ) : analyticsProperties.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState
                      title="No Google Analytics properties found"
                      description="Make sure this Google account has access to at least one GA4 property."
                      actionLabel="Try again"
                      onAction={() =>
                        void loadAnalyticsProperties()
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
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

                        const meta = [
                          `Property ID: ${property.propertyId}`,
                          [
                            property.currencyCode
                              ? `Currency: ${property.currencyCode}`
                              : '',
                            property.timeZone
                              ? property.timeZone
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · '),
                        ]
                          .filter(Boolean)
                          .join(' · ');

                        return (
                          <PropertyOption
                            key={
                              property.propertyId
                            }
                            icon={
                              isSelecting ? (
                                <Loader2
                                  size={17}
                                  aria-hidden
                                  className="animate-spin text-rk-info"
                                />
                              ) : (
                                <span className="text-[11px] font-black text-rk-secondary">
                                  GA4
                                </span>
                              )
                            }
                            title={
                              property.displayName ||
                              property.propertyId ||
                              'Unnamed property'
                            }
                            subtitle={meta}
                            selected={isSelected}
                            selectedLabel="Selected"
                            disabled={
                              anotherPropertySelecting ||
                              isSelecting
                            }
                            onSelect={() =>
                              void handleSelectAnalyticsProperty(
                                property.propertyId ?? '',
                              )
                            }
                          />
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedAnalyticsProperty && (
              <div className="mt-4 rounded-rk-md border border-rk-info/30 bg-rk-infoSoft/50 px-4 py-3.5">
                <p className="rk-field-label">
                  Active Google Analytics 4 property
                </p>

                <p className="rk-technical-value mt-1 break-all !text-rk-ink">
                  {selectedAnalyticsProperty}
                </p>

                <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-rk-secondary">
                  <CheckCircle2
                    size={15}
                    aria-hidden
                    className="mt-1 shrink-0 text-rk-success"
                  />
                  <span>
                    RENKOO is ready to pull Google Analytics
                    4 traffic and engagement data for this
                    property.
                  </span>
                </p>
              </div>
            )}
          </Panel>
        </div>

        <div className="mt-6">
          <Panel
            eyebrow="Local"
            title="Local (Google Business Profile)"
            description="Read-only business profile status from the existing Google connection. GBP management stays in Google."
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-rk-md bg-rk-successSoft text-rk-success">
                <Globe2 size={22} aria-hidden />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-extrabold tracking-[-0.015em] text-rk-ink">
                    Google Business Profile
                  </h3>

                  <StatusBadge
                    status={
                      gbpStatus?.status ??
                      health?.gbp?.status ??
                      'NOT_AVAILABLE'
                    }
                  />
                </div>

                <p className="mt-1 text-sm leading-6 text-rk-secondary">
                  {gbpStatus?.limitation ??
                    health?.gbp?.limitation ??
                    'Google Business Profile is not connected.'}
                </p>

                <p className="rk-metadata mt-1.5">
                  Provider: Google · Data
                  available:{' '}
                  {typeof (
                    gbpStatus?.dataAvailable ??
                    health?.gbp?.dataAvailable
                  ) === 'boolean'
                    ? (
                        gbpStatus?.dataAvailable ??
                        health?.gbp?.dataAvailable
                      )
                      ? 'Yes'
                      : 'No'
                    : 'Unknown'}{' '}
                  · Read-only — manage your profile in
                  Google. No connection action here; use
                  the Google connection above.
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="mt-6">
          <Panel
            eyebrow="More"
            title="Other integrations"
            description="Live status from stored connection metadata — no provider calls on this page, no secrets shown."
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {(Array.isArray(hub?.providers)
                ? hub.providers
                : []
              )
                .filter(
                  (entry: any) =>
                    entry.provider !==
                      'GOOGLE_SEARCH_CONSOLE' &&
                    entry.provider !==
                      'GOOGLE_ANALYTICS' &&
                    entry.provider !==
                      'GOOGLE_BUSINESS_PROFILE',
                )
                .map((entry: any) => (
                  <div
                    key={String(entry.provider)}
                    className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-rk-ink">
                        {String(
                          entry.name ?? entry.provider,
                        )}
                      </p>

                      <StatusBadge
                        status={String(
                          entry.state ?? 'UNKNOWN',
                        )}
                      />
                    </div>

                    <p className="rk-metadata mt-1.5">
                      {String(
                        entry.limitation ??
                          'See capability matrix below.',
                      )}
                    </p>
                  </div>
                ))}
              {!hub ? (
                <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                  <p className="rk-metadata">
                    Integration hub status unavailable.
                  </p>
                </div>
              ) : null}

              <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-rk-ink">
                    Payments
                  </p>

                  <StatusBadge status="NOT_AVAILABLE" />
                </div>

                <p className="rk-metadata mt-1.5">
                  Provider: none connected here · Data
                  available: No · Payments: see{' '}
                  <a
                    href="/billing"
                    className="rk-focusable font-bold text-rk-info hover:underline"
                  >
                    /billing
                  </a>
                  .
                </p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="mt-6">
          <Panel
            eyebrow="Capability matrix"
            title="What RENKOO can currently measure"
            description="Connection → capability → evidence. Unavailable is never zero."
          >
            {capabilities.length === 0 ? (
              <p className="rk-metadata">
                Select a website to see capability states.
              </p>
            ) : (
              <ul className="space-y-2">
                {capabilities.map((entry: any) => (
                  <li
                    key={String(entry.key)}
                    className="flex flex-col gap-1 rounded-rk-md border border-rk-border bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-rk-ink">
                        {String(entry.label ?? entry.key)}
                      </span>
                      <span className="rk-metadata mt-0.5 block">
                        {String(entry.unlocks ?? '')} ·
                        Source:{' '}
                        {String(entry.source ?? '—')}
                        {entry.lastSuccessfulSync
                          ? ` · Last data: ${String(entry.lastSuccessfulSync)}`
                          : ''}
                      </span>
                    </span>
                    <StatusBadge
                      status={String(
                        entry.status ?? 'UNKNOWN',
                      )}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {!loadingConnection &&
          !connected && (
            <div className="mt-6">
              <Panel
                eyebrow="Guide"
                title="Why connect Google?"
                description="Real platform data powers every RENKOO workflow."
              >
                <div className="grid gap-3 sm:grid-cols-3">
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
              </Panel>
            </div>
          )}

        <ConfirmDialog
          open={disconnectOpen}
          title="Disconnect Google?"
          description="Disconnect Google from this workspace? Search Console and Analytics data will become unavailable in RENKOO until you reconnect."
          confirmLabel="Disconnect"
          cancelLabel="Keep connected"
          confirming={disconnecting}
          onConfirm={() =>
            void handleDisconnectGoogle()
          }
          onCancel={() => {
            if (!disconnecting) {
              setDisconnectOpen(false);
            }
          }}
        />
      </div>
    </AppShell>
  );
}

/*
 * =========================================================
 * SHARED PROPERTY OPTION (GSC + GA4 use one pattern)
 * =========================================================
 */

function PropertyOption({
  icon,
  title,
  subtitle,
  selected,
  selectedLabel = 'Selected',
  disabled,
  onSelect,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  selected: boolean;
  selectedLabel?: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`rk-focusable flex w-full items-center gap-3 rounded-rk-md border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? 'border-rk-info/40 bg-rk-infoSoft/50'
          : 'border-rk-border bg-rk-surface hover:border-rk-strong hover:bg-rk-soft/60'
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-rk-md bg-rk-surface">
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="rk-technical-value block truncate !text-rk-ink">
          {title}
        </span>

        {subtitle ? (
          <span className="rk-metadata mt-0.5 block truncate">
            {subtitle}
          </span>
        ) : null}
      </span>

      {selected && (
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-rk-info">
          <CheckCircle2 size={16} aria-hidden />
          {selectedLabel}
        </span>
      )}
    </button>
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
    <div className="rounded-rk-md border border-rk-border bg-rk-soft px-4 py-3.5">
      <p className="text-sm font-bold text-rk-ink">
        {title}
      </p>

      <p className="rk-metadata mt-1">
        {description}
      </p>
    </div>
  );
}
