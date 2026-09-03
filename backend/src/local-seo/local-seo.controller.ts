import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LocalSeoService } from './local-seo.service';

@Controller('local-seo')
@UseGuards(JwtAuthGuard)
export class LocalSeoController {
  constructor(
    private readonly localSeoService: LocalSeoService,
  ) {}

  @Get(':websiteId/summary')
  summary(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.summary(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/audits')
  audits(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.audits(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/queries')
  queries(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.queries(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/opportunities')
  opportunities(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.localSeoService.opportunities(
      req.user.organizationId,
      websiteId,
    );
  }
}
