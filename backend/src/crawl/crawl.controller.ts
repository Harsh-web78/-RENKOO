import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from '../billing/billing.service';

import { CrawlService } from './crawl.service';
import { CrawlAnalysisService } from './crawl-analysis.service';
import { RecommendationService } from './recommendation.service';

import { CrawlWebsiteDto } from './dto/crawl-website.dto';

@Controller('crawl')
@UseGuards(JwtAuthGuard)
export class CrawlController {
  constructor(
    private readonly crawlService: CrawlService,
    private readonly crawlAnalysisService: CrawlAnalysisService,
    private readonly recommendationService: RecommendationService,
    private readonly billingService: BillingService,
  ) {}

  @Post()
  async crawl(
    @Req() req: any,
    @Body() dto: CrawlWebsiteDto,
  ) {
    const organizationId =
      req.user.organizationId;

    /*
     * SERVER-SIDE BILLING ENFORCEMENT
     *
     * Check the organization's subscription
     * and available crawl credits BEFORE
     * starting the crawl.
     */
    await this.billingService.checkUsage(
      organizationId,
      'CRAWL_CREDITS',
    );

    /*
     * Start the real crawl.
     *
     * No fake/mock crawl is introduced.
     */
    const result =
      await this.crawlService.crawlWebsite(
        organizationId,
        dto.websiteId,
      );

    /*
     * Only consume the credit after the
     * crawl operation has successfully started.
     */
    await this.billingService.consumeUsage(
      organizationId,
      'CRAWL_CREDITS',
      1,
    );

    return result;
  }

  @Get('latest/:websiteId/summary')
  getLatestSummary(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.crawlService.getLatestCrawlSummary(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':id')
  getCrawl(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.crawlService.getCrawl(
      req.user.organizationId,
      id,
    );
  }

  @Get(':id/summary')
  getSummary(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.crawlService.getCrawlSummary(
      req.user.organizationId,
      id,
    );
  }

  @Get(':id/analysis')
  analyzeCrawl(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.crawlAnalysisService.analyzeCrawl(
      req.user.organizationId,
      id,
    );
  }

  /*
   * =========================================================
   * SEO RECOMMENDATIONS
   * GET /api/crawl/:id/recommendations
   * =========================================================
   */

  @Get(':id/recommendations')
  async recommendations(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const analysis =
      await this.crawlAnalysisService.analyzeCrawl(
        req.user.organizationId,
        id,
      );

    const recommendations =
      this.recommendationService.generateRecommendations(
        analysis,
      );

    return {
      crawlId: id,
      total: recommendations.length,
      recommendations,
    };
  }
}
