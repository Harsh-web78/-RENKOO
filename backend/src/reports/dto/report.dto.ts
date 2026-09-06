import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export const REPORT_TYPES = [
  'EXECUTIVE',
  'SEO',
  'AI_VISIBILITY',
  'TECHNICAL',
  'COMPETITOR',
  'OUTCOME',
  'AGENCY_CLIENT',
] as const;

export class GenerateReportDto {
  @IsString()
  websiteId!: string;

  @IsIn([...REPORT_TYPES])
  type!:
    | 'EXECUTIVE'
    | 'SEO'
    | 'AI_VISIBILITY'
    | 'TECHNICAL'
    | 'COMPETITOR'
    | 'OUTCOME'
    | 'AGENCY_CLIENT';

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  agencyName?: string;
}

export class ShareReportDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expiresInDays?: number;
}

export class SendReportEmailDto {
  @IsEmail()
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
