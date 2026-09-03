import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { GoogleModule } from '../google/google.module';
import { PrismaModule } from '../prisma/prisma.module';

import { ContentController } from './content.controller';
import { ContentService } from './content.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    GoogleModule,
  ],

  controllers: [
    ContentController,
  ],

  providers: [
    ContentService,
  ],

  exports: [
    ContentService,
  ],
})
export class ContentModule {}
