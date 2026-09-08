import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { ProofController } from './proof.controller';
import { ProofService } from './proof.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ProofController],
  providers: [ProofService],
  exports: [ProofService],
})
export class ProofModule {}
