import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const LIVE_AI_PROVIDERS = [
  'GEMINI',
  'OPENAI',
] as const;

export type LiveAiProviderParam =
  (typeof LIVE_AI_PROVIDERS)[number];

/*
 * Manual, controlled single-provider execution of
 * one tracked (queryId) or ad-hoc (query) prompt.
 * One request = one provider call = one AI_SCANS
 * usage unit. No background loops.
 */
export class RunAiCheckDto {
  @IsString()
  websiteId!: string;

  @IsOptional()
  @IsString()
  queryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  query?: string;

  @IsIn([...LIVE_AI_PROVIDERS])
  provider!: LiveAiProviderParam;
}
