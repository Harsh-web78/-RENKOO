-- RENKOO Phase 32: Search Change & Alert Intelligence 2.0 (additive only).
-- REUSE PROOF: AiMonitorSchedule/Run cannot be reused (AI prompt/credit
-- columns would corrupt AI billing semantics); MonitoringAlert IS reused
-- for dedupe/state; RankTrackingRun IS reused for lifecycle (+ nullable
-- heartbeat/schedule link for Phase 8-style stale recovery).

-- AlterTable: additive nullable columns on RankTrackingRun
ALTER TABLE IF EXISTS "RankTrackingRun" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);
ALTER TABLE IF EXISTS "RankTrackingRun" ADD COLUMN IF NOT EXISTS "scheduleId" TEXT;

-- CreateTable RankTrackingSchedule
CREATE TABLE IF NOT EXISTS "RankTrackingSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "language" TEXT NOT NULL DEFAULT 'en',
    "device" TEXT NOT NULL DEFAULT 'desktop',
    "searchEngine" TEXT NOT NULL DEFAULT 'GOOGLE',
    "cadence" TEXT NOT NULL DEFAULT 'DAILY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RankTrackingSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable RankAlertPreference
CREATE TABLE IF NOT EXISTS "RankAlertPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mutedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RankAlertPreference_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "RankTrackingSchedule_org_site_ctx_key" ON "RankTrackingSchedule"("organizationId", "websiteId", "country", "language", "device", "searchEngine");
CREATE INDEX IF NOT EXISTS "RankTrackingSchedule_org_site_idx" ON "RankTrackingSchedule"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "RankTrackingSchedule_active_next_idx" ON "RankTrackingSchedule"("isActive", "nextRunAt");
CREATE INDEX IF NOT EXISTS "RankTrackingSchedule_next_idx" ON "RankTrackingSchedule"("nextRunAt");

CREATE UNIQUE INDEX IF NOT EXISTS "RankAlertPreference_org_site_kind_key" ON "RankAlertPreference"("organizationId", "websiteId", "kind", "key");
CREATE INDEX IF NOT EXISTS "RankAlertPreference_org_site_idx" ON "RankAlertPreference"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "RankAlertPreference_kind_idx" ON "RankAlertPreference"("kind");

CREATE INDEX IF NOT EXISTS "RankTrackingRun_schedule_idx" ON "RankTrackingRun"("scheduleId");
