import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAuthGuard
  implements CanActivate
{
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(
    context: ExecutionContext,
  ): boolean {
    const request =
      context.switchToHttp().getRequest();

    const authorization =
      request.headers.authorization;

    if (
      !authorization ||
      !authorization.startsWith('Bearer ')
    ) {
      throw new UnauthorizedException(
        'Missing access token',
      );
    }

    const token =
      authorization.substring(7).trim();

    if (!token) {
      throw new UnauthorizedException(
        'Missing access token',
      );
    }

    try {
      const payload =
        this.jwtService.verify(token, {
          secret:
            this.configService.getOrThrow<string>(
              'JWT_ACCESS_SECRET',
            ),
        });

      if (
        !payload.sub ||
        !payload.organizationId
      ) {
        throw new UnauthorizedException(
          'Invalid access token payload',
        );
      }

      request.user = {
        userId: payload.sub,
        email: payload.email,
        organizationId:
          payload.organizationId,
      };

      return true;
    } catch (error) {
      if (
        error instanceof UnauthorizedException
      ) {
        throw error;
      }

      throw new UnauthorizedException(
        'Invalid or expired access token',
      );
    }
  }
}