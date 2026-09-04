import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RoiController } from './roi.controller';
import { RoiService } from './roi.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [RoiController],
  providers: [RoiService],
  exports: [RoiService],
})
export class RoiModule {}