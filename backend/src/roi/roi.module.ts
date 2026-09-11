import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleModule } from '../google/google.module';
import { KeywordsModule } from '../keywords/keywords.module';
import { RoiController } from './roi.controller';
import { RoiService } from './roi.service';
import { SearchRevenueService } from './search-revenue.service';
import { RevenueAttributionService } from './revenue-attribution.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GoogleModule,
    KeywordsModule,
  ],
  controllers: [RoiController],
  providers: [RoiService, SearchRevenueService, RevenueAttributionService],
  exports: [RoiService, SearchRevenueService, RevenueAttributionService],
})
export class RoiModule {}