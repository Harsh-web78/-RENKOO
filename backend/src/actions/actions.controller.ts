import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActionsService } from './actions.service';
import { ActionMeasurementService } from './action-measurement.service';
import { ActionVerificationService } from './action-verification.service';
import { ActionExecutionService } from './action-execution.service';

@Controller('actions')
@UseGuards(JwtAuthGuard)
export class ActionsController {
  constructor(
    private readonly actionsService: ActionsService,
    private readonly measurement: ActionMeasurementService,
    private readonly verification: ActionVerificationService,
    private readonly execution: ActionExecutionService,
  ) {}

  /*
   * Measurement reads (Phase 23): single actions and
   * static history/summary paths are declared before
   * ':id' so they are never captured as action IDs.
   */

  @Get('measurement/history')
  measurementHistory(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('outcome') outcome?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    return this.measurement.getHistory(
      req.user.organizationId,
      websiteId,
      {
        type,
        status,
        outcome,
        page: Number(page) || 1,
        pageSize: Number(pageSize) || 20,
      },
    );
  }

  @Get('measurement/summary')
  measurementSummary(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    if (!websiteId) {
      throw new BadRequestException(
        'websiteId is required',
      );
    }
    return this.measurement.getSummary(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':id/measurement')
  actionMeasurement(
    @Req() req: any,
    @Param('id') id: string,
    @Query('window') window?: string,
  ) {
    const parsed = Number(window);
    return this.measurement.getMeasurement(
      req.user.organizationId,
      id,
      Number.isFinite(parsed) ? parsed : 28,
    );
  }

  /*
   * Execution verification (Phase 28): expected change,
   * explicit live verification, and the full execution
   * loop. DONE ≠ VERIFIED. User-triggered crawls reuse
   * existing crawl quota; customer sites are never
   * modified by RENKOO.
   */

  @Get(':id/verification')
  actionVerification(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.verification.getVerification(
      req.user.organizationId,
      id,
    );
  }

  @Post(':id/verify')
  verifyAction(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.verification.verify(
      req.user.organizationId,
      id,
    );
  }

  @Get(':id/execution')
  actionExecution(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.verification.getExecution(
      req.user.organizationId,
      id,
    );
  }

  /*
   * Governed execution (Phase 29): proposals live in
   * Action.metadata (no migration). ALL WRITES REQUIRE
   * HUMAN APPROVAL. No CMS is connected: COPY, EXPORT
   * or recorded MANUAL execution only — never faked.
   */

  @Get(':id/proposal')
  actionProposals(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.execution.getProposals(
      req.user.organizationId,
      id,
    );
  }

  @Post(':id/proposal')
  proposeAction(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      proposedState?: string;
      targetElement?: string;
      evidence?: string[];
      customerNeed?: string;
      claim?: string;
    },
  ) {
    return this.execution.propose(
      req.user.organizationId,
      id,
      {
        userId: req.user?.userId ?? null,
        proposedState: body?.proposedState,
        targetElement: body?.targetElement,
        evidence: body?.evidence,
        customerNeed: body?.customerNeed,
        claim: body?.claim,
      },
    );
  }

  @Post(':id/approve')
  approveAction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { version?: number; confirmed?: boolean },
  ) {
    return this.execution.approve(
      req.user.organizationId,
      id,
      {
        userId: req.user?.userId ?? null,
        version: body?.version,
        confirmed: body?.confirmed,
      },
    );
  }

  @Post(':id/reject')
  rejectAction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { version?: number; reason?: string },
  ) {
    return this.execution.reject(
      req.user.organizationId,
      id,
      {
        userId: req.user?.userId ?? null,
        version: body?.version,
        reason: body?.reason,
      },
    );
  }

  @Post(':id/execute')
  executeAction(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { version?: number; method?: string },
  ) {
    return this.execution.execute(
      req.user.organizationId,
      id,
      {
        userId: req.user?.userId ?? null,
        version: body?.version,
        method: body?.method,
      },
    );
  }

  @Get(':id/execution-state')
  executionState(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.execution.verifyStale(
      req.user.organizationId,
      id,
    );
  }

  @Post()
  create(
    @Req() req: any,
    @Body() body: any,
  ) {
    if (!body?.title) {
      throw new BadRequestException(
        'title is required',
      );
    }

    return this.actionsService.createAction(
      req.user.organizationId,
      {
        websiteId: body.websiteId,
        recommendationId:
          body.recommendationId,
        type: String(
          body.type ?? 'GENERAL',
        ),
        title: String(body.title),
        description: String(
          body.description ?? '',
        ),
        url: body.url
          ? String(body.url)
          : body.pageUrl
            ? String(body.pageUrl)
            : undefined,
        priority: String(
          body.priority ?? 'MEDIUM',
        ).toUpperCase(),
        metadata: body.metadata,
      },
    );
  }

  @Get()
  getActions(@Req() req: any) {
    return this.actionsService.getActions(
      req.user.organizationId,
    );
  }

  @Get(':id')
  getAction(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.actionsService.getAction(
      req.user.organizationId,
      id,
    );
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const allowed = [
      'TODO',
      'IN_PROGRESS',
      'DONE',
      'DISMISSED',
    ];

    const status = String(
      body?.status ?? '',
    ).toUpperCase();

    if (!allowed.includes(status)) {
      throw new BadRequestException(
        'Invalid action status',
      );
    }

    return this.actionsService.updateStatus(
      req.user.organizationId,
      id,
      status as
        | 'TODO'
        | 'IN_PROGRESS'
        | 'DONE'
        | 'DISMISSED',
    );
  }

  @Delete(':id')
  remove(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.actionsService.deleteAction(
      req.user.organizationId,
      id,
    );
  }
}
