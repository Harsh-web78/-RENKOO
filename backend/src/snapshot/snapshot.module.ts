import { Module } from '@nestjs/common';

import { AiVisibilityModule } from '../ai-visibility/ai-visibility.module';

import { SnapshotController } from './snapshot.controller';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [AiVisibilityModule],
  controllers: [SnapshotController],
  providers: [SnapshotService],
})
export class SnapshotModule {}
