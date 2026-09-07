import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getActions(organizationId: string) {
    const actions = await this.prisma.action.findMany({
      where: { organizationId },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
      take: 100,
      include: {
        recommendation: true,
      },
    });

    /*
     * Single pass over the already-fetched rows
     * instead of six full scans.
     */
    const summary = {
      high: 0,
      medium: 0,
      low: 0,
      todo: 0,
      inProgress: 0,
      done: 0,
    };

    for (const action of actions) {
      if (action.priority === 'HIGH') summary.high += 1;
      else if (action.priority === 'MEDIUM') summary.medium += 1;
      else if (action.priority === 'LOW') summary.low += 1;

      if (action.status === 'TODO') summary.todo += 1;
      else if (action.status === 'IN_PROGRESS') summary.inProgress += 1;
      else if (action.status === 'DONE') summary.done += 1;
    }

    return {
      total: actions.length,
      summary,
      actions,
    };
  }

  async getAction(
    organizationId: string,
    actionId: string,
  ) {
    const action = await this.prisma.action.findFirst({
      where: {
        id: actionId,
        organizationId,
      },
      include: {
        recommendation: true,
      },
    });

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    return action;
  }

  async createAction(
    organizationId: string,
    data: {
      websiteId?: string;
      recommendationId?: string;
      type: string;
      title: string;
      description: string;
      url?: string;
      priority: string;
      metadata?: any;
    },
  ) {
    // Never trust client-supplied relations: verify ownership server-side.
    if (data.websiteId) {
      const website =
        await this.prisma.website.findFirst({
          where: {
            id: data.websiteId,
            organizationId,
          },
          select: { id: true },
        });

      if (!website) {
        throw new NotFoundException(
          'Website not found',
        );
      }
    }

    if (data.recommendationId) {
      const recommendation =
        await this.prisma.recommendation.findFirst({
          where: {
            id: data.recommendationId,
            organizationId,
          },
          select: { id: true },
        });

      if (!recommendation) {
        throw new NotFoundException(
          'Recommendation not found',
        );
      }
    }

    return this.prisma.action.create({
      data: {
        organizationId,
        websiteId: data.websiteId,
        recommendationId: data.recommendationId,
        type: data.type,
        title: data.title,
        description: data.description,
        url: data.url,
        priority: data.priority,
        metadata: data.metadata,
      },
    });
  }

  async updateStatus(
    organizationId: string,
    actionId: string,
    status:
      | 'TODO'
      | 'IN_PROGRESS'
      | 'DONE'
      | 'DISMISSED',
  ) {
    const action = await this.prisma.action.findFirst({
      where: {
        id: actionId,
        organizationId,
      },
    });

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    const updated = await this.prisma.action.update({
      where: { id: actionId },
      data: {
        status,
        completedAt:
          status === 'DONE'
            ? new Date()
            : null,
      },
    });

    if (action.recommendationId) {
      await this.prisma.recommendation.update({
        where: {
          id: action.recommendationId,
        },
        data: {
          status:
            status === 'DONE'
              ? 'COMPLETED'
              : status === 'DISMISSED'
                ? 'DISMISSED'
                : 'IN_PROGRESS',
        },
      });
    }

    return updated;
  }

  async deleteAction(
    organizationId: string,
    actionId: string,
  ) {
    const action = await this.prisma.action.findFirst({
      where: {
        id: actionId,
        organizationId,
      },
    });

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    await this.prisma.action.delete({
      where: { id: actionId },
    });

    return {
      success: true,
      id: actionId,
    };
  }
}