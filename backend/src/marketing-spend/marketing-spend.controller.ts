import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MarketingSpendService } from './marketing-spend.service';

@Controller('marketing-spend')
@UseGuards(JwtAuthGuard)
export class MarketingSpendController {
  constructor(
    private readonly marketingSpendService: MarketingSpendService,
  ) {}

  @Post(':websiteId')
  create(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() body: any,
  ) {
    return this.marketingSpendService.create(
      req.user.organizationId,
      websiteId,
      body,
    );
  }

  @Get(':websiteId/summary')
  summary(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.marketingSpendService.summary(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId')
  list(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.marketingSpendService.list(
      req.user.organizationId,
      websiteId,
    );
  }

  @Delete(':websiteId/:id')
  remove(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
  ) {
    return this.marketingSpendService.remove(
      req.user.organizationId,
      websiteId,
      id,
    );
  }
}
