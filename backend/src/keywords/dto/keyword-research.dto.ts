import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';

export class ResearchKeywordsDto {
  @IsOptional()
  @IsString()
  websiteId?: string;

  @IsString()
  @MaxLength(200)
  seed!: string;

  @IsOptional()
  @IsIn([
    'keyword',
    'website',
    'competitor',
  ])
  mode?: 'keyword' | 'website' | 'competitor' = 'keyword';

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(200)
  limit?: number = 100;

  /*
   * refresh=true bypasses the provider cache (fresh
   * billable lookup). Default false: cheap cached
   * lookup that never consumes credits.
   */
  @IsOptional()
  @IsBoolean()
  refresh?: boolean = false;
}

export class SerpQueryDto {
  @IsString()
  @MaxLength(200)
  keyword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsBoolean()
  refresh?: boolean = false;

  /*
   * Ties the SERP to first-party evidence: enables
   * Opportunity 3.0 adjustment + new-vs-existing page
   * decision + cannibalization check. Omit for a
   * provider-only SERP overview.
   */
  @IsOptional()
  @IsString()
  websiteId?: string;
}

export class CompetitorLookupDto {
  @IsOptional()
  @IsString()
  websiteId?: string;

  @IsString()
  @MaxLength(253)
  domain!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(500)
  limit?: number = 100;

  @IsOptional()
  @IsBoolean()
  refresh?: boolean = false;

  /*
   * Opt-in SERP strength for the top-N missing keywords
   * by volume (0–10, default 0). Each keyword costs up
   * to 3 provider calls — keep small deliberately.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  includeSerpStrength?: number = 0;
}

export class QuickWinsDto {
  @IsString()
  websiteId!: string;

  @IsString()
  @MaxLength(10)
  startDate!: string;

  @IsString()
  @MaxLength(10)
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(100)
  limit?: number = 50;
}

export class ClusterKeywordsDto {
  @IsOptional()
  @IsString()
  websiteId?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  keywords!: string[];
}

export class SerpClusterDto {
  @IsOptional()
  @IsString()
  websiteId?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  keywords!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  /*
   * Max fresh SERPs per job (1–50, default 25).
   * Striking-distance GSC keywords are sampled first.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxSerp?: number = 25;

  /*
   * Jaccard overlap threshold (0.1–0.9). Defaults to
   * SERP_SIMILARITY_THRESHOLD (0.40).
   */
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(0.9)
  threshold?: number;

  @IsOptional()
  @IsBoolean()
  refresh?: boolean = false;
}

export class StrategyDto {
  @IsString()
  websiteId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  /*
   * Max opportunities returned (10–300, default 100).
   * The engine always scores the full universe first,
   * then slices — ranking is never affected by this.
   */
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(300)
  limit?: number = 100;
}

export class StrategyBriefDto {
  @IsString()
  websiteId!: string;

  @IsIn(['GEMINI', 'OPENAI'])
  provider!: 'GEMINI' | 'OPENAI';

  /*
   * Optional keyword allowlist (max 15). Empty means
   * the top opportunities by priority.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  keywords?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15)
  maxItems?: number = 8;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  startDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class StrategyLinkSyncDto {
  @IsString()
  websiteId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(150)
  limit?: number = 50;
}
export class DiagnoseBatchDto {
  @IsString()
  websiteId!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  keywords?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 5;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class RoadmapDto {
  @IsString()
  websiteId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  /*
   * Max strategy opportunities composed into the
   * roadmap (10–100, default 50). Ranking is never
   * affected by this — the engine always scores
   * first, then slices.
   */
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(100)
  limit?: number = 50;
}
