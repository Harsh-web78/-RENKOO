import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleModule } from '../google/google.module';
import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';
import { ContentModule } from '../content/content.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GoogleModule,
    AiVisibilityModule,
    ContentModule,
  ],
  controllers: [
    DashboardController,
  ],
  providers: [
    DashboardService,
  ],
  exports: [
    DashboardService,
  ],
})
export class DashboardModule {}