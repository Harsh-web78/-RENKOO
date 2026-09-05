import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequestUser } from './request-user';

@Injectable()
export class JwtAuthGuard
  implements CanActivate
{
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
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

    let payload: {
      sub?: string;
      email?: string;
      organizationId?: string;
    };

    try {
      payload = this.jwtService.verify(token, {
        secret:
          this.configService.getOrThrow<string>(
            'JWT_ACCESS_SECRET',
          ),
      });
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired access token',
      );
    }

    if (!payload.sub || !payload.organizationId) {
      throw new UnauthorizedException(
        'Invalid access token payload',
      );
    }

    const membership =
      await this.prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: payload.sub,
            organizationId: payload.organizationId,
          },
        },
        select: {
          role: true,
        },
      });

    if (!membership) {
      throw new UnauthorizedException(
        'You no longer have access to this workspace',
      );
    }

    const user: AuthenticatedRequestUser = {
      userId: payload.sub,
      email: payload.email ?? '',
      organizationId: payload.organizationId,
      role: membership.role,
    };

    request.user = user;

    return true;
  }
}
