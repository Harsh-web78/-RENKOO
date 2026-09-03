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
}

export class ImportBacklinksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BacklinkImportItemDto)
  backlinks: BacklinkImportItemDto[];
}
