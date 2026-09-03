import {
  IsEnum,
  IsNotEmpty,
} from 'class-validator';

import { SeoIssueStatus } from '@prisma/client';

export class UpdateIssueStatusDto {
  @IsNotEmpty()
  @IsEnum(SeoIssueStatus)
  status!: SeoIssueStatus;
}
