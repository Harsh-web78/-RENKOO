import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiVisibilityService } from './ai-visibility.service';
import {
  CreateAiVisibilityQueryDto,
  UpdateAiVisibilityQueryDto,
} from './dto/ai-visibility-query.dto';
import { RecordAiCheckDto } from './dto/record-ai-check.dto';
import { RunAiCheckDto } from './dto/run-ai-check.dto';

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

  @Get('intelligence')
  async intelligence(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.aiVisibilityService.getIntelligence(
      req.user.organizationId,
      websiteId,
    );
  }

  @Post('queries')
  async createQuery(
    @Req() req: any,
    @Body() dto: CreateAiVisibilityQueryDto,
  ) {
    return this.aiVisibilityService.createQuery(
      req.user.organizationId,
      dto,
    );
  }

  @Patch('queries/:id')
  async updateQuery(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAiVisibilityQueryDto,
  ) {
    return this.aiVisibilityService.updateQuery(
      req.user.organizationId,
      id,
      dto,
    );
  }

  @Delete('queries/:id')
  async deleteQuery(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.aiVisibilityService.deleteQuery(
      req.user.organizationId,
      id,
    );
  }

  @Post('queries/suggest')
  async suggestQueries(
    @Req() req: any,
    @Body() body: { websiteId?: string },
  ) {
    return this.aiVisibilityService.suggestQueries(
      req.user.organizationId,
      String(body?.websiteId ?? ''),
    );
  }

  @Post('checks')
  async recordCheck(
    @Req() req: any,
    @Body() dto: RecordAiCheckDto,
  ) {
    return this.aiVisibilityService.recordCheck(
      req.user.organizationId,
      dto,
    );
  }

  /*
   * Connection honesty matrix: live providers
   * report real key presence; Perplexity /
   * Anthropic are declared NOT_CONFIGURED.
   */
  @Get('providers')
  async providerStates(@Req() req: any) {
    void req;

    return {
      providers:
        this.aiVisibilityService.listLiveProviderStates(),
      googleAiSearch: {
        id: 'GOOGLE_AI_SEARCH',
        displayName: 'Google AI Search',
        state: 'NOT_CONNECTED',
        reason:
          'Google AI Overview / AI Mode is not connected. Gemini API results are labeled GEMINI_RESPONSE and are never presented as Google Search output.',
      },
    };
  }

  /*
   * Manual controlled live execution of one
   * tracked or ad-hoc prompt against one
   * provider. Strictly rate-limited; each call
   * consumes one AI_SCANS unit via the
   * entitlement engine (LIMIT_REACHED enforced).
   */
  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('checks/run')
  async runCheck(
    @Req() req: any,
    @Body() dto: RunAiCheckDto,
  ) {
    return this.aiVisibilityService.runCheck(
      req.user.organizationId,
      dto,
    );
  }
}
