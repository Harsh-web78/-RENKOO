import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AiVisibilityController } from './ai-visibility.controller';
import { AiVisibilityService } from './ai-visibility.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    AiVisibilityController,
  ],
  providers: [
    AiVisibilityService,
  ],
  exports: [
    AiVisibilityService,
  ],
})
export class AiVisibilityModule {}