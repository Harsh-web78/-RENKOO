import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProofService } from './proof.service';

@Controller('proof-cards')
@UseGuards(JwtAuthGuard)
export class ProofController {
  constructor(
    private readonly proofService: ProofService,
  ) {}

  /*
   * Read-only proof assembly from stored workspace data.
   * No live external calls; every read is organization-scoped.
   */
  @Get()
  list(
    @Req() req: any,
    @Query('websiteId') websiteId?: string,
    @Query('take') take?: string,
    @Query('cursorId') cursorId?: string,
  ) {
    const parsedTake = take
      ? Number.parseInt(take, 10)
      : undefined;

    return this.proofService.listProofCards(
      req.user.organizationId,
      {
        websiteId: websiteId || undefined,
        take:
          parsedTake !== undefined &&
          Number.isFinite(parsedTake)
            ? parsedTake
            : undefined,
        cursorId: cursorId || undefined,
      },
    );
  }

  @Get(':id')
  getOne(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.proofService.getProofCard(
      req.user.organizationId,
      id,
    );
  }
}
