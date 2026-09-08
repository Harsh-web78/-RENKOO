import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { resolveClientIp } from '../common/proxy/trust-proxy';
import { SnapshotService } from './snapshot.service';
import { SnapshotDomainDto } from './dto/snapshot-domain.dto';

/*
 * Public, unauthenticated AI Visibility Snapshot.
 * Deliberately NOT behind JwtAuthGuard: this is an
 * anonymous marketing snapshot with no workspace I/O.
 * Protection is layered: global throttle + strict
 * per-minute throttle + per-IP / per-domain windows +
 * 24h result cache + monthly call budget inside the
 * service. No billing, no Prisma writes, no entitlements.
 */
@Controller('snapshot')
export class SnapshotController {
  constructor(
    private readonly snapshotService: SnapshotService,
  ) {}

  /*
   * Spoof-safe client IP: Express resolves req.ip through
   * the trust-proxy function (LB peers only), so a forged
   * X-Forwarded-For from an untrusted direct peer is ignored.
   */
  private clientIp(req: any): string {
    return resolveClientIp(req);
  }

  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @Post('ai-visibility')
  run(
    @Req() req: any,
    @Body() body: SnapshotDomainDto,
  ) {
    return this.snapshotService.runSnapshot(
      body?.domain,
      this.clientIp(req),
    );
  }

  @Throttle({
    default: { limit: 30, ttl: 60000 },
  })
  @Get('ai-visibility')
  cached(
    @Query('domain') domain?: string,
  ) {
    return this.snapshotService.readCached(
      domain,
    );
  }
}
