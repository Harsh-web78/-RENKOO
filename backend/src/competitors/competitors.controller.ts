import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';

import { CompetitorsService } from './competitors.service';
import { CompetitorCrawlService } from './competitor-crawl.service';

import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { UpdateCompetitorDto } from './dto/update-competitor.dto';

@Controller('competitors')
@UseGuards(JwtAuthGuard)
export class CompetitorsController {
  constructor(
    private readonly competitorsService: CompetitorsService,
    private readonly competitorCrawlService: CompetitorCrawlService,
  ) {}

  // =========================================================
  // CREATE COMPETITOR
  // POST /api/competitors
  // =========================================================

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateCompetitorDto,
  ) {
    return this.competitorsService.create(
      req.user.organizationId,
      dto,
    );
  }

  // =========================================================
  // GET ALL COMPETITORS
  // GET /api/competitors
  // =========================================================

  @Get()
  findAll(
    @Req() req: any,
  ) {
    return this.competitorsService.findAll(
      req.user.organizationId,
    );
  }

  // =========================================================
  // CRAWL HISTORY
  // GET /api/competitors/:id/crawls
  // =========================================================

  @Get(':id/crawls')
  getCrawlHistory(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.competitorsService.getCrawlHistory(
      req.user.organizationId,
      id,
    );
  }

  // =========================================================
  // LATEST CRAWL
  // GET /api/competitors/:id/crawls/latest
  // =========================================================

  @Get(':id/crawls/latest')
  getLatestCrawl(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.competitorsService.getLatestCrawl(
      req.user.organizationId,
      id,
    );
  }

  // =========================================================
  // CRAWL DETAIL
  // GET /api/competitors/:id/crawls/:crawlId
  // =========================================================

  @Get(':id/crawls/:crawlId')
  getCrawlDetail(
    @Req() req: any,
    @Param('id') id: string,
    @Param('crawlId') crawlId: string,
  ) {
    return this.competitorsService.getCrawlDetail(
      req.user.organizationId,
      id,
      crawlId,
    );
  }

  // =========================================================
  // START COMPETITOR CRAWL
  // POST /api/competitors/:id/crawl
  //
  // IMPORTANT:
  // startCrawl() creates the DB crawl record and
  // starts the actual crawler in the background.
  //
  // This endpoint therefore returns immediately.
  // =========================================================

  @Post(':id/crawl')
  crawl(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.competitorCrawlService.startCrawl(
      req.user.organizationId,
      id,
    );
  }

  // =========================================================
  // GET ONE COMPETITOR
  // GET /api/competitors/:id
  // =========================================================

  @Get(':id')
  findOne(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.competitorsService.findOne(
      req.user.organizationId,
      id,
    );
  }

  // =========================================================
  // UPDATE COMPETITOR
  // PATCH /api/competitors/:id
  // =========================================================

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCompetitorDto,
  ) {
    return this.competitorsService.update(
      req.user.organizationId,
      id,
      dto,
    );
  }

  // =========================================================
  // DELETE COMPETITOR
  // DELETE /api/competitors/:id
  // =========================================================

  @Delete(':id')
  remove(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.competitorsService.remove(
      req.user.organizationId,
      id,
    );
  }
}