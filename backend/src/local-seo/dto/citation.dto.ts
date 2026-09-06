import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const CITATION_STATUSES = [
  'UNVERIFIED',
  'VERIFIED',
  'INCONSISTENT',
] as const;

/*
 * Manual citation records. Every record is labeled
 * MANUAL until a legitimate citation data provider
 * exists. Nothing here is discovered or verified
 * automatically.
 */
export class CreateCitationDto {
  @IsOptional()
  @IsString()
  websiteId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsString()
  @MaxLength(200)
  source!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  websiteUrl?: string;

  @IsOptional()
  @IsIn([...CITATION_STATUSES])
  status?: 'UNVERIFIED' | 'VERIFIED' | 'INCONSISTENT';
}

export class UpdateCitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  websiteUrl?: string;

  @IsOptional()
  @IsIn([...CITATION_STATUSES])
  status?: 'UNVERIFIED' | 'VERIFIED' | 'INCONSISTENT';
}
