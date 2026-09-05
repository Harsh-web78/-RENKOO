import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EmailProviderError } from './email.errors';
import { EmailService } from './email.service';

class TestEmailDto {
  @IsEmail()
  to!: string;
}

/*
 * Safe email provider introspection.
 *
 * GET /email/status is public by design: it only
 * reports presence flags (CONFIGURED /
 * NOT_CONFIGURED) and never reveals secrets.
 *
 * POST /email/test requires authentication and is
 * rate-limited: it performs a single controlled
 * send to an explicitly provided address.
 */
@Controller('email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
  ) {}

  @Get('status')
  status() {
    const snapshot =
      this.emailService.getStatus();

    return {
      EMAIL_PROVIDER: snapshot.status,
      provider: snapshot.provider,
      senderConfigured:
        snapshot.senderConfigured,
      from: snapshot.from,
      appUrl: snapshot.appUrl,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({
    default: { limit: 3, ttl: 60000 },
  })
  @HttpCode(HttpStatus.OK)
  @Post('test')
  async sendTest(
    @Req() req: any,
    @Body() dto: TestEmailDto,
  ) {
    const to = dto.to.trim().toLowerCase();

    if (!to) {
      throw new BadRequestException(
        'A valid recipient email is required',
      );
    }

    try {
      const appUrl =
        this.emailService.resolveAppUrl();

      await this.emailService.sendNotificationEmail(
        {
          to,
          subject:
            'RENKOO email test — provider is working',
          title: 'Email provider is working',
          message: `This is a controlled test message from your RENKOO workspace. Transactional email delivery via Resend is operational. Requested by ${String(req.user?.email ?? 'workspace member')}.`,
          actionUrl: appUrl,
          actionLabel: 'Open RENKOO',
        },
      );

      return {
        EMAIL_PROVIDER: 'CONFIGURED',
        delivery: 'SENT',
        to,
      };
    } catch (error) {
      if (error instanceof EmailProviderError) {
        const httpStatus =
          error.code ===
          'PROVIDER_NOT_CONFIGURED'
            ? HttpStatus.SERVICE_UNAVAILABLE
            : error.code ===
                'SENDER_NOT_VERIFIED'
              ? HttpStatus.UNPROCESSABLE_ENTITY
              : HttpStatus.BAD_GATEWAY;

        throw new HttpException(
          {
            EMAIL_PROVIDER: error.code,
            delivery: 'NOT_SENT',
            message: error.message,
          },
          httpStatus,
        );
      }

      throw error;
    }
  }
}
