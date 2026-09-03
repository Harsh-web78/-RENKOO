import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContentService } from './content.service';

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
}
