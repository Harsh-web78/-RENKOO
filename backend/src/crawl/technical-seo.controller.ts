import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { TechnicalSeoService } from './technical-seo.service';

@Controller('technical-seo')
@UseGuards(JwtAuthGuard)
export class TechnicalSeoController {
  constructor(
    private readonly technicalSeoService: TechnicalSeoService,
  ) {}

  /*
   * =========================================================
   * LATEST TECHNICAL SEO REPORT
   * =========================================================
   *
   * GET /technical-seo/latest/:websiteId
   *
   * Returns the latest valid completed crawl
   * containing at least one crawled page.
   */

  @Get('latest/:websiteId')
  async getLatest(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.technicalSeoService.getLatest(
      req.user.organizationId,
      websiteId,
    );
  }

  /*
   * =========================================================
   * SPECIFIC CRAWL TECHNICAL SEO REPORT
   * =========================================================
   *
   * GET /technical-seo/crawl/:crawlId
   */

  @Get('crawl/:crawlId')
  async getByCrawl(
    @Req() req: any,
    @Param('crawlId') crawlId: string,
  ) {
    return this.technicalSeoService.getByCrawl(
      req.user.organizationId,
      crawlId,
    );
  }
}