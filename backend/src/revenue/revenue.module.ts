import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { RevenueController } from './revenue.controller';
import { RevenueService } from './revenue.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    RevenueController,
  ],
  providers: [
    RevenueService,
  ],
  exports: [
    RevenueService,
  ],
})
export class RevenueModule {}
