import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RoiController } from './roi.controller';
import { RoiService } from './roi.service';

@Module({
  imports: [PrismaModule],
  controllers: [RoiController],
  providers: [RoiService],
  exports: [RoiService],
})
export class RoiModule {}
