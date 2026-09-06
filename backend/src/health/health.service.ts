import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private configured(
    ...names: string[]
  ): boolean {
    return names.every((name) => {
      const value = this.config.get<string>(
        name,
      );

      return (
        typeof value === 'string' &&
        value.trim().length > 0
      );
    });
  }

  async readiness() {
    let database: 'UP' | 'DOWN' =
      'DOWN';
    let databaseLatencyMs: number | null =
      null;

    try {
      const started = Date.now();

      await this.prisma.$queryRaw`SELECT 1`;

      databaseLatencyMs =
        Date.now() - started;
      database = 'UP';
    } catch {
      database = 'DOWN';
    }

    /*
     * Presence flags only — never values. Optional
     * providers being down must not mark the app
     * itself as down.
     */
    const providers = {
      stripe: this.configured(
        'STRIPE_SECRET_KEY',
      ),
      stripeWebhooks: this.configured(
        'STRIPE_WEBHOOK_SECRET',
      ),
      email: this.configured(
        'RESEND_API_KEY',
      ),
      googleOAuth: this.configured(
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
      ),
    };

    return {
      ok: database === 'UP',
      service: 'renkoo-api',
      timestamp:
        new Date().toISOString(),
      database: {
        status: database,
        latencyMs:
          databaseLatencyMs,
      },
      providers,
    };
  }
}
