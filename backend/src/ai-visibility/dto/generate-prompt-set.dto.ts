import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class GenerateAiPromptSetDto {
  @IsOptional()
  @IsArray()
  keywords?: Array<{
    keyword: string;
    intent?: string | null;
    topic?: string | null;
    sourceUrl?: string | null;
    country?: string | null;
    language?: string | null;
  }>;

  @IsOptional()
  @IsArray()
  gscQueries?: string[];

  @IsOptional()
  @IsArray()
  serpTopics?: string[];

  @IsOptional()
  @IsObject()
  business?: {
    name?: string | null;
    category?: string | null;
    locations?: string[];
    offerings?: string[];
  };

  @IsOptional()
  @IsArray()
  competitorTerms?: string[];

  @IsOptional()
  @IsArray()
  existingContent?: Array<{
    url: string;
    topic?: string | null;
  }>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  maxPrompts?: number;

  @IsOptional()
  @IsString()
  defaultCountry?: string;

  @IsOptional()
  @IsString()
  defaultLanguage?: string;
}
