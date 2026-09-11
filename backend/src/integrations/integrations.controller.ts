import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IntegrationsService } from './integrations.service';

/*
 * Integration Hub reads (Phase 21): stored connection
 * metadata only — no provider API calls, no secrets.
 * OAuth connect/disconnect stay provider-owned; the
 * hub composes status, capabilities and diagnostics.
 */
@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
  ) {}

  @Get()
  hub(@Req() req: any) {
    return this.integrations.getIntegrations(
      req.user.organizationId,
    );
  }

  @Get('capabilities')
  capabilities(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.integrations.getCapabilities(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('onboarding')
  onboarding(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.integrations.onboarding(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':provider/status')
  providerStatus(
    @Req() req: any,
    @Param('provider') provider: string,
    @Query('websiteId') websiteId?: string,
  ) {
    return this.integrations.getProviderStatus(
      req.user.organizationId,
      provider,
      websiteId,
    );
  }

  @Post(':provider/disconnect')
  disconnect(
    @Req() req: any,
    @Param('provider') provider: string,
    @Body() _body: Record<string, unknown>,
  ) {
    void _body;
    return this.integrations.disconnect(
      req.user.organizationId,
      provider,
    );
  }
}
