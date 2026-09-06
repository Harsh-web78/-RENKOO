import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LocalSeoService } from './local-seo.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
} from './dto/location.dto';
import {
  CreateLocalQueryDto,
  UpdateLocalQueryDto,
} from './dto/local-query.dto';
import {
  CreateCitationDto,
  UpdateCitationDto,
} from './dto/citation.dto';

@Controller('local-seo')
@UseGuards(JwtAuthGuard)
export class LocalSeoController {
  constructor(
    private readonly localSeoService: LocalSeoService,
  ) {}

  @Get(':websiteId/summary')
  summary(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.summary(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/audits')
  audits(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.audits(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/queries')
  queries(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.queries(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/opportunities')
  opportunities(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.opportunities(
      req.user.organizationId,
      websiteId,
    );
  }

  /*
   * Business locations (static paths before
   * :websiteId routes would clash, so these
   * live under /locations).
   */

  @Get('locations/all')
  listLocations(
    @Req() req: any,
    @Query('websiteId') websiteId?: string,
  ) {
    return this.localSeoService.listLocations(
      req.user.organizationId,
      websiteId,
    );
  }

  @Post('locations')
  createLocation(
    @Req() req: any,
    @Body() dto: CreateLocationDto,
  ) {
    return this.localSeoService.createLocation(
      req.user.organizationId,
      dto,
    );
  }

  @Patch('locations/:id')
  updateLocation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.localSeoService.updateLocation(
      req.user.organizationId,
      id,
      dto,
    );
  }

  @Delete('locations/:id')
  removeLocation(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.localSeoService.removeLocation(
      req.user.organizationId,
      id,
    );
  }

  /*
   * Local health: deterministic, evidence-only.
   * Unavailable sources never lower the rating.
   */
  @Get(':websiteId/health')
  health(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.getHealth(
      req.user.organizationId,
      websiteId,
    );
  }

  /*
   * Tracked local queries (positions only from a
   * verified future provider — none connected).
   */
  @Get(':websiteId/tracked-queries')
  listLocalQueries(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.listLocalQueries(
      req.user.organizationId,
      websiteId,
    );
  }

  @Post(':websiteId/tracked-queries')
  createLocalQuery(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body()
    dto: Omit<
      CreateLocalQueryDto,
      'websiteId'
    >,
  ) {
    return this.localSeoService.createLocalQuery(
      req.user.organizationId,
      { ...dto, websiteId },
    );
  }

  @Patch('tracked-queries/:id')
  updateLocalQuery(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateLocalQueryDto,
  ) {
    return this.localSeoService.updateLocalQuery(
      req.user.organizationId,
      id,
      dto,
    );
  }

  @Delete('tracked-queries/:id')
  removeLocalQuery(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.localSeoService.removeLocalQuery(
      req.user.organizationId,
      id,
    );
  }

  /*
   * Citations: manual records only, labeled
   * MANUAL. No provider discovery exists.
   */
  @Get('citations/all')
  listCitations(
    @Req() req: any,
    @Query('websiteId') websiteId?: string,
  ) {
    return this.localSeoService.listCitations(
      req.user.organizationId,
      websiteId,
    );
  }

  @Post('citations')
  createCitation(
    @Req() req: any,
    @Body() dto: CreateCitationDto,
  ) {
    return this.localSeoService.createCitation(
      req.user.organizationId,
      dto,
    );
  }

  @Patch('citations/:id')
  updateCitation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCitationDto,
  ) {
    return this.localSeoService.updateCitation(
      req.user.organizationId,
      id,
      dto,
    );
  }

  @Delete('citations/:id')
  removeCitation(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.localSeoService.removeCitation(
      req.user.organizationId,
      id,
    );
  }

  /*
   * Local competitors reuse the existing
   * competitor infrastructure, optionally
   * scoped to one location.
   */
  @Get(':websiteId/local-competitors')
  listLocalCompetitors(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('locationId')
    locationId?: string,
  ) {
    return this.localSeoService.listLocalCompetitors(
      req.user.organizationId,
      websiteId,
      locationId,
    );
  }

  @Post('competitors/:competitorId/attach')
  attachCompetitor(
    @Req() req: any,
    @Param('competitorId')
    competitorId: string,
    @Body()
    body: { locationId?: string | null },
  ) {
    return this.localSeoService.attachCompetitor(
      req.user.organizationId,
      competitorId,
      body?.locationId?.trim() || null,
    );
  }
}
