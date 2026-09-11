-- RENKOO Phase 11: Rank Intelligence 1.0 (additive only).
-- RankObservation stores append-only observed rankings per
-- source (GSC / SERP_PROVIDER / MANUAL). Sources are never
-- merged; missing positions stay NULL (never zero);
-- re-ingestion dedupes on identityKey.

-- CreateTable
CREATE TABLE IF NOT EXISTS "RankObservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "url" TEXT,
    "position" INTEGER,
    "engine" TEXT NOT NULL DEFAULT 'GOOGLE',
    "country" TEXT NOT NULL DEFAULT 'US',
    "language" TEXT NOT NULL DEFAULT 'en',
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "observedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "evidenceState" TEXT NOT NULL DEFAULT 'OBSERVED',
    "impressions" INTEGER,
    "clicks" INTEGER,
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RankObservation_identityKey_key" ON "RankObservation"("identityKey");
CREATE INDEX IF NOT EXISTS "RankObservation_organizationId_websiteId_idx" ON "RankObservation"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "RankObservation_websiteId_normalizedKeyword_idx" ON "RankObservation"("websiteId", "normalizedKeyword");
CREATE INDEX IF NOT EXISTS "RankObservation_websiteId_normalizedKeyword_source_idx" ON "RankObservation"("websiteId", "normalizedKeyword", "source");
CREATE INDEX IF NOT EXISTS "RankObservation_websiteId_observedAt_idx" ON "RankObservation"("websiteId", "observedAt");
CREATE INDEX IF NOT EXISTS "RankObservation_websiteId_url_idx" ON "RankObservation"("websiteId", "url");
