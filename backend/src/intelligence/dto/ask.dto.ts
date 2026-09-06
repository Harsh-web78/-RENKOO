import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AskIntelligenceDto {
  @IsString()
  websiteId!: string;

  @IsString()
  @MaxLength(2000)
  question!: string;
}

export class CreateIntelligenceActionDto {
  @IsString()
  websiteId!: string;

  @IsOptional()
  @IsString()
  recommendationId?: string;

  @IsOptional()
  @IsString()
  opportunityId?: string;
}
