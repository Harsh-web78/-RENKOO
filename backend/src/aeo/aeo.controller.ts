import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AeoService } from './aeo.service';

@Controller('aeo')
@UseGuards(JwtAuthGuard)
export class AeoController {
  constructor(
    private readonly aeoService: AeoService,
  ) {}

  @Get('audit')
  getLatestAudit(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aeoService.getLatestAudit(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('issues')
  getIssues(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aeoService.getIssues(
      req.user.organizationId,
      websiteId,
    );
  }

  @Post('audit')
  runAudit(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aeoService.runAudit(
      req.user.organizationId,
      websiteId,
    );
  }
}
