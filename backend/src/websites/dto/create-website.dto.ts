import { IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class CreateWebsiteDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  country?: string;
}