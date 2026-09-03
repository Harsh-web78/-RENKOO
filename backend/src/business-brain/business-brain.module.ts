import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { BusinessBrainController } from './business-brain.controller';
import { BusinessBrainService } from './business-brain.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  controllers: [
    BusinessBrainController,
  ],

  providers: [
    BusinessBrainService,
  ],

  exports: [
    BusinessBrainService,
  ],
})
export class BusinessBrainModule {}