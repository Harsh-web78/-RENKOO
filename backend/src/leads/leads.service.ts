import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  private async website(organizationId: string, websiteId: string) {
    const website = await this.prisma.website.findFirst({
      where: { id: websiteId, organizationId, isActive: true },
    });

    if (!website) throw new NotFoundException('Website not found');
    return website;
  }

  async create(organizationId: string, websiteId: string, dto: CreateLeadDto) {
    await this.website(organizationId, websiteId);

    return this.prisma.lead.create({
      data: { websiteId, ...dto },
    });
  }

  async list(organizationId: string, websiteId: string) {
    await this.website(organizationId, websiteId);

    const leads = await this.prisma.lead.findMany({
      where: { websiteId },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return {
      websiteId,
      total: leads.length,
      leads,
    };
  }

  async summary(organizationId: string, websiteId: string) {
    await this.website(organizationId, websiteId);

    const leads = await this.prisma.lead.findMany({
      where: { websiteId },
    });

    const total = leads.length;
    const newLeads = leads.filter(l => l.status === 'NEW').length;
    const contacted = leads.filter(l => l.status === 'CONTACTED').length;
    const qualified = leads.filter(l => l.status === 'QUALIFIED').length;
    const converted = leads.filter(l => l.converted).length;

    const pipelineValue = leads
      .filter(l => !l.converted)
      .reduce((sum, l) => sum + l.estimatedValue, 0);

    const revenueRecords =
      await this.prisma.revenue.findMany({
        where: {
          websiteId,
          status: 'RECOGNIZED',
        },
        select: {
          amount: true,
        },
      });

    const revenue = revenueRecords.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    const conversionRate =
      total > 0 ? Number(((converted / total) * 100).toFixed(2)) : 0;

    const bySource: Record<string, number> = {};

    for (const lead of leads) {
      bySource[lead.source] = (bySource[lead.source] || 0) + 1;
    }

    return {
      websiteId,
      total,
      new: newLeads,
      contacted,
      qualified,
      converted,
      conversionRate,
      pipelineValue,
      revenue,
      bySource,
    };
  }

  async getOne(organizationId: string, websiteId: string, id: string) {
    await this.website(organizationId, websiteId);

    const lead = await this.prisma.lead.findFirst({
      where: { id, websiteId },
    });

    if (!lead) throw new NotFoundException('Lead not found');

    return lead;
  }

  async update(
    organizationId: string,
    websiteId: string,
    id: string,
    dto: UpdateLeadDto,
  ) {
    await this.getOne(organizationId, websiteId, id);

    const data: any = { ...dto };

    if (dto.converted === true) {
      data.convertedAt = new Date();
      data.status = 'CONVERTED';
    }

    if (dto.converted === false) {
      data.convertedAt = null;
    }

    return this.prisma.lead.update({
      where: { id },
      data,
    });
  }

  async remove(organizationId: string, websiteId: string, id: string) {
    await this.getOne(organizationId, websiteId, id);

    await this.prisma.lead.delete({
      where: { id },
    });

    return {
      success: true,
      id,
    };
  }
}

