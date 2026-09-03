import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { ComparisonController } from './comparison.controller';
import { ComparisonService } from './comparison.service';
import { OpportunityService } from './opportunity.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    ComparisonController,
  ],
  providers: [
    ComparisonService,
    OpportunityService,
  ],
  exports: [
    ComparisonService,
    OpportunityService,
  ],
})
export class ComparisonModule {}
