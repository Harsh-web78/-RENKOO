-- RENKOO 6.0 Content Strategy Foundation: persistence + composition (additive only).
-- ContentCluster stores strategy cluster snapshots (one row per organization +
-- website + topic). ContentStrategyLink stores the keyword -> topic -> page ->
-- decision -> item -> brief -> draft -> action relationship (one row per
-- organization + website + normalized keyword). No foreign keys: keywords,
-- topics and pages join on stable normalized strings because there is no
-- canonical Page/Keyword master table. Scoring data is NOT duplicated here.

-- CreateTable
CREATE TABLE "ContentCluster" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "primaryKeyword" TEXT NOT NULL,
    "supportingKeywords" JSONB NOT NULL,
    "intent" TEXT,
    "pillarPage" TEXT,
    "targetPage" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'LOW',
    "size" INTEGER NOT NULL DEFAULT 1,
    "missingPages" INTEGER NOT NULL DEFAULT 0,
    "cannibalizationRisk" BOOLEAN NOT NULL DEFAULT false,
    "recommendedPageType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentCluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentCluster_organizationId_websiteId_topic_key" ON "ContentCluster"("organizationId", "websiteId", "topic");

-- CreateIndex
CREATE INDEX "ContentCluster_organizationId_websiteId_idx" ON "ContentCluster"("organizationId", "websiteId");

-- CreateTable
CREATE TABLE "ContentStrategyLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "topic" TEXT,
    "targetPage" TEXT,
    "pageMapping" TEXT,
    "bucket" TEXT,
    "priority" TEXT,
    "priorityScore" INTEGER,
    "intent" TEXT,
    "contentAction" TEXT,
    "contentItemId" TEXT,
    "briefId" TEXT,
    "draftId" TEXT,
    "actionId" TEXT,
    "recommendationId" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentStrategyLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentStrategyLink_organizationId_websiteId_keyword_key" ON "ContentStrategyLink"("organizationId", "websiteId", "keyword");

-- CreateIndex
CREATE INDEX "ContentStrategyLink_organizationId_websiteId_idx" ON "ContentStrategyLink"("organizationId", "websiteId");

-- CreateIndex
CREATE INDEX "ContentStrategyLink_contentItemId_idx" ON "ContentStrategyLink"("contentItemId");

-- CreateIndex
CREATE INDEX "ContentStrategyLink_actionId_idx" ON "ContentStrategyLink"("actionId");
