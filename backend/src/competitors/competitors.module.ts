import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { CompetitorsController } from './competitors.controller';
import { CompetitorsService } from './competitors.service';
import { CompetitorCrawlService } from './competitor-crawl.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  controllers: [
    CompetitorsController,
  ],

  providers: [
    CompetitorsService,
    CompetitorCrawlService,
  ],

  exports: [
    CompetitorsService,
    CompetitorCrawlService,
  ],
})
export class CompetitorsModule {}