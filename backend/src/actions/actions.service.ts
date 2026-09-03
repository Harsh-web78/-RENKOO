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

    return {
      total: actions.length,
      summary: {
        high: actions.filter(a => a.priority === 'HIGH').length,
        medium: actions.filter(a => a.priority === 'MEDIUM').length,
        low: actions.filter(a => a.priority === 'LOW').length,
        todo: actions.filter(a => a.status === 'TODO').length,
        inProgress: actions.filter(a => a.status === 'IN_PROGRESS').length,
        done: actions.filter(a => a.status === 'DONE').length,
      },
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