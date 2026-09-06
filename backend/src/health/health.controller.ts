import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
  ) {}

  /*
   * Readiness: 200 when the database is reachable,
   * 503 otherwise. Body shape is unchanged so existing
   * clients keep working; orchestrators (Render) can now
   * actually detect and replace unhealthy instances.
   * The status is set directly (passthrough) so the
   * global exception filter never rewrites this body.
   */
  @Get()
  async getHealth(
    @Res({ passthrough: true }) res: Response,
  ) {
    const result =
      await this.healthService.readiness();

    if (!result.ok) {
      res.status(503);
    }

    return result;
  }

  /*
   * Liveness: cheap, no database. Tells the platform
   * the process itself is alive even when dependencies
   * are down.
   */
  @Get('live')
  getLive() {
    return {
      ok: true,
      service: 'renkoo-api',
      timestamp: new Date().toISOString(),
    };
  }
}
