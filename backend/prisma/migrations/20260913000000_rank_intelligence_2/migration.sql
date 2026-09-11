-- RENKOO Phase 31: Rank Intelligence 2.0 (additive only).
-- Adds the persistent tracked-keyword watchlist (TrackedKeyword)
-- and bounded tracking runs (RankTrackingRun). Extends
-- RankObservation with nullable 2.0 columns only — existing
-- rows and queries are untouched. Missing positions stay
-- NULL (never zero); history stays append-only.

-- AlterTable: additive nullable columns on RankObservation
ALTER TABLE IF EXISTS "RankObservation" ADD COLUMN IF NOT EXISTS "trackedKeywordId" TEXT;
ALTER TABLE IF EXISTS "RankObservation" ADD COLUMN IF NOT EXISTS "rankingUrl" TEXT;
ALTER TABLE IF EXISTS "RankObservation" ADD COLUMN IF NOT EXISTS "serpFeatures" JSONB;
ALTER TABLE IF EXISTS "RankObservation" ADD COLUMN IF NOT EXISTS "resultType" TEXT;
ALTER TABLE IF EXISTS "RankObservation" ADD COLUMN IF NOT EXISTS "aiOverviewState" TEXT;
ALTER TABLE IF EXISTS "RankObservation" ADD COLUMN IF NOT EXISTS "aiCitationState" TEXT;

-- CreateTable TrackedKeyword
CREATE TABLE IF NOT EXISTS "TrackedKeyword" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "language" TEXT NOT NULL DEFAULT 'en',
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "searchEngine" TEXT NOT NULL DEFAULT 'GOOGLE',
    "targetUrl" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trackingStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3),
    "lastPosition" INTEGER,
    "lastRankingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrackedKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable RankTrackingRun
CREATE TABLE IF NOT EXISTS "RankTrackingRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "windowKey" TEXT NOT NULL,
    "totalKeywords" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RankTrackingRun_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "TrackedKeyword_org_site_kw_country_lang_device_engine_key" ON "TrackedKeyword"("organizationId", "websiteId", "normalizedKeyword", "country", "language", "device", "searchEngine");
CREATE INDEX IF NOT EXISTS "TrackedKeyword_organizationId_websiteId_idx" ON "TrackedKeyword"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "TrackedKeyword_websiteId_isActive_idx" ON "TrackedKeyword"("websiteId", "isActive");
CREATE INDEX IF NOT EXISTS "TrackedKeyword_organizationId_idx" ON "TrackedKeyword"("organizationId");
CREATE INDEX IF NOT EXISTS "TrackedKeyword_normalizedKeyword_idx" ON "TrackedKeyword"("normalizedKeyword");
CREATE INDEX IF NOT EXISTS "TrackedKeyword_country_device_engine_idx" ON "TrackedKeyword"("country", "device", "searchEngine");

CREATE UNIQUE INDEX IF NOT EXISTS "RankTrackingRun_org_site_window_key" ON "RankTrackingRun"("organizationId", "websiteId", "windowKey");
CREATE INDEX IF NOT EXISTS "RankTrackingRun_organizationId_websiteId_idx" ON "RankTrackingRun"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "RankTrackingRun_status_idx" ON "RankTrackingRun"("status");
CREATE INDEX IF NOT EXISTS "RankTrackingRun_windowKey_idx" ON "RankTrackingRun"("windowKey");

CREATE INDEX IF NOT EXISTS "RankObservation_trackedKeywordId_idx" ON "RankObservation"("trackedKeywordId");
CREATE INDEX IF NOT EXISTS "RankObservation_site_tracked_observed_idx" ON "RankObservation"("websiteId", "trackedKeywordId", "observedAt");
