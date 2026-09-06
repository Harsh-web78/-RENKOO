import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IntelligenceService } from './intelligence.service';

import {
  AskIntelligenceDto,
  CreateIntelligenceActionDto,
} from './dto/ask.dto';

@Controller('intelligence')
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(
    private readonly intelligenceService: IntelligenceService,
  ) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('ask')
  ask(
    @Req() req: any,
    @Body() dto: AskIntelligenceDto,
  ) {
    return this.intelligenceService.ask(
      req.user.organizationId,
      dto.websiteId,
      dto.question,
    );
  }

  @Post('agency')
  agency(
    @Req() req: any,
    @Body() dto: { question?: string },
  ) {
    return this.intelligenceService.askAgency(
      req.user.organizationId,
      String(dto?.question ?? ''),
    );
  }

  @Post('actions')
  createAction(
    @Req() req: any,
    @Body() dto: CreateIntelligenceActionDto,
  ) {
    return this.intelligenceService.createAction(
      req.user.organizationId,
      dto.websiteId,
      dto.recommendationId,
      dto.opportunityId,
    );
  }
}
