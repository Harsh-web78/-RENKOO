import {
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
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post(':websiteId')
  create(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadsService.create(
      req.user.organizationId,
      websiteId,
      dto,
    );
  }

  @Get(':websiteId/summary')
  summary(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.leadsService.summary(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId')
  list(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
  ) {
    return this.leadsService.list(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get(':websiteId/:id')
  getOne(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
  ) {
    return this.leadsService.getOne(
      req.user.organizationId,
      websiteId,
      id,
    );
  }

  @Patch(':websiteId/:id')
  update(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.update(
      req.user.organizationId,
      websiteId,
      id,
      dto,
    );
  }

  @Delete(':websiteId/:id')
  remove(
    @Req() req: any,
    @Param('websiteId') websiteId: string,
    @Param('id') id: string,
  ) {
    return this.leadsService.remove(
      req.user.organizationId,
      websiteId,
      id,
    );
  }
}
