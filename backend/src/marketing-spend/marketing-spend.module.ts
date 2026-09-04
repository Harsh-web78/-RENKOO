import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { MarketingSpendController } from './marketing-spend.controller';
import { MarketingSpendService } from './marketing-spend.service';

@Module({
  imports: [PrismaModule],
  controllers: [MarketingSpendController],
  providers: [MarketingSpendService],
  exports: [MarketingSpendService],
})
export class MarketingSpendModule {}
