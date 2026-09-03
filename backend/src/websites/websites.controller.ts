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

import { CreateWebsiteDto } from './dto/create-website.dto';
import { UpdateWebsiteDto } from './dto/update-website.dto';
import { WebsitesService } from './websites.service';

@Controller('websites')
@UseGuards(JwtAuthGuard)
export class WebsitesController {
  constructor(
    private readonly websitesService: WebsitesService,
  ) {}

  @Post()
  create(
    @Req() req: any,
    @Body() dto: CreateWebsiteDto,
  ) {
    return this.websitesService.create(
      req.user.organizationId,
      dto,
    );
  }

  @Get()
  findAll(@Req() req: any) {
    return this.websitesService.findAll(
      req.user.organizationId,
    );
  }

  @Get(':id')
  findOne(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.websitesService.findOne(
      req.user.organizationId,
      id,
    );
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateWebsiteDto,
  ) {
    return this.websitesService.update(
      req.user.organizationId,
      id,
      dto,
    );
  }

  @Delete(':id')
  remove(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.websitesService.remove(
      req.user.organizationId,
      id,
    );
  }
}