import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AeoController } from './aeo.controller';
import { AeoService } from './aeo.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
  ],
  controllers: [
    AeoController,
  ],
  providers: [
    AeoService,
  ],
  exports: [
    AeoService,
  ],
})
export class AeoModule {}
