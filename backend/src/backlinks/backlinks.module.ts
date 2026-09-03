import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { BacklinksController } from './backlinks.controller';
import { BacklinksService } from './backlinks.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  controllers: [
    BacklinksController,
  ],

  providers: [
    BacklinksService,
  ],

  exports: [
    BacklinksService,
  ],
})
export class BacklinksModule {}
