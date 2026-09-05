import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import {
  createHash,
  randomBytes,
} from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const VERIFY_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_MINUTES = 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(
    AuthService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
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

    /*
     * Best-effort verification email. Registration
     * itself must succeed even when the email
     * provider is not configured.
     */
    const emailVerification =
      await this.issueVerificationEmail(
        result.user,
      );

    return {
      ...this.createAuthResponse(
        result.user,
        result.organization.id,
      ),
      emailVerification,
    };
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
                /*
                 * Invite acceptance proves email
                 * ownership, so no verification
                 * email is needed here.
                 */
                emailVerifiedAt: new Date(),
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
        emailVerifiedAt: true,
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

    if (!membership) {
      throw new UnauthorizedException(
        'You no longer have access to this workspace',
      );
    }

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
      user: {
        ...user,
        emailVerified: Boolean(
          user.emailVerifiedAt,
        ),
      },
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

  // =========================================================
  // EMAIL VERIFICATION + PASSWORD RESET
  // =========================================================

  private hashToken(token: string): string {
    return createHash('sha256')
      .update(token)
      .digest('hex');
  }

  private async issueVerificationEmail(user: {
    id: string;
    email: string;
    name: string | null;
  }): Promise<{
    sent: boolean;
    status:
      | 'SENT'
      | 'PROVIDER_NOT_CONFIGURED'
      | 'SENDER_NOT_VERIFIED'
      | 'SEND_FAILED';
  }> {
    if (!this.emailService.isConfigured()) {
      return {
        sent: false,
        status: 'PROVIDER_NOT_CONFIGURED',
      };
    }

    const token = randomBytes(32).toString(
      'hex',
    );

    /*
     * Single active verification token per user:
     * retire prior unused ones before issuing a
     * new one (mirrors the reset-token flow).
     */
    await this.prisma.authToken.deleteMany({
      where: {
        userId: user.id,
        type: 'VERIFY',
        usedAt: null,
      },
    });

    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        type: 'VERIFY',
        tokenHash: this.hashToken(token),
        expiresAt: new Date(
          Date.now() +
            VERIFY_TOKEN_TTL_HOURS *
              3600000,
        ),
      },
    });

    const verifyUrl =
      `${this.emailService.resolveAppUrl()}/verify-email?token=${token}`;

    try {
      await this.emailService.sendVerificationEmail(
        {
          to: user.email,
          name: user.name,
          verifyUrl,
          expiresHours:
            VERIFY_TOKEN_TTL_HOURS,
        },
      );

      return { sent: true, status: 'SENT' };
    } catch (error: any) {
      /*
       * Never leak tokens or provider internals.
       * Surface only the failure class so the API
       * can report SENDER_NOT_VERIFIED /
       * SEND_FAILED honestly.
       */
      this.logger.warn(
        `Verification email not delivered (code=${error?.code ?? 'SEND_FAILED'})`,
      );

      return {
        sent: false,
        status:
          error?.code ===
            'SENDER_NOT_VERIFIED'
            ? 'SENDER_NOT_VERIFIED'
            : 'SEND_FAILED',
      };
    }
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashToken(
      token.trim(),
    );

    const record =
      await this.prisma.authToken.findUnique({
        where: { tokenHash },
      });

    if (
      !record ||
      record.type !== 'VERIFY' ||
      record.usedAt ||
      record.expiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'This verification link is invalid or has expired',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.authToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return {
      verified: true,
      message:
        'Your email address has been verified',
    };
  }

  async resendVerification(email: string) {
    /*
     * Generic response: never reveal whether an
     * account exists for the address.
     */
    const generic = {
      sent: true,
      message:
        'If an account exists for this email address, a verification link has been sent',
    };

    const normalized = email
      .trim()
      .toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: { email: normalized },
        select: {
          id: true,
          email: true,
          name: true,
          emailVerifiedAt: true,
        },
      });

    if (!user || user.emailVerifiedAt) {
      return generic;
    }

    await this.issueVerificationEmail(user);

    return generic;
  }

  async forgotPassword(email: string) {
    /*
     * Generic response: never reveal whether an
     * account exists for the address.
     */
    const generic = {
      sent: true,
      message:
        'If an account exists for this email address, a password reset link has been sent',
    };

    const normalized = email
      .trim()
      .toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: { email: normalized },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

    if (!user) {
      return generic;
    }

    if (!this.emailService.isConfigured()) {
      this.logger.warn(
        'Password reset requested but email provider is not configured',
      );

      return generic;
    }

    /*
     * Single active reset token per user: retire
     * prior unused ones before issuing a new one.
     */
    await this.prisma.authToken.deleteMany({
      where: {
        userId: user.id,
        type: 'RESET',
        usedAt: null,
      },
    });

    const token = randomBytes(32).toString(
      'hex',
    );

    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        type: 'RESET',
        tokenHash: this.hashToken(token),
        expiresAt: new Date(
          Date.now() +
            RESET_TOKEN_TTL_MINUTES * 60000,
        ),
      },
    });

    const resetUrl =
      `${this.emailService.resolveAppUrl()}/reset-password?token=${token}`;

    try {
      await this.emailService.sendPasswordResetEmail(
        {
          to: user.email,
          name: user.name,
          resetUrl,
          expiresMinutes:
            RESET_TOKEN_TTL_MINUTES,
        },
      );
    } catch (error: any) {
      this.logger.warn(
        `Password reset email not delivered (code=${error?.code ?? 'SEND_FAILED'})`,
      );
    }

    return generic;
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException(
        'New password must contain at least 8 characters',
      );
    }

    const tokenHash = this.hashToken(
      token.trim(),
    );

    const record =
      await this.prisma.authToken.findUnique({
        where: { tokenHash },
      });

    if (
      !record ||
      record.type !== 'RESET' ||
      record.usedAt ||
      record.expiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'This reset link is invalid or has expired',
      );
    }

    const passwordHash = await bcrypt.hash(
      newPassword,
      12,
    );

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.authToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      /*
       * Retire any other outstanding reset tokens
       * for this user once one is consumed.
       */
      this.prisma.authToken.deleteMany({
        where: {
          userId: record.userId,
          type: 'RESET',
          usedAt: null,
          id: { not: record.id },
        },
      }),
    ]);

    return {
      success: true,
      message:
        'Your password has been reset successfully',
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

  // =========================================================
  // PERSONA PREFERENCE (experience only)
  //
  // Persona changes presentation/prioritization and
  // NEVER grants permissions. RBAC (membership
  // role) and billing entitlements remain the sole
  // authorities. Preference is user-level and
  // self-only (userId comes from the JWT).
  // =========================================================

  static readonly PERSONAS = [
    'BUSINESS_OWNER',
    'SEO_SPECIALIST',
    'CONTENT_MARKETER',
    'MARKETING_MANAGER',
    'AGENCY',
    'ADMIN',
  ] as const;

  static personaFromRole(
    role: string | null | undefined,
  ): string {
    switch ((role ?? '').toUpperCase()) {
      case 'OWNER':
        return 'BUSINESS_OWNER';
      case 'ADMIN':
        return 'ADMIN';
      default:
        return 'MARKETING_MANAGER';
    }
  }

  async getPersona(userId: string) {
    const user =
      await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          persona: true,
          personaSelectedAt: true,
          memberships: {
            select: { role: true },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        'User not found',
      );
    }

    const role =
      user.memberships[0]?.role ?? null;
    const suggested =
      AuthService.personaFromRole(role);
    const selected =
      user.persona &&
      (
        AuthService.PERSONAS as readonly string[]
      ).includes(user.persona)
        ? user.persona
        : null;

    return {
      persona: selected,
      effectivePersona: selected ?? suggested,
      suggestedPersona: suggested,
      source:
        selected !== null
          ? 'selected'
          : 'default',
      role,
      personaSelectedAt:
        user.personaSelectedAt,
    };
  }

  async setPersona(
    userId: string,
    persona: string | null,
  ) {
    const normalized =
      typeof persona === 'string' &&
      persona.trim().length > 0
        ? persona.trim().toUpperCase()
        : null;

    if (
      normalized !== null &&
      !(
        AuthService.PERSONAS as readonly string[]
      ).includes(normalized)
    ) {
      throw new BadRequestException(
        `Unknown persona. Choose one of: ${AuthService.PERSONAS.join(', ')}.`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        persona: normalized,
        personaSelectedAt:
          normalized === null
            ? null
            : new Date(),
      },
    });

    return this.getPersona(userId);
  }
}
