import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ComparisonModule } from '../comparison/comparison.module';
import { GoogleModule } from '../google/google.module';

import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ComparisonModule,
    GoogleModule,
  ],
  controllers: [
    RecommendationsController,
  ],
  providers: [
    RecommendationsService,
  ],
  exports: [
    RecommendationsService,
  ],
})
export class RecommendationsModule {}
