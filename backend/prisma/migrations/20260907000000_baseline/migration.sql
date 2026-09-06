-- RENKOO baseline migration (squash).
-- Represents the full intended schema; supersedes the archived
-- per-feature migrations (see backend/prisma/migrations_archive/).
-- Generated from the live split schema via prisma migrate diff.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."SeoIssueSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "public"."SeoIssueStatus" AS ENUM ('OPEN', 'FIXED', 'IGNORED');

-- CreateEnum
CREATE TYPE "public"."AeoCheckType" AS ENUM ('ANSWER_READINESS', 'FAQ', 'STRUCTURED_DATA', 'ENTITY', 'CITATION', 'CONTENT_DEPTH', 'DIRECT_ANSWER');

-- CreateEnum
CREATE TYPE "public"."AeoIssueStatus" AS ENUM ('OPEN', 'FIXED', 'IGNORED');

-- CreateEnum
CREATE TYPE "public"."AiVisibilityCheckStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."AiVisibilityPlatform" AS ENUM ('CHATGPT', 'GOOGLE_AI', 'GEMINI', 'OPENAI', 'CLAUDE', 'PERPLEXITY', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."VisibilityEngine" AS ENUM ('GOOGLE', 'AI_OVERVIEW', 'CHATGPT', 'PERPLEXITY', 'GEMINI', 'CLAUDE', 'BING_COPILOT');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('TRIALING', 'PENDING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED', 'COMPLETED', 'EXPIRED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'UNPAID');

-- CreateEnum
CREATE TYPE "public"."UsageMetric" AS ENUM ('WEBSITES', 'KEYWORDS', 'COMPETITORS', 'AI_PROMPTS', 'AI_SCANS', 'USERS', 'CLIENTS', 'REPORTS', 'CRAWL_CREDITS', 'API_CALLS', 'AI_CREDITS', 'AI_GROWTH_ACTIONS');

-- CreateEnum
CREATE TYPE "public"."ActionStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."RecommendationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED');

