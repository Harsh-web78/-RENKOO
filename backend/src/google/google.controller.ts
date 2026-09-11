import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';

import { GoogleService } from './google.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  normalizeOAuthOrigin,
  oauthReturnPath,
} from './oauth-return';

@Controller('google')
export class GoogleController {
  constructor(
    private readonly googleService: GoogleService,
  ) {}

  /*
   * =========================================================
   * GOOGLE CONNECT
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('connect')
  connect(
    @Req() req: any,
    @Query('origin') origin?: string,
  ) {
    const organizationId =
      req.user.organizationId;

    const authorizationUrl =
      this.googleService.getAuthorizationUrl(
        organizationId,
        normalizeOAuthOrigin(origin),
      );

    return {
      authorizationUrl,
    };
  }

  /*
   * =========================================================
   * GOOGLE CONNECTION STATUS
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('status')
  async status(@Req() req: any) {
    return this.googleService.getConnectionStatus(
      req.user.organizationId,
    );
  }

  /*
   * =========================================================
   * INTEGRATION HEALTH (GOOGLE + GSC + GA4 + GBP)
   *
   * Derived from stored state only — never spends
   * Google API quota, never returns credentials.
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('health')
  async health(@Req() req: any) {
    return this.googleService.getIntegrationHealth(
      req.user.organizationId,
    );
  }

  /*
   * =========================================================
   * GOOGLE BUSINESS PROFILE STATUS (READ-ONLY TRUTH)
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('gbp/status')
  async gbpStatus() {
    return this.googleService.gbpStatus();
  }

  @UseGuards(JwtAuthGuard)
  @Post('disconnect')
  async disconnect(@Req() req: any) {
    return this.googleService.disconnect(
      req.user.organizationId,
    );
  }

  /*
   * =========================================================
   * GOOGLE OAUTH CALLBACK
   *
   * Phase 41 — the originating setup surface travels
   * inside signed state and is restored here. Only
   * allowlisted first-party paths are ever produced;
   * success carries ?google=connected (the signal the
   * setup surfaces already listen for), errors carry
   * ?google=error on the originating surface.
   * =========================================================
   */

  @Get('callback')
  async callback(
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    const frontend =
      process.env.FRONTEND_URL;

    if (error) {
      const origin =
        this.googleService.peekOAuthOrigin(state);
      return res.redirect(
        `${frontend}${oauthReturnPath(origin, 'error')}`,
      );
    }

    if (!code || !state) {
      return res.redirect(
        `${frontend}${oauthReturnPath('integrations', 'error')}`,
      );
    }

    try {
      const { organizationId, origin } =
        this.googleService.verifyOAuthState(state);

      const connection =
        await this.googleService.handleCallback(
          code,
        );

      await this.googleService.saveConnection(
        organizationId,
        connection,
      );

      return res.redirect(
        `${frontend}${oauthReturnPath(origin, 'connected')}`,
      );
    } catch (error) {
      /*
       * Log the failure class only — never the
       * OAuth code, state, or tokens.
       */
      console.error(
        'Google OAuth callback failed:',
        error instanceof Error
          ? error.message
          : 'unknown',
      );

      return res.redirect(
        `${frontend}${oauthReturnPath('integrations', 'error')}`,
      );
    }
  }

  /*
   * =========================================================
   * SEARCH CONSOLE PROPERTIES
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('properties')
  async properties(@Req() req: any) {
    return this.googleService.getProperties(
      req.user.organizationId,
    );
  }

  /*
   * =========================================================
   * SELECT SEARCH CONSOLE PROPERTY
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('select-property')
  async selectProperty(
    @Req() req: any,
    @Query('siteUrl') siteUrl: string,
  ) {
    return this.googleService.saveProperty(
      req.user.organizationId,
      siteUrl,
    );
  }

  /*
   * =========================================================
   * SEARCH CONSOLE ANALYTICS
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: { limit: 30, ttl: 60000 },
  })
  @Get('analytics')
  async analytics(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.googleService.getSearchAnalytics(
      req.user.organizationId,
      startDate,
      endDate,
    );
  }

  /*
   * =========================================================
   * SEARCH CONSOLE QUERIES
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: { limit: 30, ttl: 60000 },
  })
  @Get('queries')
  async queries(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.googleService.getSearchQueries(
      req.user.organizationId,
      startDate,
      endDate,
    );
  }

  /*
   * =========================================================
   * SEARCH CONSOLE PAGES
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: { limit: 30, ttl: 60000 },
  })
  @Get('pages')
  async pages(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.googleService.getSearchPages(
      req.user.organizationId,
      startDate,
      endDate,
    );
  }

  /*
   * =========================================================
   * SEARCH CONSOLE QUERY → PAGE DATA
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: { limit: 30, ttl: 60000 },
  })
  @Get('query-pages')
  async queryPages(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.googleService.getQueryPages(
      req.user.organizationId,
      startDate,
      endDate,
    );
  }

  /*
   * =========================================================
   * SEO OPPORTUNITIES
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: { limit: 20, ttl: 60000 },
  })
  @Get('opportunities')
  async opportunities(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.googleService.getSeoOpportunities(
      req.user.organizationId,
      startDate,
      endDate,
    );
  }

  /*
   * =========================================================
   * ANALYZE SINGLE SEO OPPORTUNITY
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('opportunities/analyze')
  async analyzeOpportunity(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('query') query: string,
    @Query('page') page?: string,
  ) {
    return this.googleService.analyzeSeoOpportunity(
      req.user.organizationId,
      startDate,
      endDate,
      query,
      page,
    );
  }

  /*
   * =========================================================
   * GOOGLE ANALYTICS 4 PROPERTIES
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('analytics/properties')
  async analyticsProperties(
    @Req() req: any,
  ) {
    return this.googleService.getAnalyticsProperties(
      req.user.organizationId,
    );
  }

  /*
   * =========================================================
   * SELECT GOOGLE ANALYTICS 4 PROPERTY
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Get('analytics/select-property')
  async selectAnalyticsProperty(
    @Req() req: any,
    @Query('propertyId') propertyId: string,
  ) {
    return this.googleService.saveAnalyticsProperty(
      req.user.organizationId,
      propertyId,
    );
  }

  /*
   * =========================================================
   * GOOGLE ANALYTICS 4 REPORT
   * =========================================================
   */

  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: { limit: 30, ttl: 60000 },
  })
  @Get('analytics/report')
  async analyticsReport(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.googleService.getAnalyticsReport(
      req.user.organizationId,
      startDate,
      endDate,
    );
  }

  /*
   * Phase 33 — channel × landing page pull (additive).
   * GA4 classification used exactly as provided;
   * AI Assistant native, AIO/Mode clicks stay
   * Organic Search. Bounded; failures surface.
   */
  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: { limit: 30, ttl: 60000 },
  })
  @Get('analytics/channel-report')
  async analyticsChannelReport(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.googleService.getAnalyticsChannelReport(
      req.user.organizationId,
      startDate,
      endDate,
    );
  }
}


