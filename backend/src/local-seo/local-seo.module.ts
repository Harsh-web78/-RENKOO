import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

import { LocalSeoController } from './local-seo.controller';
import { LocalSeoService } from './local-seo.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    LocalSeoController,
  ],
  providers: [
    LocalSeoService,
  ],
  exports: [
    LocalSeoService,
  ],
})
export class LocalSeoModule {}
