import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const LOCAL_QUERY_CATEGORIES = [
  'local-service',
  'near-me',
  'commercial',
  'comparison',
  'location-specific',
  'brand',
  'competitor',
  'problem-solution',
] as const;

export type LocalQueryCategory =
  (typeof LOCAL_QUERY_CATEGORIES)[number];

/*
 * Tracked local searches. A query can exist as a
 * TRACKED QUERY without a fabricated position —
 * ranking observations arrive only from a verified
 * future provider (currently none connected).
 */
export class CreateLocalQueryDto {
  @IsString()
  websiteId!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsString()
  @MaxLength(500)
  query!: string;

  @IsOptional()
  @IsIn([...LOCAL_QUERY_CATEGORIES])
  category?: LocalQueryCategory;
}

export class UpdateLocalQueryDto {
  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  query?: string;

  @IsOptional()
  @IsIn([...LOCAL_QUERY_CATEGORIES])
  category?: LocalQueryCategory;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
