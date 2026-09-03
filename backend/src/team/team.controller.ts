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
import { IsEmail, IsIn } from 'class-validator';
import { TeamService } from './team.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

class AcceptInviteDto {
  token!: string;
}

class InviteDto {
  @IsEmail()
  email!: string;

  @IsIn(['ADMIN', 'MEMBER'])
  role!: 'ADMIN' | 'MEMBER';
}

class UpdateRoleDto {
  @IsIn(['ADMIN', 'MEMBER'])
  role!: 'ADMIN' | 'MEMBER';
}

@Controller('team')
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get('members')
  listMembers(@Req() req: any) {
    return this.teamService.listMembers(req.user.organizationId);
  }

  @Post('invites')
  invite(@Req() req: any, @Body() dto: InviteDto) {
    return this.teamService.invite(
      req.user.organizationId,
      req.user.userId,
      dto.email,
      dto.role,
    );
  }

  @Post('invites/accept')
  acceptInvite(
    @Req() req: any,
    @Body() dto: AcceptInviteDto,
  ) {
    return this.teamService.acceptInvite(
      req.user.userId,
      dto.token,
    );
  }

  @Patch('members/:memberId/role')
  updateRole(
    @Req() req: any,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.teamService.updateRole(
      req.user.organizationId,
      req.user.userId,
      memberId,
      dto.role,
    );
  }

  @Delete('members/:memberId')
  removeMember(
    @Req() req: any,
    @Param('memberId') memberId: string,
  ) {
    return this.teamService.removeMember(
      req.user.organizationId,
      req.user.userId,
      memberId,
    );
  }
}