-- CreateTable
CREATE TABLE "public"."Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "clientId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'READY',
    "sections" JSONB,
    "dataAvailability" JSONB,
    "branding" JSONB,
    "error" TEXT,
    "createdBy" TEXT,
    "shareToken" TEXT,
    "shareExpiresAt" TIMESTAMP(3),
    "shareRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AgentRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "userId" TEXT,
    "agentId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'USER_REQUEST',
    "input" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "approvalState" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "selectedTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" JSONB,
    "resultSummary" TEXT,
    "proposedActions" JSONB,
    "executedActionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetQuery" TEXT,
    "intent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDEA',
    "pageUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentBrief" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "itemId" TEXT,
    "targetQuery" TEXT NOT NULL,
    "intent" TEXT,
    "payload" JSONB NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContentDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "itemId" TEXT,
    "briefId" TEXT,
    "mode" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "humanCreated" BOOLEAN NOT NULL DEFAULT true,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BusinessLocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "websiteUrl" TEXT,
    "category" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "gbpName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LocalQuery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "locationId" TEXT,
    "query" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'local-service',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LocalRankingObservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "locationId" TEXT,
    "queryId" TEXT,
    "query" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "position" INTEGER,
    "totalResults" INTEGER,
    "url" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocalRankingObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LocalCitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT,
    "locationId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceUrl" TEXT,
    "businessName" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "websiteUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MonitoringAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "deduplicationKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "persona" TEXT,
    "personaSelectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "public"."MemberRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Website" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "industry" TEXT,
    "country" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Competitor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompetitorCrawl" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "pagesCrawled" INTEGER NOT NULL DEFAULT 0,
    "pagesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "totalIssues" INTEGER NOT NULL DEFAULT 0,
    "critical" INTEGER NOT NULL DEFAULT 0,
    "high" INTEGER NOT NULL DEFAULT 0,
    "medium" INTEGER NOT NULL DEFAULT 0,
    "low" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorCrawl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CompetitorCrawlPage" (
    "id" TEXT NOT NULL,
    "competitorCrawlId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "title" TEXT,
    "metaDescription" TEXT,
    "canonical" TEXT,
    "canonicalAbsolute" TEXT,
    "h1" TEXT[],
    "h2" TEXT[],
    "images" INTEGER NOT NULL DEFAULT 0,
    "imagesWithoutAlt" INTEGER NOT NULL DEFAULT 0,
    "internalLinks" INTEGER NOT NULL DEFAULT 0,
    "externalLinks" INTEGER NOT NULL DEFAULT 0,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "robots" TEXT,
    "robotsIndexable" BOOLEAN,
    "robotsFollow" BOOLEAN,
    "viewport" TEXT,
    "lang" TEXT,
    "charset" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImage" TEXT,
    "twitterCard" TEXT,
    "structuredDataCount" INTEGER NOT NULL DEFAULT 0,
    "jsonLd" JSONB,
    "redirectCount" INTEGER NOT NULL DEFAULT 0,
    "finalUrl" TEXT,
    "contentType" TEXT,
    "loadTimeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorCrawlPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Crawl" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Crawl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CrawlPage" (
    "id" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "title" TEXT,
    "metaDescription" TEXT,
    "canonical" TEXT,
    "h1" TEXT[],
    "h2" TEXT[],
    "images" INTEGER NOT NULL DEFAULT 0,
    "imagesWithoutAlt" INTEGER NOT NULL DEFAULT 0,
    "internalLinks" INTEGER NOT NULL DEFAULT 0,
    "externalLinks" INTEGER NOT NULL DEFAULT 0,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "robots" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "robotsIndexable" BOOLEAN,
    "robotsFollow" BOOLEAN,
    "viewport" TEXT,
    "lang" TEXT,
    "charset" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImage" TEXT,
    "twitterCard" TEXT,
    "structuredDataCount" INTEGER NOT NULL DEFAULT 0,
    "jsonLd" JSONB,
    "canonicalAbsolute" TEXT,
    "redirectCount" INTEGER NOT NULL DEFAULT 0,
    "finalUrl" TEXT,
    "contentType" TEXT,
    "loadTimeMs" INTEGER,

    CONSTRAINT "CrawlPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SeoIssue" (
    "id" TEXT NOT NULL,
    "crawlPageId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "public"."SeoIssueSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "status" "public"."SeoIssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GoogleConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "googleEmail" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3),
    "selectedProperty" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleName" TEXT,
    "googlePicture" TEXT,
    "googleUserId" TEXT NOT NULL,
    "scope" TEXT,
    "selectedAnalyticsProperty" TEXT,
    "lastSuccessfulRequestAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AeoAudit" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "pagesChecked" INTEGER NOT NULL DEFAULT 0,
    "issuesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AeoAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "AeoIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "AiVisibilityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AiVisibilityQuery" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiVisibilityQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "AiVisibilitySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "GeoAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

    CONSTRAINT "GeoQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Backlink" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "anchorText" TEXT,
    "linkType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'MANUAL_IMPORT',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "domainAuthority" DOUBLE PRECISION,
    "pageAuthority" DOUBLE PRECISION,
    "isToxic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Backlink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BacklinkDomain" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "backlinkCount" INTEGER NOT NULL DEFAULT 0,
    "authorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dofollowCount" INTEGER NOT NULL DEFAULT 0,
    "nofollowCount" INTEGER NOT NULL DEFAULT 0,
    "toxicCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklinkDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BacklinkSnapshot" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalBacklinks" INTEGER NOT NULL DEFAULT 0,
    "referringDomains" INTEGER NOT NULL DEFAULT 0,
    "dofollowLinks" INTEGER NOT NULL DEFAULT 0,
    "nofollowLinks" INTEGER NOT NULL DEFAULT 0,
    "toxicLinks" INTEGER NOT NULL DEFAULT 0,
    "authorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newBacklinks" INTEGER NOT NULL DEFAULT 0,
    "lostBacklinks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacklinkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BacklinkOpportunity" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "competitorId" TEXT,
    "targetUrl" TEXT,
    "anchorSuggestion" TEXT,
    "opportunityType" TEXT NOT NULL,
    "opportunityScore" INTEGER NOT NULL DEFAULT 0,
    "priority" TEXT NOT NULL DEFAULT 'LOW',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reason" TEXT,
    "suggestedAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklinkOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BusinessBrain" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "businessName" TEXT,
    "industry" TEXT,
    "country" TEXT,
    "city" TEXT,
    "description" TEXT,
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetAudience" TEXT,
    "primaryGoal" TEXT,
    "primaryKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brandTone" TEXT,
    "uniqueSellingPoint" TEXT,
    "aiSummary" TEXT,
    "businessScore" INTEGER NOT NULL DEFAULT 0,
    "lastAnalyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessBrain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lead" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "source" TEXT NOT NULL DEFAULT 'OTHER',
    "sourceDetail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "score" INTEGER NOT NULL DEFAULT 0,
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "convertedAt" TIMESTAMP(3),
    "notes" TEXT,
    "landingPage" TEXT,
    "keyword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketingSpend" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "source" TEXT NOT NULL,
    "campaign" TEXT,
    "description" TEXT,
    "spendDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Revenue" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "leadId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "source" TEXT,
    "sourceDetail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RECOGNIZED',
    "description" TEXT,
    "recognizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Plan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPrice" DOUBLE PRECISION NOT NULL,
    "yearlyPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "maxWebsites" INTEGER NOT NULL DEFAULT 1,
    "maxKeywords" INTEGER NOT NULL DEFAULT 500,
    "maxCompetitors" INTEGER NOT NULL DEFAULT 5,
    "maxAiPrompts" INTEGER NOT NULL DEFAULT 100,
    "maxAiScans" INTEGER NOT NULL DEFAULT 10,
    "maxUsers" INTEGER NOT NULL DEFAULT 1,
    "maxClients" INTEGER NOT NULL DEFAULT 0,
    "maxReports" INTEGER NOT NULL DEFAULT 5,
    "maxCrawlCredits" INTEGER NOT NULL DEFAULT 10,
    "maxApiCalls" INTEGER NOT NULL DEFAULT 1000,
    "maxAiCredits" INTEGER NOT NULL DEFAULT 100,
    "stripeMonthlyPriceId" TEXT,
    "stripeYearlyPriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "public"."SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "provider" TEXT NOT NULL DEFAULT 'STRIPE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "razorpaySubscriptionId" TEXT,
    "razorpayCustomerId" TEXT,
    "providerPlanId" TEXT,
    "interval" TEXT,
    "currency" TEXT,
    "trialUsed" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProviderPlan" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "providerPlanId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'RAZORPAY',
    "providerPaymentId" TEXT NOT NULL,
    "providerSubscriptionId" TEXT,
    "providerOrderId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "method" TEXT,
    "email" TEXT,
    "contact" TEXT,
    "refundId" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UsageCounter" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "metric" "public"."UsageMetric" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BillingEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'STRIPE',
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Recommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT,
    "competitorId" TEXT,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "impact" TEXT,
    "effort" TEXT,
    "status" "public"."RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "actionText" TEXT,
    "pageUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Action" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT,
    "recommendationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT,
    "priority" TEXT NOT NULL,
    "status" "public"."ActionStatus" NOT NULL DEFAULT 'TODO',
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrganizationInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "public"."MemberRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_organizationId_idx" ON "public"."Client"("organizationId");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "public"."Client"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Report_shareToken_key" ON "public"."Report"("shareToken");

-- CreateIndex
CREATE INDEX "Report_organizationId_idx" ON "public"."Report"("organizationId");

-- CreateIndex
CREATE INDEX "Report_websiteId_idx" ON "public"."Report"("websiteId");

-- CreateIndex
CREATE INDEX "Report_clientId_idx" ON "public"."Report"("clientId");

-- CreateIndex
CREATE INDEX "Report_type_idx" ON "public"."Report"("type");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "public"."Report"("status");

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "public"."Report"("createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_organizationId_idx" ON "public"."AgentRun"("organizationId");

-- CreateIndex
CREATE INDEX "AgentRun_websiteId_idx" ON "public"."AgentRun"("websiteId");

-- CreateIndex
CREATE INDEX "AgentRun_agentId_idx" ON "public"."AgentRun"("agentId");

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "public"."AgentRun"("status");

-- CreateIndex
CREATE INDEX "AgentRun_createdAt_idx" ON "public"."AgentRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "public"."AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_idx" ON "public"."AuthToken"("userId");

-- CreateIndex
CREATE INDEX "AuthToken_type_idx" ON "public"."AuthToken"("type");

-- CreateIndex
CREATE INDEX "AuthToken_expiresAt_idx" ON "public"."AuthToken"("expiresAt");

-- CreateIndex
CREATE INDEX "ContentItem_organizationId_idx" ON "public"."ContentItem"("organizationId");

-- CreateIndex
CREATE INDEX "ContentItem_websiteId_idx" ON "public"."ContentItem"("websiteId");

-- CreateIndex
CREATE INDEX "ContentItem_status_idx" ON "public"."ContentItem"("status");

-- CreateIndex
CREATE INDEX "ContentBrief_organizationId_idx" ON "public"."ContentBrief"("organizationId");

-- CreateIndex
CREATE INDEX "ContentBrief_websiteId_idx" ON "public"."ContentBrief"("websiteId");

-- CreateIndex
CREATE INDEX "ContentBrief_itemId_idx" ON "public"."ContentBrief"("itemId");

-- CreateIndex
CREATE INDEX "ContentDraft_organizationId_idx" ON "public"."ContentDraft"("organizationId");

-- CreateIndex
CREATE INDEX "ContentDraft_websiteId_idx" ON "public"."ContentDraft"("websiteId");

-- CreateIndex
CREATE INDEX "ContentDraft_itemId_idx" ON "public"."ContentDraft"("itemId");

-- CreateIndex
CREATE INDEX "ContentDraft_briefId_idx" ON "public"."ContentDraft"("briefId");

-- CreateIndex
CREATE INDEX "BusinessLocation_organizationId_idx" ON "public"."BusinessLocation"("organizationId");

-- CreateIndex
CREATE INDEX "BusinessLocation_websiteId_idx" ON "public"."BusinessLocation"("websiteId");

-- CreateIndex
CREATE INDEX "LocalQuery_organizationId_idx" ON "public"."LocalQuery"("organizationId");

-- CreateIndex
CREATE INDEX "LocalQuery_websiteId_idx" ON "public"."LocalQuery"("websiteId");

-- CreateIndex
CREATE INDEX "LocalQuery_locationId_idx" ON "public"."LocalQuery"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "LocalQuery_websiteId_query_key" ON "public"."LocalQuery"("websiteId", "query");

-- CreateIndex
CREATE INDEX "LocalRankingObservation_organizationId_idx" ON "public"."LocalRankingObservation"("organizationId");

-- CreateIndex
CREATE INDEX "LocalRankingObservation_websiteId_idx" ON "public"."LocalRankingObservation"("websiteId");

-- CreateIndex
CREATE INDEX "LocalRankingObservation_queryId_idx" ON "public"."LocalRankingObservation"("queryId");

-- CreateIndex
CREATE INDEX "LocalRankingObservation_observedAt_idx" ON "public"."LocalRankingObservation"("observedAt");

-- CreateIndex
CREATE INDEX "LocalCitation_organizationId_idx" ON "public"."LocalCitation"("organizationId");

-- CreateIndex
CREATE INDEX "LocalCitation_websiteId_idx" ON "public"."LocalCitation"("websiteId");

-- CreateIndex
CREATE INDEX "LocalCitation_locationId_idx" ON "public"."LocalCitation"("locationId");

-- CreateIndex
CREATE INDEX "MonitoringAlert_organizationId_idx" ON "public"."MonitoringAlert"("organizationId");

-- CreateIndex
CREATE INDEX "MonitoringAlert_websiteId_idx" ON "public"."MonitoringAlert"("websiteId");

-- CreateIndex
CREATE INDEX "MonitoringAlert_source_idx" ON "public"."MonitoringAlert"("source");

-- CreateIndex
CREATE INDEX "MonitoringAlert_severity_idx" ON "public"."MonitoringAlert"("severity");

-- CreateIndex
CREATE INDEX "MonitoringAlert_status_idx" ON "public"."MonitoringAlert"("status");

-- CreateIndex
CREATE INDEX "MonitoringAlert_detectedAt_idx" ON "public"."MonitoringAlert"("detectedAt");

-- CreateIndex
CREATE INDEX "MonitoringAlert_active_idx" ON "public"."MonitoringAlert"("active");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringAlert_organizationId_websiteId_deduplicationKey_a_key" ON "public"."MonitoringAlert"("organizationId", "websiteId", "deduplicationKey", "active");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "public"."Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMember_userId_idx" ON "public"."OrganizationMember"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMember_organizationId_idx" ON "public"."OrganizationMember"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_userId_organizationId_key" ON "public"."OrganizationMember"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Website_organizationId_idx" ON "public"."Website"("organizationId");

-- CreateIndex
CREATE INDEX "Website_url_idx" ON "public"."Website"("url");

-- CreateIndex
CREATE INDEX "Competitor_organizationId_idx" ON "public"."Competitor"("organizationId");

-- CreateIndex
CREATE INDEX "Competitor_websiteId_idx" ON "public"."Competitor"("websiteId");

-- CreateIndex
CREATE INDEX "Competitor_locationId_idx" ON "public"."Competitor"("locationId");

-- CreateIndex
CREATE INDEX "Competitor_domain_idx" ON "public"."Competitor"("domain");

-- CreateIndex
CREATE INDEX "Competitor_url_idx" ON "public"."Competitor"("url");

-- CreateIndex
CREATE INDEX "CompetitorCrawl_competitorId_idx" ON "public"."CompetitorCrawl"("competitorId");

-- CreateIndex
CREATE INDEX "CompetitorCrawl_createdAt_idx" ON "public"."CompetitorCrawl"("createdAt");

-- CreateIndex
CREATE INDEX "CompetitorCrawl_status_idx" ON "public"."CompetitorCrawl"("status");

-- CreateIndex
CREATE INDEX "CompetitorCrawlPage_competitorCrawlId_idx" ON "public"."CompetitorCrawlPage"("competitorCrawlId");

-- CreateIndex
CREATE INDEX "CompetitorCrawlPage_url_idx" ON "public"."CompetitorCrawlPage"("url");

-- CreateIndex
CREATE INDEX "CompetitorCrawlPage_statusCode_idx" ON "public"."CompetitorCrawlPage"("statusCode");

-- CreateIndex
CREATE INDEX "CompetitorCrawlPage_wordCount_idx" ON "public"."CompetitorCrawlPage"("wordCount");

-- CreateIndex
CREATE INDEX "Crawl_websiteId_idx" ON "public"."Crawl"("websiteId");

-- CreateIndex
CREATE INDEX "Crawl_createdAt_idx" ON "public"."Crawl"("createdAt");

-- CreateIndex
CREATE INDEX "CrawlPage_crawlId_idx" ON "public"."CrawlPage"("crawlId");

-- CreateIndex
CREATE INDEX "CrawlPage_url_idx" ON "public"."CrawlPage"("url");

-- CreateIndex
CREATE INDEX "SeoIssue_crawlPageId_idx" ON "public"."SeoIssue"("crawlPageId");

-- CreateIndex
CREATE INDEX "SeoIssue_code_idx" ON "public"."SeoIssue"("code");

-- CreateIndex
CREATE INDEX "SeoIssue_severity_idx" ON "public"."SeoIssue"("severity");

-- CreateIndex
CREATE INDEX "SeoIssue_status_idx" ON "public"."SeoIssue"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_organizationId_key" ON "public"."GoogleConnection"("organizationId");

-- CreateIndex
CREATE INDEX "GoogleConnection_googleUserId_idx" ON "public"."GoogleConnection"("googleUserId");

-- CreateIndex
CREATE INDEX "AeoAudit_createdAt_idx" ON "public"."AeoAudit"("createdAt");

-- CreateIndex
CREATE INDEX "AeoAudit_websiteId_idx" ON "public"."AeoAudit"("websiteId");

-- CreateIndex
CREATE INDEX "AeoIssue_auditId_idx" ON "public"."AeoIssue"("auditId");

-- CreateIndex
CREATE INDEX "AeoIssue_severity_idx" ON "public"."AeoIssue"("severity");

-- CreateIndex
CREATE INDEX "AeoIssue_status_idx" ON "public"."AeoIssue"("status");

-- CreateIndex
CREATE INDEX "AiVisibilityCheck_checkedAt_idx" ON "public"."AiVisibilityCheck"("checkedAt");

-- CreateIndex
CREATE INDEX "AiVisibilityCheck_platform_idx" ON "public"."AiVisibilityCheck"("platform");

-- CreateIndex
CREATE INDEX "AiVisibilityCheck_status_idx" ON "public"."AiVisibilityCheck"("status");

-- CreateIndex
CREATE INDEX "AiVisibilityCheck_websiteId_idx" ON "public"."AiVisibilityCheck"("websiteId");

-- CreateIndex
CREATE INDEX "AiVisibilityCheck_websiteId_platform_idx" ON "public"."AiVisibilityCheck"("websiteId", "platform");

-- CreateIndex
CREATE INDEX "AiVisibilityQuery_isActive_idx" ON "public"."AiVisibilityQuery"("isActive");

-- CreateIndex
CREATE INDEX "AiVisibilityQuery_websiteId_idx" ON "public"."AiVisibilityQuery"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "AiVisibilityQuery_websiteId_query_key" ON "public"."AiVisibilityQuery"("websiteId", "query");

-- CreateIndex
CREATE INDEX "AiVisibilitySummary_date_idx" ON "public"."AiVisibilitySummary"("date");

-- CreateIndex
CREATE INDEX "AiVisibilitySummary_websiteId_idx" ON "public"."AiVisibilitySummary"("websiteId");

-- CreateIndex
CREATE UNIQUE INDEX "AiVisibilitySummary_websiteId_date_key" ON "public"."AiVisibilitySummary"("websiteId", "date");

-- CreateIndex
CREATE INDEX "GeoAudit_createdAt_idx" ON "public"."GeoAudit"("createdAt");

-- CreateIndex
CREATE INDEX "GeoAudit_websiteId_idx" ON "public"."GeoAudit"("websiteId");

-- CreateIndex
CREATE INDEX "GeoQuery_checkedAt_idx" ON "public"."GeoQuery"("checkedAt");

-- CreateIndex
CREATE INDEX "GeoQuery_engine_idx" ON "public"."GeoQuery"("engine");

-- CreateIndex
CREATE INDEX "GeoQuery_query_idx" ON "public"."GeoQuery"("query");

-- CreateIndex
CREATE INDEX "GeoQuery_websiteId_idx" ON "public"."GeoQuery"("websiteId");

-- CreateIndex
CREATE INDEX "Backlink_websiteId_idx" ON "public"."Backlink"("websiteId");

-- CreateIndex
CREATE INDEX "Backlink_sourceDomain_idx" ON "public"."Backlink"("sourceDomain");

-- CreateIndex
CREATE INDEX "Backlink_targetUrl_idx" ON "public"."Backlink"("targetUrl");

-- CreateIndex
CREATE INDEX "Backlink_status_idx" ON "public"."Backlink"("status");

-- CreateIndex
CREATE INDEX "Backlink_lastSeenAt_idx" ON "public"."Backlink"("lastSeenAt");

-- CreateIndex
CREATE INDEX "BacklinkDomain_websiteId_idx" ON "public"."BacklinkDomain"("websiteId");

-- CreateIndex
CREATE INDEX "BacklinkDomain_authorityScore_idx" ON "public"."BacklinkDomain"("authorityScore");

-- CreateIndex
CREATE INDEX "BacklinkDomain_backlinkCount_idx" ON "public"."BacklinkDomain"("backlinkCount");

-- CreateIndex
CREATE UNIQUE INDEX "BacklinkDomain_websiteId_domain_key" ON "public"."BacklinkDomain"("websiteId", "domain");

-- CreateIndex
CREATE INDEX "BacklinkSnapshot_websiteId_idx" ON "public"."BacklinkSnapshot"("websiteId");

-- CreateIndex
CREATE INDEX "BacklinkSnapshot_date_idx" ON "public"."BacklinkSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "BacklinkSnapshot_websiteId_date_key" ON "public"."BacklinkSnapshot"("websiteId", "date");

-- CreateIndex
CREATE INDEX "BacklinkOpportunity_websiteId_idx" ON "public"."BacklinkOpportunity"("websiteId");

-- CreateIndex
CREATE INDEX "BacklinkOpportunity_competitorId_idx" ON "public"."BacklinkOpportunity"("competitorId");

-- CreateIndex
CREATE INDEX "BacklinkOpportunity_opportunityScore_idx" ON "public"."BacklinkOpportunity"("opportunityScore");

-- CreateIndex
CREATE INDEX "BacklinkOpportunity_priority_idx" ON "public"."BacklinkOpportunity"("priority");

-- CreateIndex
CREATE INDEX "BacklinkOpportunity_status_idx" ON "public"."BacklinkOpportunity"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessBrain_websiteId_key" ON "public"."BusinessBrain"("websiteId");

-- CreateIndex
CREATE INDEX "BusinessBrain_businessScore_idx" ON "public"."BusinessBrain"("businessScore");

-- CreateIndex
CREATE INDEX "Lead_websiteId_idx" ON "public"."Lead"("websiteId");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "public"."Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "public"."Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_converted_idx" ON "public"."Lead"("converted");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "public"."Lead"("createdAt");

-- CreateIndex
CREATE INDEX "MarketingSpend_websiteId_idx" ON "public"."MarketingSpend"("websiteId");

-- CreateIndex
CREATE INDEX "MarketingSpend_spendDate_idx" ON "public"."MarketingSpend"("spendDate");

-- CreateIndex
CREATE INDEX "MarketingSpend_source_idx" ON "public"."MarketingSpend"("source");

-- CreateIndex
CREATE INDEX "Revenue_websiteId_idx" ON "public"."Revenue"("websiteId");

-- CreateIndex
CREATE INDEX "Revenue_leadId_idx" ON "public"."Revenue"("leadId");

-- CreateIndex
CREATE INDEX "Revenue_status_idx" ON "public"."Revenue"("status");

-- CreateIndex
CREATE INDEX "Revenue_recognizedAt_idx" ON "public"."Revenue"("recognizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_code_key" ON "public"."Plan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "public"."Subscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "public"."Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "public"."Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPlan_providerPlanId_key" ON "public"."ProviderPlan"("providerPlanId");

-- CreateIndex
CREATE INDEX "ProviderPlan_provider_idx" ON "public"."ProviderPlan"("provider");

-- CreateIndex
CREATE INDEX "ProviderPlan_planCode_idx" ON "public"."ProviderPlan"("planCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPlan_provider_planCode_interval_currency_key" ON "public"."ProviderPlan"("provider", "planCode", "interval", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "public"."Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_idx" ON "public"."Payment"("organizationId");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_idx" ON "public"."Payment"("subscriptionId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "public"."Payment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UsageCounter_subscriptionId_metric_periodStart_key" ON "public"."UsageCounter"("subscriptionId", "metric", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_eventId_key" ON "public"."BillingEvent"("eventId");

-- CreateIndex
CREATE INDEX "Recommendation_organizationId_idx" ON "public"."Recommendation"("organizationId");

-- CreateIndex
CREATE INDEX "Recommendation_websiteId_idx" ON "public"."Recommendation"("websiteId");

-- CreateIndex
CREATE INDEX "Recommendation_competitorId_idx" ON "public"."Recommendation"("competitorId");

-- CreateIndex
CREATE INDEX "Recommendation_status_idx" ON "public"."Recommendation"("status");

-- CreateIndex
CREATE INDEX "Action_organizationId_idx" ON "public"."Action"("organizationId");

-- CreateIndex
CREATE INDEX "Action_websiteId_idx" ON "public"."Action"("websiteId");

-- CreateIndex
CREATE INDEX "Action_recommendationId_idx" ON "public"."Action"("recommendationId");

-- CreateIndex
CREATE INDEX "Action_status_idx" ON "public"."Action"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationInvite_token_key" ON "public"."OrganizationInvite"("token");

-- CreateIndex
CREATE INDEX "OrganizationInvite_organizationId_idx" ON "public"."OrganizationInvite"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationInvite_email_idx" ON "public"."OrganizationInvite"("email");

-- CreateIndex
CREATE INDEX "OrganizationInvite_expiresAt_idx" ON "public"."OrganizationInvite"("expiresAt");

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentBrief" ADD CONSTRAINT "ContentBrief_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContentDraft" ADD CONSTRAINT "ContentDraft_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."ContentItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Website" ADD CONSTRAINT "Website_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Website" ADD CONSTRAINT "Website_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Competitor" ADD CONSTRAINT "Competitor_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompetitorCrawl" ADD CONSTRAINT "CompetitorCrawl_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "public"."Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CompetitorCrawlPage" ADD CONSTRAINT "CompetitorCrawlPage_competitorCrawlId_fkey" FOREIGN KEY ("competitorCrawlId") REFERENCES "public"."CompetitorCrawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Crawl" ADD CONSTRAINT "Crawl_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CrawlPage" ADD CONSTRAINT "CrawlPage_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "public"."Crawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SeoIssue" ADD CONSTRAINT "SeoIssue_crawlPageId_fkey" FOREIGN KEY ("crawlPageId") REFERENCES "public"."CrawlPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoogleConnection" ADD CONSTRAINT "GoogleConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AeoAudit" ADD CONSTRAINT "AeoAudit_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AeoIssue" ADD CONSTRAINT "AeoIssue_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "public"."AeoAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiVisibilityCheck" ADD CONSTRAINT "AiVisibilityCheck_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiVisibilityQuery" ADD CONSTRAINT "AiVisibilityQuery_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AiVisibilitySummary" ADD CONSTRAINT "AiVisibilitySummary_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeoAudit" ADD CONSTRAINT "GeoAudit_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeoQuery" ADD CONSTRAINT "GeoQuery_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Backlink" ADD CONSTRAINT "Backlink_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BacklinkDomain" ADD CONSTRAINT "BacklinkDomain_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BacklinkSnapshot" ADD CONSTRAINT "BacklinkSnapshot_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BacklinkOpportunity" ADD CONSTRAINT "BacklinkOpportunity_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusinessBrain" ADD CONSTRAINT "BusinessBrain_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketingSpend" ADD CONSTRAINT "MarketingSpend_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Revenue" ADD CONSTRAINT "Revenue_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Revenue" ADD CONSTRAINT "Revenue_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UsageCounter" ADD CONSTRAINT "UsageCounter_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingEvent" ADD CONSTRAINT "BillingEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recommendation" ADD CONSTRAINT "Recommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recommendation" ADD CONSTRAINT "Recommendation_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Recommendation" ADD CONSTRAINT "Recommendation_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "public"."Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "public"."Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Action" ADD CONSTRAINT "Action_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "public"."Recommendation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrganizationInvite" ADD CONSTRAINT "OrganizationInvite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

