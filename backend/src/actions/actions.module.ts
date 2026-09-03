import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    ActionsController,
  ],
  providers: [
    ActionsService,
  ],
  exports: [
    ActionsService,
  ],
})
export class ActionsModule {}