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
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContentService } from './content.service';
import {
  CreateBriefDto,
  CreateItemDto,
  GenerateDto,
  OptimizeDto,
  PublishConfirmDto,
  UpdateItemDto,
} from './dto/content.dto';

@Controller('content')
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(
    private readonly contentService: ContentService,
  ) {}

  @Get('opportunities')
  async opportunities(
    @Req() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('websiteId') websiteId?: string,
  ) {
    return this.contentService.getOpportunities(
      req.user.organizationId,
      startDate,
      endDate,
      websiteId,
    );
  }

  /*
   * Content items (workspace objects).
   */

  @Get('items')
  async listItems(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.contentService.listItems(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('items/:id')
  async getItem(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.contentService.getItem(
      req.user.organizationId,
      id,
    );
  }

  @Post('items')
  async createItem(
    @Req() req: any,
    @Body() dto: CreateItemDto,
  ) {
    return this.contentService.createItem(
      req.user.organizationId,
      dto,
    );
  }

  @Patch('items/:id')
  async updateItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.contentService.updateItem(
      req.user.organizationId,
      id,
      dto,
    );
  }

  @Delete('items/:id')
  async removeItem(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.contentService.removeItem(
      req.user.organizationId,
      id,
    );
  }

  /*
   * Evidence briefs (deterministic, persisted).
   */

  @Post('briefs')
  async generateBrief(
    @Req() req: any,
    @Body() dto: CreateBriefDto,
  ) {
    return this.contentService.generateBrief(
      req.user.organizationId,
      dto,
    );
  }

  @Get('briefs')
  async listBriefs(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.contentService.listBriefs(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('briefs/:id')
  async getBrief(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.contentService.getBrief(
      req.user.organizationId,
      id,
    );
  }

  @Delete('briefs/:id')
  async removeBrief(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.contentService.removeBrief(
      req.user.organizationId,
      id,
    );
  }

  /*
   * Metered AI generation (real provider only).
   */

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('generate')
  async generate(
    @Req() req: any,
    @Body() dto: GenerateDto,
  ) {
    return this.contentService.generate(
      req.user.organizationId,
      dto,
    );
  }

  @Get('drafts')
  async listDrafts(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.contentService.listDrafts(
      req.user.organizationId,
      websiteId,
      itemId,
    );
  }

  @Get('drafts/:id')
  async getDraft(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.contentService.getDraft(
      req.user.organizationId,
      id,
    );
  }

  /*
   * Optimization (deterministic checks).
   */

  @Post('optimize')
  async optimize(
    @Req() req: any,
    @Body() dto: OptimizeDto,
  ) {
    return this.contentService.analyzePage(
      req.user.organizationId,
      dto,
    );
  }

  /*
   * Refresh queue (GSC period evidence only).
   */

  @Get('refresh')
  async refresh(
    @Req() req: any,
    @Query('websiteId') websiteId?: string,
  ) {
    return this.contentService.getRefreshQueue(
      req.user.organizationId,
      websiteId,
    );
  }

  /*
   * Publishing honesty + explicit transitions.
   */

  @Get('publishing/status')
  async publishingStatus() {
    return this.contentService.publishingStatus();
  }

  @Post('items/:id/ready')
  async markReady(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.contentService.markReady(
      req.user.organizationId,
      id,
    );
  }

  @Post('items/:id/publish')
  async markPublished(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: PublishConfirmDto,
  ) {
    return this.contentService.markPublished(
      req.user.organizationId,
      id,
      dto.confirmed,
      dto.pageUrl,
    );
  }

  /*
   * Page performance (GSC + attributed records).
   */

  @Get('performance')
  async performance(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('pageUrl') pageUrl: string,
  ) {
    return this.contentService.getPerformance(
      req.user.organizationId,
      websiteId,
      pageUrl,
    );
  }
}
