-- RENKOO Phase 8C: official Google/Bing observations (additive only).
-- AiOfficialObservation stores append-only first-party rows from the
-- Search Analytics API (VERIFIED organic demand) and user-exported
-- UI rows (OBSERVED manual exports). History is never rewritten;
-- re-ingestion dedupes on identityKey.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiOfficialObservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "query" TEXT,
    "pageUrl" TEXT,
    "country" TEXT,
    "device" TEXT,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "citations" INTEGER,
    "groundingQuery" TEXT,
    "evidenceState" TEXT NOT NULL DEFAULT 'OBSERVED',
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiOfficialObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiOfficialObservation_identityKey_key" ON "AiOfficialObservation"("identityKey");
CREATE INDEX IF NOT EXISTS "AiOfficialObservation_organizationId_websiteId_idx" ON "AiOfficialObservation"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "AiOfficialObservation_websiteId_provider_kind_idx" ON "AiOfficialObservation"("websiteId", "provider", "kind");
CREATE INDEX IF NOT EXISTS "AiOfficialObservation_websiteId_date_idx" ON "AiOfficialObservation"("websiteId", "date");
CREATE INDEX IF NOT EXISTS "AiOfficialObservation_websiteId_kind_date_idx" ON "AiOfficialObservation"("websiteId", "kind", "date");
