import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActionsService } from './actions.service';

@Controller('actions')
@UseGuards(JwtAuthGuard)
export class ActionsController {
  constructor(
    private readonly actionsService: ActionsService,
  ) {}

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
