import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { randomBytes } from 'crypto';

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private async requireAdmin(
    organizationId: string,
    userId: string,
  ) {
    const membership =
      await this.prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId,
          },
        },
        select: { role: true },
      });

    if (!membership) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }

    if (
      membership.role !== 'OWNER' &&
      membership.role !== 'ADMIN'
    ) {
      throw new ForbiddenException(
        'Only organization owners and admins can manage team members.',
      );
    }

    return membership;
  }

  async listMembers(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(
    organizationId: string,
    userId: string,
    email: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    await this.requireAdmin(
      organizationId,
      userId,
    );

    const normalizedEmail =
      email.trim().toLowerCase();

    const existingUser =
      await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

    if (existingUser) {
      const existingMember =
        await this.prisma.organizationMember.findUnique({
          where: {
            userId_organizationId: {
              userId: existingUser.id,
              organizationId,
            },
          },
        });

      if (existingMember) {
        throw new BadRequestException(
          'This user is already a member of the organization.',
        );
      }
    }

    const existingInvite =
      await this.prisma.organizationInvite.findFirst({
        where: {
          organizationId,
          email: normalizedEmail,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

    if (existingInvite) {
      throw new BadRequestException(
        'An active invitation already exists for this email.',
      );
    }

    const token =
      randomBytes(32).toString('hex');

    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + 7,
    );

    const invite =
      await this.prisma.organizationInvite.create({
        data: {
          organizationId,
          email: normalizedEmail,
          role,
          token,
          expiresAt,
        },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      });

    const organization =
      await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: {
          name: true,
        },
      });

    const inviter =
      await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
        },
      });

    if (!organization) {
      throw new NotFoundException(
        'Organization not found.',
      );
    }

    const frontendUrl =
      process.env.FRONTEND_URL ||
      'http://localhost:3000';

    const inviteUrl =
      `${frontendUrl}/invite/${token}`;

    try {
      await this.emailService.sendTeamInvite({
        to: normalizedEmail,
        organizationName: organization.name,
        inviterName: inviter?.name,
        role,
        inviteUrl,
        expiresAt,
      });
    } catch (error) {
      await this.prisma.organizationInvite.delete({
        where: { id: invite.id },
      });

      throw error;
    }

    return {
      ...invite,
      emailSent: true,
    };
  }

  async acceptInvite(
    userId: string,
    token: string,
  ) {
    const invite =
      await this.prisma.organizationInvite.findUnique({
        where: { token },
      });

    if (!invite) {
      throw new NotFoundException(
        'Invitation not found.',
      );
    }

    if (invite.acceptedAt) {
      throw new BadRequestException(
        'This invitation has already been accepted.',
      );
    }

    if (invite.expiresAt <= new Date()) {
      throw new BadRequestException(
        'This invitation has expired.',
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'User not found.',
      );
    }

    if (
      user.email.toLowerCase() !==
      invite.email.toLowerCase()
    ) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address.',
      );
    }

    const existingMember =
      await this.prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId:
              invite.organizationId,
          },
        },
      });

    if (existingMember) {
      await this.prisma.organizationInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return {
        success: true,
        alreadyMember: true,
        organizationId:
          invite.organizationId,
        role: existingMember.role,
      };
    }

    const membership =
      await this.prisma.$transaction(
        async (tx) => {
          const member =
            await tx.organizationMember.create({
              data: {
                userId,
                organizationId:
                  invite.organizationId,
                role: invite.role,
              },
            });

          await tx.organizationInvite.update({
            where: { id: invite.id },
            data: {
              acceptedAt: new Date(),
            },
          });

          return member;
        },
      );

    return {
      success: true,
      alreadyMember: false,
      organizationId:
        membership.organizationId,
      role: membership.role,
    };
  }

  async updateRole(
    organizationId: string,
    userId: string,
    memberId: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    await this.requireAdmin(
      organizationId,
      userId,
    );

    const member =
      await this.prisma.organizationMember.findFirst({
        where: {
          id: memberId,
          organizationId,
        },
      });

    if (!member) {
      throw new NotFoundException(
        'Team member not found.',
      );
    }

    if (member.role === 'OWNER') {
      throw new ForbiddenException(
        'Owner role cannot be changed.',
      );
    }

    return this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  async removeMember(
    organizationId: string,
    userId: string,
    memberId: string,
  ) {
    await this.requireAdmin(
      organizationId,
      userId,
    );

    const member =
      await this.prisma.organizationMember.findFirst({
        where: {
          id: memberId,
          organizationId,
        },
      });

    if (!member) {
      throw new NotFoundException(
        'Team member not found.',
      );
    }

    if (member.role === 'OWNER') {
      throw new ForbiddenException(
        'Organization owner cannot be removed.',
      );
    }

    await this.prisma.organizationMember.delete({
      where: { id: memberId },
    });

    return { success: true };
  }
}
