import {
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateBusinessBrainDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  products?: string[];

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  primaryGoal?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  primaryKeywords?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetLocations?: string[];

  @IsOptional()
  @IsString()
  brandTone?: string;

  @IsOptional()
  @IsString()
  uniqueSellingPoint?: string;
}