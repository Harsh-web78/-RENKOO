import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

import { google } from 'googleapis';
import { createHmac } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoogleService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /*
   * =========================================================
   * GOOGLE OAUTH CLIENT
   * =========================================================
   */

  private getOAuthClient() {
    const clientId =
      process.env.GOOGLE_CLIENT_ID;

    const clientSecret =
      process.env.GOOGLE_CLIENT_SECRET;

    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI;

    if (
      !clientId ||
      !clientSecret ||
      !redirectUri
    ) {
      throw new InternalServerErrorException(
        'Google OAuth is not configured',
      );
    }

    return new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
  }

  /*
   * =========================================================
   * AUTHENTICATED GOOGLE CLIENT
   * =========================================================
   *
   * - Loads Google connection from database
   * - Uses refresh token
   * - Refreshes expired access token
   * - Persists refreshed access token
   */

  private async getAuthenticatedClient(
    organizationId: string,
  ) {
    const connection =
      await this.prisma.googleConnection.findUnique({
        where: {
          organizationId,
        },
      });

    if (!connection) {
      throw new UnauthorizedException(
        'Google is not connected. Please connect Google again.',
      );
    }

    if (!connection.refreshToken) {
      throw new UnauthorizedException(
        'Google authorization is missing a refresh token. Please reconnect Google.',
      );
    }

    const client =
      this.getOAuthClient();

    client.setCredentials({
      access_token:
        connection.accessToken ?? undefined,

      refresh_token:
        connection.refreshToken,

      expiry_date:
        connection.tokenExpiry
          ? connection.tokenExpiry.getTime()
          : undefined,
    });

    try {
      const tokenResponse =
        await client.getAccessToken();

      const refreshedAccessToken =
        tokenResponse.token;

      if (
        refreshedAccessToken &&
        refreshedAccessToken !==
          connection.accessToken
      ) {
        await this.prisma.googleConnection.update({
          where: {
            organizationId,
          },

          data: {
            accessToken:
              refreshedAccessToken,

            tokenExpiry:
              client.credentials
                .expiry_date
                ? new Date(
                    client.credentials
                      .expiry_date,
                  )
                : connection.tokenExpiry,
          },
        });
      } else if (
        client.credentials.expiry_date &&
        connection.tokenExpiry?.getTime() !==
          client.credentials.expiry_date
      ) {
        await this.prisma.googleConnection.update({
          where: {
            organizationId,
          },

          data: {
            tokenExpiry:
              new Date(
                client.credentials
                  .expiry_date,
              ),
          },
        });
      }

      return client;
    } catch (error: any) {
      console.error(
        'Google authentication error:',
        {
          code: error?.code,
          message: error?.message,
          response:
            error?.response?.data,
        },
      );

      const status =
        error?.response?.status;

      if (
        status === 401 ||
        error?.code === 'invalid_grant'
      ) {
        throw new UnauthorizedException(
          'Google authorization has expired or been revoked. Please reconnect Google.',
        );
      }

      throw new InternalServerErrorException(
        'Unable to authenticate with Google. Please try again.',
      );
    }
  }

  /*
   * =========================================================
   * GOOGLE API RETRY
   * =========================================================
   *
   * Retries temporary network/socket/DNS failures.
   */

  private async withGoogleRetry<T>(
    operation: () => Promise<T>,
    retries = 3,
  ): Promise<T> {
    let lastError: any;

    for (
      let attempt = 0;
      attempt < retries;
      attempt++
    ) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        const code =
          error?.code ??
          error?.cause?.code ??
          '';

        const message =
          String(
            error?.message ?? '',
          ).toLowerCase();

        const status =
          error?.response?.status;

        /*
         * Do not retry client/auth/permission
         * errors.
         */

        if (
          status === 400 ||
          status === 401 ||
          status === 403 ||
          status === 404
        ) {
          throw error;
        }

        const isTransient =
          code === 'ENOTFOUND' ||
          code === 'ECONNRESET' ||
          code === 'ETIMEDOUT' ||
          code === 'ECONNREFUSED' ||
          code === 'EAI_AGAIN' ||
          message.includes(
            'socket disconnected',
          ) ||
          message.includes(
            'network',
          ) ||
          message.includes(
            'timeout',
          ) ||
          message.includes(
            'tls',
          ) ||
          message.includes(
            'getaddrinfo',
          );

        if (
          !isTransient ||
          attempt === retries - 1
        ) {
          throw error;
        }

        const delay =
          500 *
          Math.pow(2, attempt);

        console.warn(
          `Google API temporary failure. Retrying in ${delay}ms...`,
          {
            attempt:
              attempt + 1,
            retries,
            code,
            message:
              error?.message,
          },
        );

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              delay,
            ),
        );
      }
    }

    throw lastError;
  }

  /*
   * =========================================================
   * GOOGLE API ERROR HANDLER
   * =========================================================
   */

  private handleGoogleApiError(
    error: any,
    fallbackMessage: string,
  ): never {
    console.error(
      'Google API error:',
      {
        code: error?.code,
        status:
          error?.response?.status,
        message:
          error?.message,
        response:
          error?.response?.data,
      },
    );

    const status =
      error?.response?.status;

    if (
      status === 401 ||
      error?.code === 'invalid_grant'
    ) {
      throw new UnauthorizedException(
        'Google authorization has expired or been revoked. Please reconnect Google.',
      );
    }

    if (status === 403) {
      throw new UnauthorizedException(
        'Google account does not have permission to access this resource.',
      );
    }

    if (status === 404) {
      throw new InternalServerErrorException(
        'Google resource was not found. Please verify the selected property.',
      );
    }

    throw new InternalServerErrorException(
      fallbackMessage,
    );
  }

  /*
   * =========================================================
   * GOOGLE AUTHORIZATION URL
   * =========================================================
   */

  private createOAuthState(organizationId: string) {
    const timestamp = Date.now().toString();
    const payload = `${organizationId}.${timestamp}`;

    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new InternalServerErrorException(
        'OAuth state secret is not configured',
      );
    }

    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return Buffer.from(`${payload}.${signature}`).toString('base64url');
  }

  verifyOAuthState(state: string) {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new UnauthorizedException(
        'OAuth state secret is not configured',
      );
    }

    let decoded: string;

    try {
      decoded = Buffer.from(state, 'base64url').toString('utf8');
    } catch {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const parts = decoded.split('.');

    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const [organizationId, timestamp, signature] = parts;
    const payload = `${organizationId}.${timestamp}`;

    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    if (signature.length !== expectedSignature.length) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const valid = createHmac('sha256', secret)
      .update(payload)
      .digest('hex') === signature;

    if (!valid) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const age = Date.now() - Number(timestamp);

    if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) {
      throw new UnauthorizedException('OAuth state has expired');
    }

    return organizationId;
  }

  getAuthorizationUrl(
    organizationId: string,
  ) {
    const client =
      this.getOAuthClient();

    return client.generateAuthUrl({
      access_type: 'offline',

      prompt: 'consent',

      include_granted_scopes: true,

      state: this.createOAuthState(organizationId),

      scope: [
        'openid',
        'email',
        'profile',

        'https://www.googleapis.com/auth/webmasters.readonly',

        'https://www.googleapis.com/auth/analytics.readonly',
      ],
    });
  }

  /*
   * =========================================================
   * GOOGLE OAUTH CALLBACK
   * =========================================================
   */

  async handleCallback(
    code: string,
  ) {
    if (!code) {
      throw new UnauthorizedException(
        'Google authorization code is missing',
      );
    }

    const client =
      this.getOAuthClient();

    try {
      const { tokens } =
        await client.getToken(code);

      if (!tokens.access_token) {
        throw new UnauthorizedException(
          'Google did not return an access token',
        );
      }

      client.setCredentials(tokens);

      const oauth2 =
        google.oauth2({
          auth: client,
          version: 'v2',
        });

      const { data: profile } =
        await this.withGoogleRetry(
          () =>
            oauth2.userinfo.get(),
        );

      if (!profile.id) {
        throw new UnauthorizedException(
          'Unable to identify Google account',
        );
      }

      return {
        googleUserId:
          profile.id,

        googleEmail:
          profile.email ?? null,

        googleName:
          profile.name ?? null,

        googlePicture:
          profile.picture ?? null,

        accessToken:
          tokens.access_token,

        refreshToken:
          tokens.refresh_token ?? null,

        tokenExpiry:
          tokens.expiry_date
            ? new Date(
                tokens.expiry_date,
              )
            : null,

        scope:
          tokens.scope ?? null,
      };
    } catch (error: any) {
      if (
        error instanceof
        UnauthorizedException
      ) {
        throw error;
      }

      this.handleGoogleApiError(
        error,
        'Unable to complete Google authorization. Please try again.',
      );
    }
  }

  /*
   * =========================================================
   * SAVE GOOGLE CONNECTION
   * =========================================================
   */

  async saveConnection(
    organizationId: string,
    data: {
      googleUserId: string;
      googleEmail: string | null;
      googleName: string | null;
      googlePicture: string | null;
      accessToken: string;
      refreshToken: string | null;
      tokenExpiry: Date | null;
      scope: string | null;
    },
  ) {
    const existing =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    return this.prisma.googleConnection.upsert({
      where: {
        organizationId,
      },

      create: {
        organizationId,

        googleUserId:
          data.googleUserId,

        googleEmail:
          data.googleEmail,

        googleName:
          data.googleName,

        googlePicture:
          data.googlePicture,

        accessToken:
          data.accessToken,

        refreshToken:
          data.refreshToken ?? '',

        tokenExpiry:
          data.tokenExpiry,

        scope:
          data.scope,
      },

      update: {
        googleUserId:
          data.googleUserId,

        googleEmail:
          data.googleEmail,

        googleName:
          data.googleName,

        googlePicture:
          data.googlePicture,

        accessToken:
          data.accessToken,

        /*
         * Google may not return a refresh token
         * on subsequent OAuth approvals.
         *
         * Preserve the existing refresh token.
         */

        refreshToken:
          data.refreshToken ??
          existing?.refreshToken ??
          '',

        tokenExpiry:
          data.tokenExpiry,

        scope:
          data.scope,
      },
    });
  }

  /*
   * =========================================================
   * GET SEARCH CONSOLE PROPERTIES
   * =========================================================
   */

  async getProperties(
    organizationId: string,
  ) {
    const client =
      await this.getAuthenticatedClient(
        organizationId,
      );

    try {
      const searchconsole =
        google.searchconsole({
          version: 'v1',
          auth: client,
        });

      const response =
        await this.withGoogleRetry(
          () =>
            searchconsole.sites.list(),
        );

      const sites =
        response.data.siteEntry ?? [];

      return sites.map(
        (site) => ({
          siteUrl:
            site.siteUrl ?? '',

          permissionLevel:
            site.permissionLevel ??
            null,
        }),
      );
    } catch (error: any) {
      this.handleGoogleApiError(
        error,
        'Unable to load Google Search Console properties. Please try again.',
      );
    }
  }

  /*
   * =========================================================
   * GOOGLE CONNECTION STATUS
   * =========================================================
   */

  async getConnectionStatus(
    organizationId: string,
  ) {
    const connection =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },

          select: {
            id: true,
            googleUserId: true,
            googleEmail: true,
            googleName: true,
            googlePicture: true,
            selectedProperty: true,
            selectedAnalyticsProperty:
              true,
            tokenExpiry: true,
            scope: true,
          },
        },
      );

    if (!connection) {
      return {
        connected: false,

        selectedProperty: null,

        selectedAnalyticsProperty:
          null,

        googleEmail: null,

        googleName: null,

        googlePicture: null,

        tokenExpiry: null,

        scope: null,
      };
    }

    return {
      connected: true,

      selectedProperty:
        connection.selectedProperty ??
        null,

      selectedAnalyticsProperty:
        connection.selectedAnalyticsProperty ??
        null,

      googleEmail:
        connection.googleEmail ?? null,

      googleName:
        connection.googleName ?? null,

      googlePicture:
        connection.googlePicture ?? null,

      tokenExpiry:
        connection.tokenExpiry ?? null,

      scope:
        connection.scope ?? null,
    };
  }

  /*
   * =========================================================
   * SELECT SEARCH CONSOLE PROPERTY
   * =========================================================
   */

  async saveProperty(
    organizationId: string,
    siteUrl: string,
  ) {
    if (!siteUrl?.trim()) {
      throw new UnauthorizedException(
        'Search Console property is required',
      );
    }

    const connection =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    if (!connection) {
      throw new UnauthorizedException(
        'Google Search Console is not connected',
      );
    }

    const properties =
      await this.getProperties(organizationId);

    const normalizedSiteUrl =
      siteUrl.trim();

    const propertyExists =
      properties.some(
        (property) =>
          property.siteUrl.trim() ===
          normalizedSiteUrl,
      );

    if (!propertyExists) {
      throw new UnauthorizedException(
        'You do not have access to this Search Console property',
      );
    }

    return this.prisma.googleConnection.update({
      where: {
        organizationId,
      },

      data: {
        selectedProperty:
          siteUrl.trim(),
      },

      select: {
        id: true,
        organizationId: true,
        googleUserId: true,
        googleEmail: true,
        googleName: true,
        googlePicture: true,
        selectedProperty: true,
        selectedAnalyticsProperty:
          true,
        tokenExpiry: true,
        scope: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /*
   * =========================================================
   * SEARCH CONSOLE ANALYTICS
   * =========================================================
   */

  async getSearchAnalytics(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    if (
      !startDate ||
      !endDate
    ) {
      throw new UnauthorizedException(
        'startDate and endDate are required',
      );
    }

    const connection =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    if (!connection) {
      throw new UnauthorizedException(
        'Google Search Console is not connected',
      );
    }

    if (!connection.selectedProperty) {
      throw new UnauthorizedException(
        'No Search Console property selected',
      );
    }

    const client =
      await this.getAuthenticatedClient(
        organizationId,
      );

    try {
      const searchconsole =
        google.searchconsole({
          version: 'v1',
          auth: client,
        });

      const response =
        await this.withGoogleRetry(
          () =>
            searchconsole.searchanalytics.query(
              {
                siteUrl:
                  connection.selectedProperty!,

                requestBody: {
                  startDate,

                  endDate,

                  dimensions: ['date'],

                  rowLimit: 1000,

                  startRow: 0,
                },
              },
            ),
        );

      const rows =
        response.data.rows ?? [];

      const totals = {
        clicks: 0,

        impressions: 0,

        positionWeightedSum: 0,
      };

      for (const row of rows) {
        const clicks =
          Number(
            row.clicks ?? 0,
          );

        const impressions =
          Number(
            row.impressions ?? 0,
          );

        const position =
          Number(
            row.position ?? 0,
          );

        totals.clicks += clicks;

        totals.impressions +=
          impressions;

        totals.positionWeightedSum +=
          position * impressions;
      }

      const ctr =
        totals.impressions > 0
          ? totals.clicks /
            totals.impressions
          : 0;

      const averagePosition =
        totals.impressions > 0
          ? totals.positionWeightedSum /
            totals.impressions
          : 0;

      return {
        property:
          connection.selectedProperty,

        startDate,

        endDate,

        clicks:
          totals.clicks,

        impressions:
          totals.impressions,

        ctr,

        averagePosition,

        rows,
      };
    } catch (error: any) {
      this.handleGoogleApiError(
        error,
        'Unable to load Search Console analytics. Please try again.',
      );
    }
  }

  /*
   * =========================================================
   * GOOGLE ANALYTICS 4 PROPERTIES
   * =========================================================
   */

  async getAnalyticsProperties(
    organizationId: string,
  ) {
    const connection =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    if (!connection) {
      throw new UnauthorizedException(
        'Google Analytics is not connected',
      );
    }

    const client =
      await this.getAuthenticatedClient(
        organizationId,
      );

    try {
      const admin =
        google.analyticsadmin({
          version: 'v1beta',
          auth: client,
        });

      const accountResponse =
        await this.withGoogleRetry(
          () =>
            admin.accountSummaries.list({
              pageSize: 200,
            }),
        );

      const accountSummaries =
        accountResponse.data
          .accountSummaries ?? [];

      const properties: Array<{
        name: string;
        propertyId: string;
        displayName: string;
        propertyType: string | null;
        parent: string | null;
        currencyCode: string | null;
        timeZone: string | null;
      }> = [];

      for (
        const account of accountSummaries
      ) {
        const propertySummaries =
          account.propertySummaries ?? [];

        for (
          const property of
            propertySummaries
        ) {
          const propertyName =
            property.property ?? '';

          const propertyId =
            propertyName.replace(
              'properties/',
              '',
            );

          if (!propertyId) {
            continue;
          }

          properties.push({
            name: propertyName,

            propertyId,

            displayName:
              property.displayName ?? '',

            propertyType:
              property.propertyType ??
              null,

            parent:
              account.name ?? null,

            currencyCode: null,

            timeZone: null,
          });
        }
      }

      const uniqueProperties =
        Array.from(
          new Map(
            properties.map(
              (property) => [
                property.propertyId,
                property,
              ],
            ),
          ).values(),
        );

      return uniqueProperties;
    } catch (error: any) {
      this.handleGoogleApiError(
        error,
        'Unable to load Google Analytics properties. Please try again.',
      );
    }
  }

  /*
   * =========================================================
   * SELECT GA4 PROPERTY
   * =========================================================
   */

  async saveAnalyticsProperty(
    organizationId: string,
    propertyId: string,
  ) {
    if (!propertyId?.trim()) {
      throw new UnauthorizedException(
        'GA4 property ID is required',
      );
    }

    const connection =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    if (!connection) {
      throw new UnauthorizedException(
        'Google Analytics is not connected',
      );
    }

    const properties =
      await this.getAnalyticsProperties(
        organizationId,
      );

    const normalizedPropertyId =
      propertyId.trim();

    const propertyExists =
      properties.some(
        (property) =>
          property.propertyId ===
          normalizedPropertyId,
      );

    if (!propertyExists) {
      throw new UnauthorizedException(
        'You do not have access to this Google Analytics property',
      );
    }

    return this.prisma.googleConnection.update({
      where: {
        organizationId,
      },

      data: {
        selectedAnalyticsProperty:
          propertyId.trim(),
      },

      select: {
        id: true,
        organizationId: true,
        googleUserId: true,
        googleEmail: true,
        googleName: true,
        googlePicture: true,
        selectedProperty: true,
        selectedAnalyticsProperty:
          true,
        tokenExpiry: true,
        scope: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /*
   * =========================================================
   * GA4 REPORT
   * =========================================================
   */

  async getAnalyticsReport(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    if (
      !startDate ||
      !endDate
    ) {
      throw new UnauthorizedException(
        'startDate and endDate are required',
      );
    }

    const connection =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    if (!connection) {
      throw new UnauthorizedException(
        'Google Analytics is not connected',
      );
    }

    if (
      !connection.selectedAnalyticsProperty
    ) {
      throw new UnauthorizedException(
        'No Google Analytics property selected',
      );
    }

    const client =
      await this.getAuthenticatedClient(
        organizationId,
      );

    try {
      const analytics =
        google.analyticsdata({
          version: 'v1beta',
          auth: client,
        });

      const property =
        `properties/${connection.selectedAnalyticsProperty}`;

      const response =
        await this.withGoogleRetry(
          () =>
            analytics.properties.runReport(
              {
                property,

                requestBody: {
                  dateRanges: [
                    {
                      startDate,
                      endDate,
                    },
                  ],

                  metrics: [
                    {
                      name:
                        'activeUsers',
                    },

                    {
                      name:
                        'newUsers',
                    },

                    {
                      name:
                        'sessions',
                    },

                    {
                      name:
                        'engagementRate',
                    },

                    {
                      name:
                        'averageSessionDuration',
                    },

                    {
                      name:
                        'screenPageViews',
                    },

                    {
                      name:
                        'conversions',
                    },
                  ],

                  dimensions: [
                    {
                      name: 'date',
                    },
                  ],

                  orderBys: [
                    {
                      dimension: {
                        dimensionName:
                          'date',
                      },
                    },
                  ],

                  limit: '1000',
                },
              },
            ),
        );

      const rows =
        response.data.rows ?? [];

      return {
        property:
          connection.selectedAnalyticsProperty,

        startDate,

        endDate,

        rows:
          rows.map(
            (row) => ({
              date:
                row
                  .dimensionValues?.[0]
                  ?.value ?? '',

              activeUsers:
                Number(
                  row
                    .metricValues?.[0]
                    ?.value ?? 0,
                ),

              newUsers:
                Number(
                  row
                    .metricValues?.[1]
                    ?.value ?? 0,
                ),

              sessions:
                Number(
                  row
                    .metricValues?.[2]
                    ?.value ?? 0,
                ),

              engagementRate:
                Number(
                  row
                    .metricValues?.[3]
                    ?.value ?? 0,
                ),

              averageSessionDuration:
                Number(
                  row
                    .metricValues?.[4]
                    ?.value ?? 0,
                ),

              pageViews:
                Number(
                  row
                    .metricValues?.[5]
                    ?.value ?? 0,
                ),

              conversions:
                Number(
                  row
                    .metricValues?.[6]
                    ?.value ?? 0,
                ),
            }),
          ),
      };
    } catch (error: any) {
      this.handleGoogleApiError(
        error,
        'Unable to load Google Analytics report. Please try again.',
      );
    }
  }

  /*
   * =========================================================
   * SEARCH CONSOLE QUERY DATA
   * =========================================================
   */

  async getSearchQueries(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    if (
      !startDate ||
      !endDate
    ) {
      throw new UnauthorizedException(
        'startDate and endDate are required',
      );
    }

    const connection =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    if (!connection) {
      throw new UnauthorizedException(
        'Google Search Console is not connected',
      );
    }

    if (!connection.selectedProperty) {
      throw new UnauthorizedException(
        'No Search Console property selected',
      );
    }

    const client =
      await this.getAuthenticatedClient(
        organizationId,
      );

    try {
      const searchconsole =
        google.searchconsole({
          version: 'v1',
          auth: client,
        });

      const response =
        await this.withGoogleRetry(
          () =>
            searchconsole.searchanalytics.query(
              {
                siteUrl:
                  connection.selectedProperty!,

                requestBody: {
                  startDate,
                  endDate,

                  dimensions: ['query'],

                  rowLimit: 1000,

                  startRow: 0,
                },
              },
            ),
        );

      const rows =
        response.data.rows ?? [];

      return {
        property:
          connection.selectedProperty,

        startDate,
        endDate,

        rows:
          rows.map(
            (row) => ({
              query:
                row.keys?.[0] ?? '',

              clicks:
                Number(
                  row.clicks ?? 0,
                ),

              impressions:
                Number(
                  row.impressions ?? 0,
                ),

              ctr:
                Number(
                  row.ctr ?? 0,
                ),

              position:
                Number(
                  row.position ?? 0,
                ),
            }),
          ),
      };
    } catch (error: any) {
      this.handleGoogleApiError(
        error,
        'Unable to load Search Console query data. Please try again.',
      );
    }
  }

  /*
   * =========================================================
   * SEARCH CONSOLE PAGE DATA
   * =========================================================
   */

  async getSearchPages(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    if (
      !startDate ||
      !endDate
    ) {
      throw new UnauthorizedException(
        'startDate and endDate are required',
      );
    }

    const connection =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    if (!connection) {
      throw new UnauthorizedException(
        'Google Search Console is not connected',
      );
    }

    if (!connection.selectedProperty) {
      throw new UnauthorizedException(
        'No Search Console property selected',
      );
    }

    const client =
      await this.getAuthenticatedClient(
        organizationId,
      );

    try {
      const searchconsole =
        google.searchconsole({
          version: 'v1',
          auth: client,
        });

      const response =
        await this.withGoogleRetry(
          () =>
            searchconsole.searchanalytics.query(
              {
                siteUrl:
                  connection.selectedProperty!,

                requestBody: {
                  startDate,
                  endDate,

                  dimensions: ['page'],

                  rowLimit: 1000,

                  startRow: 0,
                },
              },
            ),
        );

      const rows =
        response.data.rows ?? [];

      return {
        property:
          connection.selectedProperty,

        startDate,
        endDate,

        rows:
          rows.map(
            (row) => ({
              page:
                row.keys?.[0] ?? '',

              clicks:
                Number(
                  row.clicks ?? 0,
                ),

              impressions:
                Number(
                  row.impressions ?? 0,
                ),

              ctr:
                Number(
                  row.ctr ?? 0,
                ),

              position:
                Number(
                  row.position ?? 0,
                ),
            }),
          ),
      };
    } catch (error: any) {
      this.handleGoogleApiError(
        error,
        'Unable to load Search Console page data. Please try again.',
      );
    }
  }

  /*
   * =========================================================
   * SEARCH CONSOLE QUERY â†’ PAGE DATA
   * =========================================================
   */

  async getQueryPages(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    if (
      !startDate ||
      !endDate
    ) {
      throw new UnauthorizedException(
        'startDate and endDate are required',
      );
    }

    const connection =
      await this.prisma.googleConnection.findUnique(
        {
          where: {
            organizationId,
          },
        },
      );

    if (!connection) {
      throw new UnauthorizedException(
        'Google Search Console is not connected',
      );
    }

    if (!connection.selectedProperty) {
      throw new UnauthorizedException(
        'No Search Console property selected',
      );
    }

    const client =
      await this.getAuthenticatedClient(
        organizationId,
      );

    try {
      const searchconsole =
        google.searchconsole({
          version: 'v1',
          auth: client,
        });

      const response =
        await this.withGoogleRetry(
          () =>
            searchconsole.searchanalytics.query(
              {
                siteUrl:
                  connection.selectedProperty!,

                requestBody: {
                  startDate,
                  endDate,

                  dimensions: [
                    'query',
                    'page',
                  ],

                  rowLimit: 1000,

                  startRow: 0,
                },
              },
            ),
        );

      const rows =
        response.data.rows ?? [];

      return {
        property:
          connection.selectedProperty,

        startDate,
        endDate,

        rows:
          rows.map(
            (row) => ({
              query:
                row.keys?.[0] ?? '',

              page:
                row.keys?.[1] ?? '',

              clicks:
                Number(
                  row.clicks ?? 0,
                ),

              impressions:
                Number(
                  row.impressions ?? 0,
                ),

              ctr:
                Number(
                  row.ctr ?? 0,
                ),

              position:
                Number(
                  row.position ?? 0,
                ),
            }),
          ),
      };
    } catch (error: any) {
      this.handleGoogleApiError(
        error,
        'Unable to load Search Console query-page data. Please try again.',
      );
    }
  }

  /*
   * =========================================================
   * SEO OPPORTUNITIES
   * =========================================================
   *
   * Improved:
   * - Keeps ALL pages ranking for a query
   * - Selects primary page by impressions
   * - Detects possible cannibalization
   * - Uses page-specific data
   */

  async getSeoOpportunities(
    organizationId: string,
    startDate: string,
    endDate: string,
  ) {
    const queryData =
      await this.getSearchQueries(
        organizationId,
        startDate,
        endDate,
      );

    const queryPages =
      await this.getQueryPages(
        organizationId,
        startDate,
        endDate,
      );

    const rows =
      queryData.rows;

    /*
     * Map query â†’ all ranking pages.
     */

    const pageMap =
      new Map<
        string,
        Array<{
          page: string;
          clicks: number;
          impressions: number;
          ctr: number;
          position: number;
        }>
      >();

    for (
      const row of queryPages.rows
    ) {
      const existing =
        pageMap.get(row.query) ?? [];

      existing.push({
        page: row.page,

        clicks: row.clicks,

        impressions:
          row.impressions,

        ctr: row.ctr,

        position: row.position,
      });

      pageMap.set(
        row.query,
        existing,
      );
    }

    const opportunities =
      rows
        .filter(
          (row) =>
            row.impressions > 0 &&
            row.position > 0,
        )
        .map(
          (row) => {
            let score = 0;

            let type =
              'VISIBILITY';

            let recommendation =
              'Improve the relevance and search visibility of this query on the ranking page.';

            /*
             * =================================================
             * POSITION SCORE
             * =================================================
             */

            if (
              row.position >= 4 &&
              row.position <= 10
            ) {
              score += 40;

              type =
                'QUICK_WIN';

              recommendation =
                'Strengthen the ranking page for this query to push it toward the top 3 Google results.';
            } else if (
              row.position > 10 &&
              row.position <= 20
            ) {
              score += 25;

              type =
                'RANKING_GROWTH';

              recommendation =
                'Improve content depth, relevance and internal linking to move this query toward page one.';
            } else if (
              row.position > 20
            ) {
              score += 10;

              type =
                'VISIBILITY';

              recommendation =
                'Build stronger topical relevance and supporting content for this search query.';
            } else if (
              row.position >= 1 &&
              row.position < 4
            ) {
              score += 20;

              type =
                'TOP_POSITION';

              recommendation =
                'Protect this ranking and improve click-through rate without risking the current position.';
            }

            /*
             * =================================================
             * IMPRESSION SCORE
             * =================================================
             */

            if (
              row.impressions >= 100
            ) {
              score += 30;
            } else if (
              row.impressions >= 50
            ) {
              score += 25;
            } else if (
              row.impressions >= 20
            ) {
              score += 20;
            } else if (
              row.impressions >= 5
            ) {
              score += 10;
            } else {
              score += 5;
            }

            /*
             * =================================================
             * CTR SCORE
             * =================================================
             */

            if (
              row.ctr < 0.02 &&
              row.impressions >= 5
            ) {
              score += 20;

              type =
                'LOW_CTR';

              recommendation =
                'Improve the page title and meta description to increase clicks from existing Google impressions.';
            } else if (
              row.ctr < 0.05 &&
              row.impressions >= 3
            ) {
              score += 15;

              if (
                type !==
                'QUICK_WIN'
              ) {
                type =
                  'LOW_CTR';
              }

              recommendation =
                'Improve the search snippet, title and meta description to increase organic CTR.';
            } else if (
              row.ctr >= 0.05
            ) {
              score += 10;
            }

            /*
             * =================================================
             * CLICK SIGNAL
             * =================================================
             */

            if (row.clicks > 0) {
              score += 10;
            }

            /*
             * =================================================
             * PAGE MAPPING
             * =================================================
             */

            const rankingPages =
              pageMap.get(row.query) ??
              [];

            const sortedPages =
              [...rankingPages].sort(
                (a, b) =>
                  b.impressions -
                  a.impressions,
              );

            const primaryPage =
              sortedPages[0] ?? null;

            /*
             * =================================================
             * CANNIBALIZATION SIGNAL
             * =================================================
             */

            const cannibalization =
              rankingPages.length > 1;

            if (
              cannibalization
            ) {
              score += 5;

              if (
                score < 100
              ) {
                recommendation =
                  'Review multiple ranking pages for this query. Consolidate search intent and strengthen the page that should be the primary ranking URL.';
              }
            }

            /*
             * =================================================
             * CAP SCORE
             * =================================================
             */

            score =
              Math.min(
                100,
                score,
              );

            return {
              query:
                row.query,

              page:
                primaryPage?.page ??
                null,

              rankingPages,

              cannibalization,

              clicks:
                row.clicks,

              impressions:
                row.impressions,

              ctr:
                row.ctr,

              position:
                row.position,

              score,

              type,

              recommendation,
            };
          },
        )
        .sort(
          (a, b) =>
            b.score - a.score,
        )
        .slice(0, 50);

    return {
      property:
        queryData.property,

      startDate,

      endDate,

      total:
        opportunities.length,

      opportunities,
    };
  }

  /*
   * =========================================================
   * ANALYZE SINGLE SEO OPPORTUNITY
   * =========================================================
   */

  async analyzeSeoOpportunity(
    organizationId: string,
    startDate: string,
    endDate: string,
    query: string,
    page?: string,
  ) {
    if (
      !startDate ||
      !endDate ||
      !query?.trim()
    ) {
      throw new UnauthorizedException(
        'startDate, endDate and query are required',
      );
    }

    const queryData =
      await this.getSearchQueries(
        organizationId,
        startDate,
        endDate,
      );

    const queryPages =
      await this.getQueryPages(
        organizationId,
        startDate,
        endDate,
      );

    const normalizedQuery =
      query
        .trim()
        .toLowerCase();

    const matchingQuery =
      queryData.rows.find(
        (row) =>
          row.query
            .trim()
            .toLowerCase() ===
          normalizedQuery,
      );

    if (!matchingQuery) {
      throw new UnauthorizedException(
        'Search Console query was not found for this date range',
      );
    }

    const matchingPages =
      queryPages.rows.filter(
        (row) =>
          row.query
            .trim()
            .toLowerCase() ===
          normalizedQuery,
      );

    let rankingPage =
      page?.trim() ?? '';

    /*
     * If a page was explicitly supplied,
     * use it.
     *
     * Otherwise choose the page with
     * the highest impressions.
     */

    if (!rankingPage) {
      rankingPage =
        [...matchingPages]
          .sort(
            (a, b) =>
              b.impressions -
              a.impressions,
          )[0]?.page ?? '';
    }

    /*
     * =======================================================
     * OPPORTUNITY CLASSIFICATION
     * =======================================================
     */

    const position =
      matchingQuery.position;

    const impressions =
      matchingQuery.impressions;

    const clicks =
      matchingQuery.clicks;

    const ctr =
      matchingQuery.ctr;

    let priority = 'LOW';

    let opportunityType =
      'VISIBILITY';

    let rankingStage =
      'BEYOND_PAGE_ONE';

    if (
      position >= 1 &&
      position < 4
    ) {
      priority = 'MEDIUM';

      opportunityType =
        'TOP_POSITION';

      rankingStage =
        'TOP_3';
    } else if (
      position >= 4 &&
      position <= 10
    ) {
      priority = 'HIGH';

      opportunityType =
        'QUICK_WIN';

      rankingStage =
        'PAGE_1';
    } else if (
      position > 10 &&
      position <= 20
    ) {
      priority = 'HIGH';

      opportunityType =
        'RANKING_GROWTH';

      rankingStage =
        'PAGE_2';
    }

    /*
     * =======================================================
     * CHECKS
     * =======================================================
     */

    const checks = {
      searchVisibility: {
        status:
          impressions > 0
            ? 'PASS'
            : 'NEEDS_ATTENTION',

        impressions,
      },

      ranking: {
        status:
          position > 0
            ? 'PASS'
            : 'NEEDS_ATTENTION',

        position,
      },

      clicks: {
        status:
          clicks > 0
            ? 'PASS'
            : 'NEEDS_ATTENTION',

        clicks,
      },

      ctr: {
        status:
          ctr >= 0.05
            ? 'PASS'
            : 'NEEDS_ATTENTION',

        ctr,
      },

      pageMapping: {
        status:
          rankingPage
            ? 'PASS'
            : 'NEEDS_ATTENTION',

        page:
          rankingPage || null,
      },

      cannibalization: {
        status:
          matchingPages.length <= 1
            ? 'PASS'
            : 'NEEDS_ATTENTION',

        rankingPages:
          matchingPages.length,
      },
    };

    /*
     * =======================================================
     * RECOMMENDATIONS
     * =======================================================
     */

    const recommendations: string[] =
      [];

    if (
      position >= 4 &&
      position <= 10
    ) {
      recommendations.push(
        'Strengthen the ranking page for this query to push it toward the top 3 Google results.',
      );
    }

    if (
      position > 10 &&
      position <= 20
    ) {
      recommendations.push(
        'Improve content depth, relevance and internal linking to move this query toward page one.',
      );
    }

    if (position > 20) {
      recommendations.push(
        'Build stronger topical relevance and supporting content around this search query.',
      );
    }

    if (
      position >= 1 &&
      position < 4
    ) {
      recommendations.push(
        'Protect the current ranking and improve click-through rate without making risky changes to the ranking page.',
      );
    }

    if (
      ctr < 0.02 &&
      impressions >= 5
    ) {
      recommendations.push(
        'Review the search snippet, title and meta description to improve organic CTR.',
      );
    } else if (
      ctr < 0.05 &&
      impressions >= 3
    ) {
      recommendations.push(
        'Improve the search snippet, title and meta description to increase organic CTR.',
      );
    }

    if (
      matchingPages.length > 1
    ) {
      recommendations.push(
        'Multiple pages are ranking for this query. Review search intent and consider consolidating or differentiating the affected pages to reduce possible keyword cannibalization.',
      );
    }

    if (
      !rankingPage
    ) {
      recommendations.push(
        'No ranking page was identified for this query in the available Search Console data.',
      );
    }

    if (
      recommendations.length ===
      0
    ) {
      recommendations.push(
        'Continue monitoring this query and collect more Search Console data before making major changes.',
      );
    }

    /*
     * =======================================================
     * RESPONSE
     * =======================================================
     */

    return {
      property:
        queryData.property,

      startDate,

      endDate,

      query:
        matchingQuery.query,

      page:
        rankingPage || null,

      rankingPages:
        matchingPages,

      clicks,

      impressions,

      ctr,

      position,

      priority,

      opportunityType,

      rankingStage,

      checks,

      recommendations,
    };
  }
}




