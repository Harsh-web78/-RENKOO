import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { ActivationService } from './activation.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly activation: ActivationService,
  ) {}

  @Get('bootstrap')
  getBootstrap(
    @Req() req: any,
    @Query('websiteId') websiteId?: string,
  ): Promise<any> {
    return this.dashboardService.getBootstrap(
      req.user.organizationId,
      websiteId,
    );
  }

  /*
   * Activation + time-to-first-value (Phase 30):
   * read-only growth snapshot and funnel derived from
   * existing records. No new tables, charged:false.
   */

  @Get('activation')
  getActivation(
    @Req() req: any,
    @Query('websiteId') websiteId?: string,
  ): Promise<any> {
    return this.activation.getActivation(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('activation/funnel')
  getFunnel(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ): Promise<any> {
    return this.activation.getFunnel(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get()
  getDashboard(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    return this.dashboardService.getDashboard(
      req.user.organizationId,
      websiteId,
      startDate,
      endDate,
    );
  }
}