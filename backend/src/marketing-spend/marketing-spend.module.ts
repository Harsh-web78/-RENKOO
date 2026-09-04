import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketingSpendController } from './marketing-spend.controller';
import { MarketingSpendService } from './marketing-spend.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [MarketingSpendController],
  providers: [MarketingSpendService],
  exports: [MarketingSpendService],
})
export class MarketingSpendModule {}
