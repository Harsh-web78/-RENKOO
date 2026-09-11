import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

import { timingSafeStringEqual } from '../common/crypto/timing-safe';
import { schedulerConfigured } from './ai-monitoring-ops';

/*
 * =========================================================
 * SCHEDULER SECRET GUARD (Phase 8A).
 *
 * External cron authenticates with a shared secret
 * (x-scheduler-secret) instead of a user JWT — no user
 * session exists for a cron tick. Comparison is
 * constant-time; the secret never appears in logs.
 * When AI_MONITOR_SCHEDULER_SECRET is absent or too
 * short, every guarded route 503s instead of running
 * open. Never fall back to unauthenticated access.
 * =========================================================
 */

export const SCHEDULER_SECRET_HEADER =
  'x-scheduler-secret';

@Injectable()
export class SchedulerSecretGuard
  implements CanActivate
{
  canActivate(
    context: ExecutionContext,
  ): boolean {
    const configured = String(
      process.env.AI_MONITOR_SCHEDULER_SECRET ?? '',
    ).trim();

    if (!schedulerConfigured(configured)) {
      throw new ServiceUnavailableException(
        'Scheduler tick is not configured on this deployment.',
      );
    }

    const request =
      context.switchToHttp().getRequest();
    const provided = String(
      request.headers[SCHEDULER_SECRET_HEADER] ?? '',
    );

    if (
      !provided ||
      !timingSafeStringEqual(provided, configured)
    ) {
      throw new UnauthorizedException(
        'Invalid scheduler credentials',
      );
    }

    return true;
  }
}
