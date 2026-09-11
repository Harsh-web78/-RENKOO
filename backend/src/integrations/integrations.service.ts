import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { GoogleService } from '../google/google.service';
import { EmailService } from '../email/email.service';
import { backlinkProviderStatus } from '../backlinks/backlinks.provider';
import {
  CAPABILITY_REGISTRY,
  capabilitiesFor,
  connectionAction,
  errorUx,
  freshnessOf,
  onboardingIntegrations,
  permissionPurpose,
  type CapabilityStatus,
  type ConnectionState,
  type ProviderKey,
} from './integration-hub';

/*
 * =========================================================
 * INTEGRATION HUB 1.0 (Phase 21) — read-only composition
 * over stored connection metadata. No provider API calls
 * on status/capability reads (stored metadata only);
 * provider calls happen exclusively in provider-owned
 * flows (OAuth connect, discovery, explicit sync, report
 * reads). No secrets ever returned. No polling, no new
 * meters, no new persistence.
 * =========================================================
 */

const PROVIDERS: ProviderKey[] = [
  'GOOGLE_SEARCH_CONSOLE',
  'GOOGLE_ANALYTICS',
  'GOOGLE_BUSINESS_PROFILE',
  'BING_WEBMASTER',
  'DATAFORSEO',
  'BACKLINK_PROVIDER',
  'AI_PROVIDERS',
  'AI_MONITORING',
  'RESEND',
];

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function envPresent(name: string): boolean {
  return clean(process.env[name]).length > 0;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleService,
    private readonly email: EmailService,
  ) {}

  private async settled<T>(
    fn: () => Promise<T>,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch {
      return null;
    }
  }

  private async website(
    organizationId: string,
    websiteId: string,
  ) {
    const row = await this.prisma.website.findFirst({
      where: {
        id: websiteId,
        organizationId,
        isActive: true,
      },
      select: { id: true, name: true, url: true },
    });
    if (!row)
      throw new NotFoundException('Website not found');
    return row;
  }

  private googleStates(health: Record<string, any> | null): {
    gsc: ConnectionState;
    ga4: ConnectionState;
  } {
    const block = (value: unknown): ConnectionState => {
      const text = clean(
        (value as Record<string, unknown> | null)?.status ??
          (value as Record<string, unknown> | null)
            ?.connection,
      ).toUpperCase();
      if (text === 'CONNECTED') return 'CONNECTED';
      if (
        text === 'RECONNECT_REQUIRED' ||
        text === 'TOKEN_EXPIRED' ||
        text === 'TOKEN_REVOKED'
      )
        return 'REAUTH_REQUIRED';
      if (text === 'ACCESS_DENIED') return 'ACCESS_DENIED';
      if (text === 'PROPERTY_NOT_SELECTED')
        return 'PARTIALLY_CONNECTED';
      if (text === 'CONFIGURATION_REQUIRED')
        return 'CONFIGURATION_REQUIRED';
      if (text === 'ERROR' || text === 'PROVIDER_ERROR')
        return 'PROVIDER_ERROR';
      return 'NOT_CONNECTED';
    };
    return {
      gsc: block(health?.gsc),
      ga4: block(health?.ga4),
    };
  }

  async getIntegrations(organizationId: string) {
    const [health, emailStatus, aiSchedules] =
      await Promise.all([
        this.settled(() =>
          this.google.getIntegrationHealth(organizationId),
        ),
        this.settled(async () => this.email.getStatus()),
        this.settled(() =>
          this.prisma.aiMonitorSchedule.findMany({
            where: { organizationId, isActive: true },
            select: {
              id: true,
              websiteId: true,
              nextRunAt: true,
            },
            take: 50,
          }),
        ),
      ]);

    const states = this.googleStates(
      (health ?? null) as Record<string, any> | null,
    );
    const gscMeta = (health as Record<string, any> | null)
      ?.gsc as Record<string, any> | undefined;
    const ga4Meta = (health as Record<string, any> | null)
      ?.ga4 as Record<string, any> | undefined;

    const dataforseoConfigured =
      envPresent('DATAFORSEO_LOGIN') &&
      envPresent('DATAFORSEO_PASSWORD');
    const aiConfigured =
      envPresent('GEMINI_API_KEY') ||
      envPresent('OPENAI_API_KEY');
    const backlink = backlinkProviderStatus();

    const card = (
      provider: ProviderKey,
      name: string,
      group: string,
      state: ConnectionState,
      extra: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
      provider,
      name,
      group,
      state,
      action: connectionAction(state),
      capabilities: capabilitiesFor(provider).map(
        (entry) => entry.key,
      ),
      permission: permissionPurpose(provider),
      ...extra,
    });

    return {
      groups: [
        'SEARCH',
        'ANALYTICS',
        'LOCAL',
        'AI_SEARCH',
        'SEO_DATA',
        'BUSINESS',
        'DELIVERY',
      ],
      providers: [
        card(
          'GOOGLE_SEARCH_CONSOLE',
          'Google Search Console',
          'SEARCH',
          states.gsc,
          {
            property:
              clean(gscMeta?.property) ||
              clean(gscMeta?.selectedProperty) ||
              null,
            lastSuccessfulSync:
              gscMeta?.lastSuccessfulSync ?? null,
            dataThrough:
              gscMeta?.dataThrough ?? null,
            limitation:
              'Search Analytics ends ~2 days before today; gaps are delay, never zero.',
          },
        ),
        card(
          'GOOGLE_ANALYTICS',
          'Google Analytics',
          'ANALYTICS',
          states.ga4,
          {
            property:
              clean(ga4Meta?.property) ||
              clean(ga4Meta?.selectedProperty) ||
              null,
            lastSuccessfulSync:
              ga4Meta?.lastSuccessfulSync ?? null,
            dataThrough:
              ga4Meta?.dataThrough ?? null,
            limitation:
              'GA4 traffic and GSC clicks are different measurements.',
          },
        ),
        card(
          'GOOGLE_BUSINESS_PROFILE',
          'Google Business Profile',
          'LOCAL',
          'NOT_APPROVED',
          {
            lastSuccessfulSync: null,
            dataThrough: null,
            limitation:
              'Requires approved access and user authorization; availability is not guaranteed.',
          },
        ),
        card('BING_WEBMASTER', 'Bing Webmaster', 'SEARCH', 'NOT_CONNECTED', {
          lastSuccessfulSync: null,
          dataThrough: null,
          limitation:
            'REST endpoints only; no legacy SOAP; AI Performance has no public API.',
        }),
        card(
          'DATAFORSEO',
          'DataForSEO',
          'SEO_DATA',
          dataforseoConfigured
            ? 'CONNECTED'
            : 'NOT_CONNECTED',
          {
            lastSuccessfulSync: null,
            dataThrough: null,
            limitation: dataforseoConfigured
              ? 'Metered usage; allowance limits apply. Connection is never tested by calling the provider on page load.'
              : 'Credentials are not configured.',
          },
        ),
        card(
          'BACKLINK_PROVIDER',
          'Backlink provider',
          'SEO_DATA',
          'PROVIDER_UNAVAILABLE',
          {
            lastSuccessfulSync: null,
            dataThrough: null,
            providerStatus: backlink,
            limitation:
              'No external provider is connected. RENKOO uses imported backlink evidence.',
          },
        ),
        card(
          'AI_PROVIDERS',
          'AI providers',
          'AI_SEARCH',
          aiConfigured ? 'CONNECTED' : 'NOT_CONNECTED',
          {
            lastSuccessfulSync: null,
            dataThrough: null,
            limitation:
              'Configured keys enable generation within allowance.',
          },
        ),
        card(
          'AI_MONITORING',
          'AI monitoring schedules',
          'AI_SEARCH',
          (aiSchedules ?? []).length > 0
            ? 'CONNECTED'
            : 'NOT_CONNECTED',
          {
            activeSchedules: (aiSchedules ?? []).length,
            lastSuccessfulSync: null,
            dataThrough: null,
            limitation:
              'Observations come from scheduled runs, never live scraping.',
          },
        ),
        card(
          'RESEND',
          'Email delivery',
          'DELIVERY',
          (emailStatus as Record<string, unknown> | null)
            ?.status === 'CONFIGURED'
            ? 'CONNECTED'
            : 'NOT_CONNECTED',
          {
            lastSuccessfulSync: null,
            dataThrough: null,
            limitation: 'Report share links by email; no PDF attachment.',
          },
        ),
      ],
      billing: { charged: false },
    };
  }

  async getCapabilities(
    organizationId: string,
    websiteId: string,
  ) {
    await this.website(organizationId, websiteId);
    const integrations = await this.getIntegrations(
      organizationId,
    );
    const byProvider = new Map(
      (
        integrations.providers as Array<
          Record<string, unknown>
        >
      ).map((entry) => [
        entry.provider as ProviderKey,
        entry,
      ]),
    );

    const toCapabilityStatus = (
      state: ConnectionState,
    ): CapabilityStatus => {
      switch (state) {
        case 'CONNECTED':
          return 'AVAILABLE';
        case 'PARTIALLY_CONNECTED':
          return 'PARTIAL';
        case 'NOT_APPROVED':
          return 'NOT_APPROVED';
        case 'CONFIGURATION_REQUIRED':
          return 'REQUIRES_CONFIGURATION';
        case 'PROVIDER_ERROR':
          return 'PROVIDER_UNAVAILABLE';
        case 'NOT_CONNECTED':
        case 'DISCONNECTED':
        case 'CONNECTING':
          return 'NOT_CONNECTED';
        default:
          return 'UNAVAILABLE';
      }
    };

    return {
      websiteId,
      capabilities: CAPABILITY_REGISTRY.map((entry) => {
        const provider = byProvider.get(entry.provider);
        const state = (provider?.state ??
          'NOT_CONNECTED') as ConnectionState;
        return {
          key: entry.key,
          label: entry.label,
          status: toCapabilityStatus(state),
          source: entry.provider,
          evidenceState:
            state === 'CONNECTED'
              ? 'VERIFIED'
              : 'UNAVAILABLE',
          requiredIntegration: entry.provider,
          lastSuccessfulSync:
            (provider?.lastSuccessfulSync as string | null) ??
            null,
          dataThrough:
            (provider?.dataThrough as string | null) ??
            null,
          freshness: freshnessOf(
            entry.provider,
            (provider?.lastSuccessfulSync as string | null) ??
              null,
          ),
          unlocks: entry.unlocks,
          limitation: entry.limitation,
          action: connectionAction(state),
        };
      }),
      billing: { charged: false },
    };
  }

  async getProviderStatus(
    organizationId: string,
    provider: string,
    websiteId?: string,
  ) {
    const key = clean(provider).toUpperCase();
    if (
      ![
        'GOOGLE_SEARCH_CONSOLE',
        'GOOGLE_ANALYTICS',
        'GOOGLE_BUSINESS_PROFILE',
        'BING_WEBMASTER',
        'DATAFORSEO',
        'BACKLINK_PROVIDER',
        'AI_PROVIDERS',
        'AI_MONITORING',
        'RESEND',
      ].includes(key)
    ) {
      throw new BadRequestException('Unknown provider');
    }
    if (websiteId)
      await this.website(organizationId, websiteId);
    const integrations = await this.getIntegrations(
      organizationId,
    );
    const entry = (
      integrations.providers as Array<Record<string, unknown>>
    ).find((row) => row.provider === key);
    if (!entry)
      throw new NotFoundException('Provider not found');
    const error = errorUx({
      provider: key,
      code: null,
      hasPriorData:
        (entry.lastSuccessfulSync as string | null) !==
        null,
    });
    return {
      ...entry,
      capabilities: capabilitiesFor(key as ProviderKey),
      freshness: freshnessOf(
        key,
        (entry.lastSuccessfulSync as string | null) ?? null,
      ),
      diagnostics: {
        ...error,
        scopes: 'Human-readable purposes only; raw scope strings are never primary UX.',
      },
    };
  }

  async disconnect(
    organizationId: string,
    provider: string,
  ) {
    const key = clean(provider).toUpperCase();
    if (
      key === 'GOOGLE_SEARCH_CONSOLE' ||
      key === 'GOOGLE_ANALYTICS'
    ) {
      /* Provider-owned OAuth lifecycle stays in the
       * Google module: revoke local connection, stop
       * future sync, preserve historical observations
       * and reports. */
      return this.google.disconnect(organizationId);
    }
    throw new BadRequestException(
      `Disconnect is not supported for ${key || 'this provider'} through the hub.`,
    );
  }

  async onboarding(
    organizationId: string,
    websiteId: string,
  ) {
    await this.website(organizationId, websiteId);
    const brain = await this.settled(() =>
      this.prisma.businessBrain.findUnique({
        where: { websiteId },
      }),
    );
    const locations = await this.settled(() =>
      this.prisma.businessLocation.count({
        where: { organizationId, websiteId },
      }),
    );
    const isLocal =
      (brain != null &&
        (clean((brain as Record<string, unknown>).city)
          .length > 0 ||
          ((brain as Record<string, unknown>)
            .targetLocations as unknown[])?.length > 0)) ||
      (locations ?? 0) > 0;
    return {
      websiteId,
      recommended: onboardingIntegrations({
        isLocal,
        isAgency: false,
      }).map((provider) => ({
        provider,
        purpose: permissionPurpose(provider),
        action: connectionAction('NOT_CONNECTED'),
      })),
      billing: { charged: false },
    };
  }
}
