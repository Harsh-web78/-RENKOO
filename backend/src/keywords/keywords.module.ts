import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { KeywordsController } from './keywords.controller';
import { KeywordsService } from './keywords.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],

  controllers: [
    KeywordsController,
  ],

  providers: [
    KeywordsService,
  ],

  exports: [
    KeywordsService,
  ],
})
export class KeywordsModule {}