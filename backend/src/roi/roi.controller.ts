import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RoiService } from './roi.service';

@Controller('roi')
@UseGuards(JwtAuthGuard)
export class RoiController {
  constructor(
    private readonly roiService: RoiService,
  ) {}

  @Get(':websiteId/summary')
  summary(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.roiService.summary(
      req.user.organizationId,
      websiteId,
      from,
      to,
    );
  }
}
