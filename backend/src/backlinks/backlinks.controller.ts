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
import { BacklinksService } from './backlinks.service';
import { ImportBacklinksDto } from './dto/import-backlinks.dto';

@Controller('backlinks')
@UseGuards(JwtAuthGuard)
export class BacklinksController {
  constructor(
    private readonly backlinksService: BacklinksService,
  ) {}

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
  ) {
    return this.backlinksService.getBacklinks(
      req.user.organizationId,
      websiteId,
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
}
