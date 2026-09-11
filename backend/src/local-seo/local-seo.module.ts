import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { GoogleModule } from '../google/google.module';

import { LocalSeoController } from './local-seo.controller';
import { LocalSeoService } from './local-seo.service';
import { LocalIntelligenceService } from './local-intelligence.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GoogleModule,
  ],
  controllers: [
    LocalSeoController,
  ],
  providers: [
    LocalSeoService,
    LocalIntelligenceService,
  ],
  exports: [
    LocalSeoService,
    LocalIntelligenceService,
  ],
})
export class LocalSeoModule {}
