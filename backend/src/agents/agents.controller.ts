import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentsService } from './agents.service';

import {
  ExecuteRunDto,
  RunAgentDto,
} from './dto/agent.dto';

@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
  ) {}

  @Get()
  list(
    @Req() req: any,
    @Query('websiteId')
    websiteId?: string,
  ) {
    return this.agentsService.listAgents(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('runs')
  runs(
    @Req() req: any,
    @Query('websiteId')
    websiteId?: string,
    @Query('agentId')
    agentId?: string,
  ) {
    return this.agentsService.listRuns(
      req.user.organizationId,
      websiteId,
      agentId,
    );
  }

  @Get('runs/:id')
  run(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.agentsService.getRun(
      req.user.organizationId,
      id,
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post(':id/run')
  start(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: RunAgentDto,
  ) {
    return this.agentsService.runAgent(
      req.user.organizationId,
      req.user?.userId ?? null,
      dto.websiteId,
      id,
      dto.input,
      dto.trigger ?? 'USER_REQUEST',
    );
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('runs/:id/execute')
  execute(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ExecuteRunDto,
  ) {
    return this.agentsService.approveAndExecute(
      req.user.organizationId,
      id,
      dto.approve,
      dto.indexes,
    );
  }
}
