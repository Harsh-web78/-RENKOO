import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { ClientsService } from './clients.service';

import {
  GenerateReportDto,
  SendReportEmailDto,
  ShareReportDto,
} from './dto/report.dto';
import {
  AssignWebsiteDto,
  CreateClientDto,
  UpdateClientDto,
} from './dto/client.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly clientsService: ClientsService,
  ) {}

  // Agency command center (static path before :id).
  @Get('command-center')
  commandCenter(
    @Req() req: any,
    @Query('take') take?: string,
  ) {
    return this.reportsService.commandCenter(
      req.user.organizationId,
      take === undefined ? 20 : Number(take),
    );
  }

  // Scheduling honesty endpoint.
  @Get('scheduling')
  scheduling() {
    const emailConfigured = Boolean(
      process.env.RESEND_API_KEY?.trim(),
    );

    return {
      supported: false,
      emailConfigured,
      reason: emailConfigured
        ? 'Scheduled delivery is not implemented yet. Reports can be generated on demand, shared via secure links, or emailed directly.'
        : 'Scheduled delivery requires email configuration, which is not set up. Reports can be generated on demand and shared via secure links.',
    };
  }

  @Get()
  list(
    @Req() req: any,
    @Query('websiteId')
    websiteId?: string,
    @Query('clientId')
    clientId?: string,
  ) {
    return this.reportsService.list(
      req.user.organizationId,
      websiteId,
      clientId,
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post()
  generate(
    @Req() req: any,
    @Body() dto: GenerateReportDto,
  ) {
    return this.reportsService.generate(
      req.user.organizationId,
      req.user?.userId ?? null,
      dto.websiteId,
      dto.type,
      {
        title: dto.title,
        from: dto.from,
        to: dto.to,
        clientId: dto.clientId,
        agencyName: dto.agencyName,
      },
    );
  }

  @Get(':id')
  get(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.reportsService.get(
      req.user.organizationId,
      id,
    );
  }

  @Delete(':id')
  remove(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.reportsService.remove(
      req.user.organizationId,
      id,
    );
  }

  @Post(':id/share')
  share(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ShareReportDto,
  ) {
    return this.reportsService.share(
      req.user.organizationId,
      id,
      dto.expiresInDays,
    );
  }

  /*
   * Lifecycle (Phase 20): DRAFT → PUBLISHED → ARCHIVED.
   * Publishing freezes the immutable snapshot;
   * regeneration creates a new snapshot via POST /.
   */
  @Post(':id/publish')
  publish(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.reportsService.publish(
      req.user.organizationId,
      id,
    );
  }

  @Post(':id/archive')
  archive(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.reportsService.archive(
      req.user.organizationId,
      id,
    );
  }

  /*
   * CSV export from the immutable snapshot only:
   * opportunities, actions, or changes. Bounded rows,
   * never a raw database dump.
   */
  @Get(':id/export')
  async export(
    @Req() req: any,
    @Param('id') id: string,
    @Query('section') section: string,
    @Res({ passthrough: true }) res: any,
  ) {
    const exported =
      await this.reportsService.exportCsv(
        req.user.organizationId,
        id,
        String(section ?? ''),
      );
    res.setHeader(
      'Content-Type',
      exported.contentType,
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${exported.filename}"`,
    );
    return exported.content;
  }

  @Patch(':id/revoke')
  revoke(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.reportsService.revoke(
      req.user.organizationId,
      id,
    );
  }

  /*
   * Email a secure read-only share link for a
   * persisted report. No PDF attachment: there is
   * no server-side PDF renderer.
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(':id/email')
  sendEmail(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SendReportEmailDto,
  ) {
    return this.reportsService.sendEmail(
      req.user.organizationId,
      id,
      dto.to,
      dto.message,
    );
  }

  // ---------------- Clients ----------------

  @Get('clients/all')
  listClients(@Req() req: any) {
    return this.clientsService.list(
      req.user.organizationId,
    );
  }

  @Post('clients')
  createClient(
    @Req() req: any,
    @Body() dto: CreateClientDto,
  ) {
    return this.clientsService.create(
      req.user.organizationId,
      dto,
    );
  }

  @Get('clients/:id')
  getClient(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.clientsService.get(
      req.user.organizationId,
      id,
    );
  }

  @Patch('clients/:id')
  updateClient(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(
      req.user.organizationId,
      id,
      dto,
    );
  }

  @Delete('clients/:id')
  removeClient(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.clientsService.remove(
      req.user.organizationId,
      id,
    );
  }

  @Post('clients/assign')
  assignWebsite(
    @Req() req: any,
    @Body() dto: AssignWebsiteDto,
  ) {
    return this.clientsService.assignWebsite(
      req.user.organizationId,
      dto.websiteId,
      dto.clientId ?? null,
    );
  }
}
