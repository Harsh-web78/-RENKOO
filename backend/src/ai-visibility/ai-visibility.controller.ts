import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiVisibilityService } from './ai-visibility.service';

@Controller('ai-visibility')
@UseGuards(JwtAuthGuard)
export class AiVisibilityController {
  constructor(
    private readonly aiVisibilityService: AiVisibilityService,
  ) {}

  @Get('dashboard')
  async dashboard(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiVisibilityService.getDashboard(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('history')
  async history(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('days') days?: string,
  ) {
    return this.aiVisibilityService.getHistory(
      req.user.organizationId,
      websiteId,
      Number(days) || 30,
    );
  }

  @Post('snapshot')
  async snapshot(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiVisibilityService.createSnapshot(
      req.user.organizationId,
      websiteId,
    );
  }
}
