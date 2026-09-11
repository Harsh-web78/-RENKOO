import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';

import { AiMonitoringService } from './ai-monitoring.service';
import { SchedulerSecretGuard } from './scheduler-secret.guard';

/*
 * =========================================================
 * MONITORING INTERNAL TICK CONTROLLER (Phase 8A).
 *
 * External cron trilogy (call in order, each idempotent
 * and safe to repeat):
 *
 *   POST /monitoring/internal/due
 *     → claim due schedules (fast, no AI execution)
 *   POST /monitoring/internal/execute-next
 *     → execute the oldest QUEUED run (repeat until
 *       { executed: false })
 *   POST /monitoring/internal/recover
 *     → fail stale RUNNING rows left by crashed workers
 *
 * Optional retention (disabled unless days > 0):
 *
 *   POST /monitoring/internal/prune
 *
 * Auth is the scheduler secret only (no user JWT
 * exists for a cron tick). Guarded + rate-limited.
 * Never logs secrets.
 * =========================================================
 */

@Throttle({
  default: { limit: 30, ttl: 60000 },
})
@UseGuards(SchedulerSecretGuard)
@Controller('monitoring/internal')
export class AiMonitoringSchedulerController {
  constructor(
    private readonly monitoring: AiMonitoringService,
  ) {}

  @Post('due')
  async due() {
    return this.monitoring.claimDueRuns();
  }

  @Post('execute-next')
  async executeNext() {
    return this.monitoring.executeNextRun();
  }

  @Post('recover')
  async recover() {
    return this.monitoring.recoverStaleRuns();
  }

  @Post('prune')
  async prune(
    @Body()
    body: {
      retentionDays?: number;
    },
  ) {
    return this.monitoring.pruneObservations(
      body?.retentionDays,
    );
  }
}
