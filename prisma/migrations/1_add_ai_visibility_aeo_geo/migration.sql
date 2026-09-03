-- This is an empty migration.

-- =========================================================
-- AI VISIBILITY / AEO / GEO MIGRATION
-- Existing 0_init tables are NOT modified.
-- =========================================================

-- ---------------------------------------------------------
-- AI VISIBILITY ENUMS
-- ---------------------------------------------------------

CREATE TYPE "public"."AiVisibilityPlatform" AS ENUM (
    'CHATGPT',
    'GOOGLE_AI',
    'GEMINI',
    'CLAUDE',
    'PERPLEXITY',
    'OTHER'
);

CREATE TYPE "public"."AiVisibilityCheckStatus" AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED'
);

-- ---------------------------------------------------------
-- GEO ENUMS
-- ---------------------------------------------------------

CREATE TYPE "public"."VisibilityEngine" AS ENUM (
    'GOOGLE',
    'AI_OVERVIEW',
    'CHATGPT',
    'PERPLEXITY',
    'GEMINI',
    'CLAUDE',
    'BING_COPILOT'
);

CREATE TYPE "public"."AeoCheckType" AS ENUM (
    'ANSWER_READINESS',
    'FAQ',
    'STRUCTURED_DATA',
    'ENTITY',
    'CITATION',
    'CONTENT_DEPTH',
    'DIRECT_ANSWER'
);

CREATE TYPE "public"."AeoIssueStatus" AS ENUM (
    'OPEN',
    'FIXED',
    'IGNORED'
);

-- =========================================================
-- AI VISIBILITY QUERY
-- =========================================================

CREATE TABLE "public"."AiVisibilityQuery" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVisibilityQuery_pkey"
        PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiVisibilityQuery_websiteId_query_key"
    ON "public"."AiVisibilityQuery"("websiteId", "query");

CREATE INDEX "AiVisibilityQuery_websiteId_idx"
    ON "public"."AiVisibilityQuery"("websiteId");

CREATE INDEX "AiVisibilityQuery_isActive_idx"
    ON "public"."AiVisibilityQuery"("isActive");

ALTER TABLE "public"."AiVisibilityQuery"
    ADD CONSTRAINT "AiVisibilityQuery_websiteId_fkey"
    FOREIGN KEY ("websiteId")
    REFERENCES "public"."Website"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- =========================================================
-- AI VISIBILITY CHECK
-- =========================================================

CREATE TABLE "public"."AiVisibilityCheck" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "platform" "public"."AiVisibilityPlatform" NOT NULL,
    "query" TEXT NOT NULL,
    "status" "public"."AiVisibilityCheckStatus" NOT NULL DEFAULT 'PENDING',
    "mentioned" BOOLEAN NOT NULL DEFAULT false,
    "citationFound" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER,
    "response" TEXT,
    "citationUrl" TEXT,
    "competitorNames" TEXT[],
    "checkedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVisibilityCheck_pkey"
        PRIMARY KEY ("id")
);

CREATE INDEX "AiVisibilityCheck_websiteId_idx"
    ON "public"."AiVisibilityCheck"("websiteId");

CREATE INDEX "AiVisibilityCheck_platform_idx"
    ON "public"."AiVisibilityCheck"("platform");

CREATE INDEX "AiVisibilityCheck_status_idx"
    ON "public"."AiVisibilityCheck"("status");

CREATE INDEX "AiVisibilityCheck_checkedAt_idx"
    ON "public"."AiVisibilityCheck"("checkedAt");

CREATE INDEX "AiVisibilityCheck_websiteId_platform_idx"
    ON "public"."AiVisibilityCheck"("websiteId", "platform");

ALTER TABLE "public"."AiVisibilityCheck"
    ADD CONSTRAINT "AiVisibilityCheck_websiteId_fkey"
    FOREIGN KEY ("websiteId")
    REFERENCES "public"."Website"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- =========================================================
-- AI VISIBILITY SUMMARY
-- =========================================================

