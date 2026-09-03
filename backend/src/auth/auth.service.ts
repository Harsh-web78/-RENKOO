import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email =
      dto.email.trim().toLowerCase();

    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists',
      );
    }

    const passwordHash =
      await bcrypt.hash(
        dto.password,
        12,
      );

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const user =
            await tx.user.create({
              data: {
                email,
                name: dto.name.trim(),
                passwordHash,
              },
            });

          const baseSlug =
            dto.organizationName
              .trim()
              .toLowerCase()
              .replace(
                /[^a-z0-9]+/g,
                '-',
              )
              .replace(
                /^-+|-+$/g,
                '',
              );

          const slug =
            `${baseSlug}-${Date.now().toString(36)}`;

          const organization =
            await tx.organization.create({
              data: {
                name:
                  dto.organizationName.trim(),
                slug,
              },
            });

          await tx.organizationMember.create({
            data: {
              userId: user.id,
              organizationId:
                organization.id,
              role: 'OWNER',
            },
          });

          return {
            user,
            organization,
          };
        },
      );

    return this.createAuthResponse(
      result.user,
      result.organization.id,
    );
  }


  async registerWithInvite(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const token = dto.token?.trim();

    if (!token) {
      throw new ConflictException('Invitation token is required');
    }

    const invite =
      await this.prisma.organizationInvite.findUnique({
        where: { token },
      });

    if (!invite) {
      throw new ConflictException('Invitation not found');
    }

    if (invite.acceptedAt) {
      throw new ConflictException(
        'This invitation has already been accepted',
      );
    }

    if (invite.expiresAt <= new Date()) {
      throw new ConflictException(
        'This invitation has expired',
      );
    }

    if (invite.email !== email) {
      throw new ConflictException(
        'This invitation was sent to a different email address',
      );
    }

    const existingUser =
      await this.prisma.user.findUnique({
        where: { email },
      });

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists. Please log in and accept the invitation.',
      );
    }

    const passwordHash =
      await bcrypt.hash(dto.password, 12);

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const user =
            await tx.user.create({
              data: {
                email,
                name: dto.name.trim(),
                passwordHash,
              },
            });

          const membership =
            await tx.organizationMember.create({
              data: {
                userId: user.id,
                organizationId: invite.organizationId,
                role: invite.role,
              },
            });

          await tx.organizationInvite.update({
            where: { id: invite.id },
            data: { acceptedAt: new Date() },
          });

          return {
            user,
            membership,
          };
        },
      );

    return this.createAuthResponse(
      result.user,
      result.membership.organizationId,
    );
  }
  async login(dto: LoginDto) {
    const email =
      dto.email.trim().toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
        include: {
          memberships: {
            include: {
              organization: true,
            },
          },
        },
      });

    if (
      !user ||
      !user.passwordHash
    ) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const passwordValid =
      await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

    if (!passwordValid) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const membership =
      user.memberships[0];

    if (!membership) {
      throw new UnauthorizedException(
        'No organization is associated with this account',
      );
    }

    return this.createAuthResponse(
      user,
      membership.organizationId,
    );
  }

  async getCurrentAccount(
    userId: string,
    organizationId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const organization =
      await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
        },
      });

    if (!organization) {
      throw new UnauthorizedException(
        'Organization not found',
      );
    }

    const membership =
      await this.prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId,
          },
        },
        select: {
          role: true,
        },
      });

    const website =
      await this.prisma.website.findFirst({
        where: {
          organizationId,
          isActive: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          name: true,
          url: true,
          industry: true,
          country: true,
          isActive: true,
        },
      });

    return {
      user,
      organization,
      membership,
      website,
    };
  }

  async updateProfile(
    userId: string,
    data: { name?: string },
  ) {
    const name = data.name?.trim();

    if (!name || name.length < 2) {
      throw new ConflictException(
        'Name must contain at least 2 characters',
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: {
        id: true,
        email: true,
        name: true,
        updatedAt: true,
      },
    });
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!currentPassword || !newPassword) {
      throw new ConflictException(
        'Current and new password are required',
      );
    }

    if (newPassword.length < 8) {
      throw new ConflictException(
        'New password must contain at least 8 characters',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException(
        'Password authentication is unavailable',
      );
    }

    const valid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );

    if (!valid) {
      throw new UnauthorizedException(
        'Current password is incorrect',
      );
    }

    const passwordHash = await bcrypt.hash(
      newPassword,
      12,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return {
      success: true,
      message: 'Password updated successfully',
    };
  }

  private createAuthResponse(
    user: {
      id: string;
      email: string;
      name: string | null;
    },
    organizationId: string,
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      organizationId,
    };

    const accessToken =
      this.jwtService.sign(payload);

    return {
      accessToken,

      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },

      organizationId,
    };
  }
}
