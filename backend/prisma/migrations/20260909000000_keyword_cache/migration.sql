-- RENKOO Keyword Research 3.0: provider cache + usage ledger (additive only).
-- KeywordMetricCache holds normalized paid-provider rows keyed by
-- provider|metric|country|language|keyword. KeywordResearchLog records
-- one row per fresh (uncached) provider-backed research for free-tier
-- measurement; failures never write a row so failures never consume credits.

-- CreateTable
CREATE TABLE "KeywordMetricCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordMetricCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KeywordMetricCache_cacheKey_key" ON "KeywordMetricCache"("cacheKey");

-- CreateIndex
CREATE INDEX "KeywordMetricCache_provider_metric_country_language_idx" ON "KeywordMetricCache"("provider", "metric", "country", "language");

-- CreateIndex
CREATE INDEX "KeywordMetricCache_expiresAt_idx" ON "KeywordMetricCache"("expiresAt");

-- CreateTable
CREATE TABLE "KeywordResearchLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT,
    "seed" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCalls" INTEGER NOT NULL DEFAULT 0,
    "cacheHits" INTEGER NOT NULL DEFAULT 0,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KeywordResearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KeywordResearchLog_organizationId_createdAt_idx" ON "KeywordResearchLog"("organizationId", "createdAt");
