import {
  Controller,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ComparisonService } from './comparison.service';
import { OpportunityService } from './opportunity.service';

@Controller('comparison')
@UseGuards(JwtAuthGuard)
export class ComparisonController {
  constructor(
    private readonly comparisonService: ComparisonService,
    private readonly opportunityService: OpportunityService,
  ) {}

  @Get('competitors/:competitorId')
  async compare(
    @Req() req: any,
    @Param('competitorId') competitorId: string,
  ): Promise<any> {
    const comparison =
      await this.comparisonService.compare(
        req.user.organizationId,
        competitorId,
      );

    const opportunities =
      this.opportunityService.generate(
        comparison,
      );

    return {
      ...comparison,
      opportunities,
      opportunitySummary: {
        total: opportunities.length,
        critical: opportunities.filter(
          o => o.priority === 'CRITICAL',
        ).length,
        high: opportunities.filter(
          o => o.priority === 'HIGH',
        ).length,
        medium: opportunities.filter(
          o => o.priority === 'MEDIUM',
        ).length,
        low: opportunities.filter(
          o => o.priority === 'LOW',
        ).length,
        totalImpactScore:
          opportunities.reduce(
            (sum, o) =>
              sum + o.impactScore,
            0,
          ),
      },
    };
  }
}
