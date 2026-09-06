import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const PLATFORMS = [
  'CHATGPT',
  'GOOGLE_AI',
  'GEMINI',
  'CLAUDE',
  'PERPLEXITY',
  'OTHER',
] as const;

export class RecordAiCheckDto {
  @IsString()
  websiteId!: string;

  @IsIn([...PLATFORMS])
  platform!:
    | 'CHATGPT'
    | 'GOOGLE_AI'
    | 'GEMINI'
    | 'CLAUDE'
    | 'PERPLEXITY'
    | 'OTHER';

  @IsString()
  @MaxLength(500)
  query!: string;

  @IsBoolean()
  mentioned!: boolean;

  @IsBoolean()
  citationFound!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  position?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  citationUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  competitorNames?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  response?: string;
}
