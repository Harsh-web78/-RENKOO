import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GeoService } from './geo.service';

@Controller('geo')
@UseGuards(JwtAuthGuard)
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('audit')
  async getLatestAudit(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.geoService.getLatestAudit(
      req.user.organizationId,
      websiteId,
    );
  }

  @Get('queries')
  async getQueries(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.geoService.getQueries(
      req.user.organizationId,
      websiteId,
    );
  }

  @Post('audit')
  async runAudit(
    @Req() req: any,
    @Query('websiteId') websiteId: string,
  ) {
    return this.geoService.runAudit(
      req.user.organizationId,
      websiteId,
    );
  }
}
