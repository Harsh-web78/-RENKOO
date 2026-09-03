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
import { RevenueService } from './revenue.service';

@Controller('revenue')
@UseGuards(JwtAuthGuard)
export class RevenueController {
  constructor(
    private readonly revenueService: RevenueService,
  ) {}

  @Get(':websiteId/summary')
  summary(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.revenueService.summary(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId')
  list(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.revenueService.list(
      req.user.organizationId,
      websiteId,
    );
  }

  @Post(':websiteId')
  create(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() body: any,
  ) {
    return this.revenueService.create(
      req.user.organizationId,
      websiteId,
      body,
    );
  }
}
