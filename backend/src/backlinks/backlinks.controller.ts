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
}
