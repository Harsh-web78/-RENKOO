import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { Response } from 'express';

import { GoogleService } from './google.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
  connect(@Req() req: any) {
    const organizationId =
      req.user.organizationId;

    const authorizationUrl =
      this.googleService.getAuthorizationUrl(
        organizationId,
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
   * GOOGLE OAUTH CALLBACK
   * =========================================================
   */

  @Get('callback')
  async callback(
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    if (error) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/integrations?google=error`,
      );
    }

    if (!code || !state) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/integrations?google=error`,
      );
    }

    try {
      const organizationId = this.googleService.verifyOAuthState(state);

      const connection =
        await this.googleService.handleCallback(
          code,
        );

      await this.googleService.saveConnection(
        organizationId,
        connection,
      );

      return res.redirect(
        `${process.env.FRONTEND_URL}/`,
      );
    } catch (error) {
      console.error(
        'Google OAuth callback failed:',
        error,
      );

      return res.redirect(
        `${process.env.FRONTEND_URL}/integrations?google=error`,
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
}


