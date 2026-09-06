import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BacklinkImportItemDto {
  @IsUrl()
  sourceUrl: string;

  @IsUrl()
  targetUrl: string;

  @IsString()
  sourceDomain: string;

  @IsOptional()
  @IsString()
  anchorText?: string;

  @IsOptional()
  @IsString()
  linkType?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  domainAuthority?: number;

  @IsOptional()
  @IsNumber()
  pageAuthority?: number;

  @IsOptional()
  @IsBoolean()
  isToxic?: boolean;

  @IsOptional()
  @IsString()
  source?: string;
}

export class ImportBacklinksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BacklinkImportItemDto)
  backlinks: BacklinkImportItemDto[];

  @IsOptional()
  @IsString()
  source?: string;
}

export class ReconcileBacklinksDto {
  @IsArray()
  @IsUrl({}, { each: true })
  observedUrls: string[];
}

export class CreateBacklinkOpportunityDto {
  @IsOptional()
  @IsString()
  competitorId?: string;

  @IsOptional()
  @IsString()
  targetUrl?: string;

  @IsOptional()
  @IsString()
  anchorSuggestion?: string;

  @IsString()
  opportunityType!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  suggestedAction?: string;
}

export class UpdateBacklinkOpportunityDto {
  @IsOptional()
  @IsString()
  status?: string;
}
