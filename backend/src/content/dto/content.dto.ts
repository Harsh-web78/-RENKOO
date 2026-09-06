import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const CONTENT_STATUSES = [
  'IDEA',
  'BRIEF',
  'DRAFT',
  'REVIEW',
  'READY',
  'PUBLISHED',
  'REFRESH_REQUIRED',
  'ARCHIVED',
] as const;

export const GENERATE_MODES = [
  'OUTLINE',
  'DRAFT',
  'SECTION',
  'FAQ',
  'REWRITE',
] as const;

export const LIVE_GENERATE_PROVIDERS = [
  'GEMINI',
  'OPENAI',
] as const;

export class CreateItemDto {
  @IsString()
  websiteId!: string;

  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetQuery?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  intent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;
}

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  targetQuery?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  intent?: string;

  @IsOptional()
  @IsIn([...CONTENT_STATUSES])
  status?: (typeof CONTENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;
}

export class CreateBriefDto {
  @IsString()
  websiteId!: string;

  @IsString()
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  page?: string;

  @IsOptional()
  @IsString()
  itemId?: string;
}

export class GenerateDto {
  @IsString()
  websiteId!: string;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  briefId?: string;

  @IsIn([...GENERATE_MODES])
  mode!: (typeof GENERATE_MODES)[number];

  @IsIn([...LIVE_GENERATE_PROVIDERS])
  provider!: (typeof LIVE_GENERATE_PROVIDERS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  input?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  topic?: string;
}

export class OptimizeDto {
  @IsString()
  websiteId!: string;

  @IsString()
  @MaxLength(2000)
  pageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  query?: string;
}

export class PublishConfirmDto {
  @IsBoolean()
  confirmed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;
}
