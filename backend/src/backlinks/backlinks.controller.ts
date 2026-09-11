import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BacklinksService } from './backlinks.service';
import { AuthorityIntelligenceService } from './authority-intelligence.service';
import {
  CreateBacklinkOpportunityDto,
  ImportBacklinksDto,
  ReconcileBacklinksDto,
  UpdateBacklinkOpportunityDto,
} from './dto/import-backlinks.dto';

@Controller('backlinks')
@UseGuards(JwtAuthGuard)
export class BacklinksController {
  constructor(
    private readonly backlinksService: BacklinksService,
    private readonly authority: AuthorityIntelligenceService,
  ) {}

  @Get('provider/status')
  getProviderStatus() {
    return this.backlinksService.getProviderStatus();
  }

  @Get(':websiteId')
  getOverview(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.backlinksService.getOverview(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/list')
  getBacklinks(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('status') status?: string,
    @Query('linkType') linkType?: string,
    @Query('domain') domain?: string,
    @Query('quality') quality?: string,
  ) {
    return this.backlinksService.getBacklinks(
      req.user.organizationId,
      websiteId,
      {
        status,
        linkType,
        domain,
        quality,
      },
    );
  }

  @Get(':websiteId/domains')
  getDomains(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.backlinksService.getDomains(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/history')
  getHistory(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.backlinksService.getHistory(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/competitor-gap')
  getCompetitorGap(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.backlinksService.getCompetitorGap(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/opportunities')
  getOpportunities(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.backlinksService.getOpportunities(
      req.user.organizationId,
      websiteId,
    );
  }

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post(':websiteId/import')
  importBacklinks(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() dto: ImportBacklinksDto,
  ) {
    return this.backlinksService.importBacklinks(
      req.user.organizationId,
      websiteId,
      dto,
    );
  }

  /*
   * Explicit observed-set reconciliation.
   * ACTIVE links absent from the observed set
   * are marked LOST. Never runs implicitly.
   */
  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post(':websiteId/reconcile')
  reconcile(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() dto: ReconcileBacklinksDto,
  ) {
    return this.backlinksService.reconcile(
      req.user.organizationId,
      websiteId,
      dto.observedUrls ?? [],
    );
  }

  @Post(':websiteId/opportunities')
  createOpportunity(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateBacklinkOpportunityDto,
  ) {
    return this.backlinksService.createOpportunity(
      req.user.organizationId,
      websiteId,
      dto,
    );
  }

  @Patch(':websiteId/opportunities/:id')
  updateOpportunity(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBacklinkOpportunityDto,
  ) {
    return this.backlinksService.updateOpportunityStatus(
      req.user.organizationId,
      websiteId,
      id,
      dto,
    );
  }

  @Post(
    ':websiteId/opportunities/:id/recommendation',
  )
  toRecommendation(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
  ) {
    return this.backlinksService.toRecommendation(
      req.user.organizationId,
      websiteId,
      id,
    );
  }

  /*
   * AUTHORITY INTELLIGENCE 1.0 (Phase 18) — composition
   * over stored backlink evidence + bounded CSV import.
   * No backlink index, no DR/DA, no scores. Reads are
   * charged:false; import is charged:false.
   */

  @Get(':websiteId/authority/overview')
  authorityOverview(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.authority.getAuthorityOverview(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/authority/opportunities')
  authorityOpportunities(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    return this.authority.getLinkOpportunities(
      req.user.organizationId,
      websiteId,
      Number.isFinite(parsed) ? parsed : 20,
    );
  }

  @Get(':websiteId/authority/competitor-gap')
  authorityCompetitorGap(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    return this.authority.getCompetitorIntersect(
      req.user.organizationId,
      websiteId,
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Get(':websiteId/authority/pages')
  authorityPages(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number(limit);
    return this.authority.getAuthorityPages(
      req.user.organizationId,
      websiteId,
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post(':websiteId/authority/import/preview')
  authorityImportPreview(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() body: { csv?: string },
  ) {
    return this.authority.previewCsvImport(
      req.user.organizationId,
      websiteId,
      body?.csv ?? '',
    );
  }

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post(':websiteId/authority/import/confirm')
  authorityImportConfirm(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() body: { csv?: string },
  ) {
    return this.authority.confirmCsvImport(
      req.user.organizationId,
      websiteId,
      body?.csv ?? '',
    );
  }
}
