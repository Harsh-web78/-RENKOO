-- RENKOO 6.0 Phase 2B: observed internal-link graph (additive only).
-- CrawlLink stores one row per distinct (crawl, source, target, anchor,
-- rel-attribute) observation from website crawls. Anchors are observed
-- HTML text (bounded in code), never recommendations. organizationId and
-- websiteId are denormalized for tenant-safe reads without joins.

-- CreateTable
CREATE TABLE "CrawlLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "anchorText" TEXT NOT NULL DEFAULT '',
    "anchorKey" TEXT NOT NULL DEFAULT '',
    "linkType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "nofollow" BOOLEAN NOT NULL DEFAULT false,
    "sponsored" BOOLEAN NOT NULL DEFAULT false,
    "ugc" BOOLEAN NOT NULL DEFAULT false,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrawlLink_crawlId_sourceUrl_targetUrl_anchorKey_nofollow_sponsored_ugc_key" ON "CrawlLink"("crawlId", "sourceUrl", "targetUrl", "anchorKey", "nofollow", "sponsored", "ugc");

-- CreateIndex
CREATE INDEX "CrawlLink_organizationId_websiteId_crawlId_idx" ON "CrawlLink"("organizationId", "websiteId", "crawlId");

-- CreateIndex
CREATE INDEX "CrawlLink_crawlId_sourceUrl_idx" ON "CrawlLink"("crawlId", "sourceUrl");

-- CreateIndex
CREATE INDEX "CrawlLink_crawlId_targetUrl_idx" ON "CrawlLink"("crawlId", "targetUrl");

-- AddForeignKey
ALTER TABLE "CrawlLink" ADD CONSTRAINT "CrawlLink_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;
