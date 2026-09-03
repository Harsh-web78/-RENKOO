import {
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class CreateCompetitorDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsUrl({
    require_protocol: true,
  })
  url!: string;

  @IsString()
  @MinLength(1)
  websiteId!: string;
}