import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class UpdateCompetitorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  url?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}