import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BusinessBrainModule } from '../business-brain/business-brain.module';
import { BillingModule } from '../billing/billing.module';

import { AiVisibilityController } from './ai-visibility.controller';
import { AiVisibilityService } from './ai-visibility.service';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { AiProviderRegistry } from './providers/provider.registry';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BusinessBrainModule,
    BillingModule,
  ],
  controllers: [
    AiVisibilityController,
  ],
  providers: [
    AiVisibilityService,
    GeminiProvider,
    OpenAiProvider,
    AiProviderRegistry,
  ],
  exports: [
    AiVisibilityService,
    AiProviderRegistry,
  ],
})
export class AiVisibilityModule {}
