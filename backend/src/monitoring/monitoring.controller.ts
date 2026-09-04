import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  MonitoringAlertFilters,
  MonitoringService,
} from './monitoring.service';

@Controller('monitoring')
@UseGuards(JwtAuthGuard)
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('alerts')
  list(
    @Req() req: any,
    @Query('websiteId') websiteId?: string,
    @Query('source') source?: string,
    @Query('severity') severity?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const filters: MonitoringAlertFilters = {
      websiteId,
      source,
      severity,
      status,
      from,
      to,
    };

    return this.monitoringService.listAlerts(
      req.user.organizationId,
      filters,
    );
  }

  @Get('alerts/summary')
  summary(
    @Req() req: any,
    @Query('websiteId') websiteId?: string,
  ) {
    return this.monitoringService.getSummary(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('alerts/unread-count')
  unreadCount(
    @Req() req: any,
    @Query('websiteId') websiteId?: string,
  ) {
    return this.monitoringService.getUnreadCount(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('alerts/:id')
  detail(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.monitoringService.getAlert(
      req.user.organizationId,
      id,
    );
  }

  @Patch('alerts/:id/acknowledge')
  acknowledge(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.monitoringService.acknowledgeAlert(
      req.user.organizationId,
      id,
    );
  }

  @Patch('alerts/:id/resolve')
  resolve(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.monitoringService.resolveAlert(
      req.user.organizationId,
      id,
    );
  }
}