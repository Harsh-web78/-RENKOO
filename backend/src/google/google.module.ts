import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { GoogleController } from './google.controller';
import { GoogleService } from './google.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  controllers: [
    GoogleController,
  ],

  providers: [
    GoogleService,
  ],

  exports: [
    GoogleService,
  ],
})
export class GoogleModule {}