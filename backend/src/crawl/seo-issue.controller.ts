import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { SeoIssueService } from './seo-issue.service';
import { UpdateIssueStatusDto } from './dto/update-issue-status.dto';

@Controller('issues')
@UseGuards(JwtAuthGuard)
export class SeoIssueController {
  constructor(
    private readonly seoIssueService: SeoIssueService,
  ) {}

  /*
   * =========================================================
   * GET ALL ISSUES FOR CRAWL
   * =========================================================
   */

  @Get('crawl/:crawlId')
  getIssuesByCrawl(
    @Req() req: any,
    @Param('crawlId') crawlId: string,
  ) {
    return this.seoIssueService.getIssuesByCrawl(
      req.user.organizationId,
      crawlId,
    );
  }

  /*
   * =========================================================
   * GET OPEN ISSUES
   * =========================================================
   */

  @Get('crawl/:crawlId/open')
  getOpenIssues(
    @Req() req: any,
    @Param('crawlId') crawlId: string,
  ) {
    return this.seoIssueService.getIssuesByCrawl(
      req.user.organizationId,
      crawlId,
      'OPEN',
    );
  }

  /*
   * =========================================================
   * GET FIXED ISSUES
   * =========================================================
   */

  @Get('crawl/:crawlId/fixed')
  getFixedIssues(
    @Req() req: any,
    @Param('crawlId') crawlId: string,
  ) {
    return this.seoIssueService.getIssuesByCrawl(
      req.user.organizationId,
      crawlId,
      'FIXED',
    );
  }

  /*
   * =========================================================
   * GET IGNORED ISSUES
   * =========================================================
   */

  @Get('crawl/:crawlId/ignored')
  getIgnoredIssues(
    @Req() req: any,
    @Param('crawlId') crawlId: string,
  ) {
    return this.seoIssueService.getIssuesByCrawl(
      req.user.organizationId,
      crawlId,
      'IGNORED',
    );
  }

  /*
   * =========================================================
   * GET SINGLE ISSUE
   * =========================================================
   */

  @Get(':id')
  getIssue(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.seoIssueService.getIssue(
      req.user.organizationId,
      id,
    );
  }

  /*
   * =========================================================
   * UPDATE STATUS
   * =========================================================
   */

  @Patch(':id/status')
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateIssueStatusDto,
  ) {
    return this.seoIssueService.updateStatus(
      req.user.organizationId,
      id,
      dto.status,
    );
  }

  /*
   * =========================================================
   * RESOLVE
   * =========================================================
   */

  @Post(':id/resolve')
  resolveIssue(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.seoIssueService.resolveIssue(
      req.user.organizationId,
      id,
    );
  }

  /*
   * =========================================================
   * IGNORE
   * =========================================================
   */

  @Post(':id/ignore')
  ignoreIssue(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.seoIssueService.ignoreIssue(
      req.user.organizationId,
      id,
    );
  }

  /*
   * =========================================================
   * REOPEN
   * =========================================================
   */

  @Post(':id/reopen')
  reopenIssue(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.seoIssueService.reopenIssue(
      req.user.organizationId,
      id,
    );
  }
}