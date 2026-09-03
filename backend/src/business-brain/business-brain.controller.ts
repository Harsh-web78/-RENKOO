import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessBrainService } from './business-brain.service';
import { UpdateBusinessBrainDto } from './dto/update-business-brain.dto';

@Controller('business-brain')
@UseGuards(JwtAuthGuard)
export class BusinessBrainController {
  constructor(
    private readonly businessBrainService: BusinessBrainService,
  ) {}

  // =========================================================
  // GET BUSINESS BRAIN
  // GET /api/business-brain/:websiteId
  // =========================================================

  @Get(':websiteId')
  get(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.businessBrainService.get(
      req.user.organizationId,
      websiteId,
    );
  }

  // =========================================================
  // UPDATE BUSINESS BRAIN
  // PATCH /api/business-brain/:websiteId
  // =========================================================

  @Patch(':websiteId')
  update(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() dto: UpdateBusinessBrainDto,
  ) {
    return this.businessBrainService.upsert(
      req.user.organizationId,
      websiteId,
      dto,
    );
  }

  // =========================================================
  // ANALYZE BUSINESS BRAIN
  // POST /api/business-brain/:websiteId/analyze
  // =========================================================

  @Post(':websiteId/analyze')
  analyze(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.businessBrainService.analyze(
      req.user.organizationId,
      websiteId,
    );
  }
}