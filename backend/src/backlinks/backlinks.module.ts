import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

import { BacklinksController } from './backlinks.controller';
import { BacklinksService } from './backlinks.service';
import { AuthorityIntelligenceService } from './authority-intelligence.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    MonitoringModule,
  ],

  controllers: [
    BacklinksController,
  ],

  providers: [
    BacklinksService,
    AuthorityIntelligenceService,
  ],

  exports: [
    BacklinksService,
    AuthorityIntelligenceService,
  ],
})
export class BacklinksModule {}