CREATE TABLE "public"."AiVisibilitySummary" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalQueries" INTEGER NOT NULL DEFAULT 0,
    "mentionedQueries" INTEGER NOT NULL DEFAULT 0,
    "citedQueries" INTEGER NOT NULL DEFAULT 0,
    "visibilityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "citationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averagePosition" DOUBLE PRECISION,
    "competitorMentions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVisibilitySummary_pkey"
        PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiVisibilitySummary_websiteId_date_key"
    ON "public"."AiVisibilitySummary"("websiteId", "date");

CREATE INDEX "AiVisibilitySummary_websiteId_idx"
    ON "public"."AiVisibilitySummary"("websiteId");

CREATE INDEX "AiVisibilitySummary_date_idx"
    ON "public"."AiVisibilitySummary"("date");

ALTER TABLE "public"."AiVisibilitySummary"
    ADD CONSTRAINT "AiVisibilitySummary_websiteId_fkey"
    FOREIGN KEY ("websiteId")
    REFERENCES "public"."Website"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- =========================================================
-- AEO AUDIT
-- =========================================================

CREATE TABLE "public"."AeoAudit" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "pagesChecked" INTEGER NOT NULL DEFAULT 0,
    "issuesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeoAudit_pkey"
        PRIMARY KEY ("id")
);

CREATE INDEX "AeoAudit_websiteId_idx"
    ON "public"."AeoAudit"("websiteId");

CREATE INDEX "AeoAudit_createdAt_idx"
    ON "public"."AeoAudit"("createdAt");

ALTER TABLE "public"."AeoAudit"
    ADD CONSTRAINT "AeoAudit_websiteId_fkey"
    FOREIGN KEY ("websiteId")
    REFERENCES "public"."Website"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- =========================================================
-- AEO ISSUE
-- =========================================================

CREATE TABLE "public"."AeoIssue" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "pageUrl" TEXT,
    "checkType" "public"."AeoCheckType" NOT NULL,
    "status" "public"."AeoIssueStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "public"."SeoIssueSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeoIssue_pkey"
        PRIMARY KEY ("id")
);

CREATE INDEX "AeoIssue_auditId_idx"
    ON "public"."AeoIssue"("auditId");

CREATE INDEX "AeoIssue_status_idx"
    ON "public"."AeoIssue"("status");

CREATE INDEX "AeoIssue_severity_idx"
    ON "public"."AeoIssue"("severity");

ALTER TABLE "public"."AeoIssue"
    ADD CONSTRAINT "AeoIssue_auditId_fkey"
    FOREIGN KEY ("auditId")
    REFERENCES "public"."AeoAudit"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- =========================================================
-- GEO AUDIT
-- =========================================================

CREATE TABLE "public"."GeoAudit" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "entityScore" INTEGER NOT NULL DEFAULT 0,
    "citationScore" INTEGER NOT NULL DEFAULT 0,
    "authorityScore" INTEGER NOT NULL DEFAULT 0,
    "contentScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeoAudit_pkey"
        PRIMARY KEY ("id")
);

CREATE INDEX "GeoAudit_websiteId_idx"
    ON "public"."GeoAudit"("websiteId");

CREATE INDEX "GeoAudit_createdAt_idx"
    ON "public"."GeoAudit"("createdAt");

ALTER TABLE "public"."GeoAudit"
    ADD CONSTRAINT "GeoAudit_websiteId_fkey"
    FOREIGN KEY ("websiteId")
    REFERENCES "public"."Website"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- =========================================================
-- GEO QUERY
-- =========================================================

CREATE TABLE "public"."GeoQuery" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "engine" "public"."VisibilityEngine" NOT NULL,
    "mentioned" BOOLEAN NOT NULL DEFAULT false,
    "cited" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER,
    "response" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoQuery_pkey"
        PRIMARY KEY ("id")
);

CREATE INDEX "GeoQuery_websiteId_idx"
    ON "public"."GeoQuery"("websiteId");

CREATE INDEX "GeoQuery_engine_idx"
    ON "public"."GeoQuery"("engine");

CREATE INDEX "GeoQuery_query_idx"
    ON "public"."GeoQuery"("query");

CREATE INDEX "GeoQuery_checkedAt_idx"
    ON "public"."GeoQuery"("checkedAt");

ALTER TABLE "public"."GeoQuery"
    ADD CONSTRAINT "GeoQuery_websiteId_fkey"
    FOREIGN KEY ("websiteId")
    REFERENCES "public"."Website"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;