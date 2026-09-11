-- RENKOO Phase 7: AI Prompt Monitoring 1.0 (additive only).
-- New schedule + run ledger tables for durable monitoring runs.
-- AiVisibilityCheck gains nullable monitoring lineage columns;
-- history stays append-only, nothing is rewritten or deleted.

-- AlterTable (nullable lineage, safe on populated tables)
ALTER TABLE "AiVisibilityCheck" ADD COLUMN IF NOT EXISTS "runId" TEXT;
ALTER TABLE "AiVisibilityCheck" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "AiVisibilityCheck" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "AiVisibilityCheck" ADD COLUMN IF NOT EXISTS "language" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiMonitorSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "name" TEXT,
    "surfaces" TEXT[] NOT NULL DEFAULT '{}',
    "country" TEXT NOT NULL DEFAULT 'US',
    "language" TEXT NOT NULL DEFAULT 'en',
    "cadence" TEXT NOT NULL DEFAULT 'WEEKLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "configKey" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMonitorSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiMonitorRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "windowKey" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "promptCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "unavailableCount" INTEGER NOT NULL DEFAULT 0,
    "creditUsed" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMonitorRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiVisibilityCheck_idempotencyKey_key" ON "AiVisibilityCheck"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "AiVisibilityCheck_runId_idx" ON "AiVisibilityCheck"("runId");
CREATE INDEX IF NOT EXISTS "AiVisibilityCheck_websiteId_query_platform_checkedAt_idx" ON "AiVisibilityCheck"("websiteId", "query", "platform", "checkedAt");
CREATE INDEX IF NOT EXISTS "AiMonitorSchedule_organizationId_websiteId_idx" ON "AiMonitorSchedule"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "AiMonitorSchedule_websiteId_isActive_idx" ON "AiMonitorSchedule"("websiteId", "isActive");
CREATE INDEX IF NOT EXISTS "AiMonitorSchedule_isActive_nextRunAt_idx" ON "AiMonitorSchedule"("isActive", "nextRunAt");
CREATE INDEX IF NOT EXISTS "AiMonitorSchedule_websiteId_configKey_idx" ON "AiMonitorSchedule"("websiteId", "configKey");
CREATE UNIQUE INDEX IF NOT EXISTS "AiMonitorRun_scheduleId_windowKey_key" ON "AiMonitorRun"("scheduleId", "windowKey");
CREATE INDEX IF NOT EXISTS "AiMonitorRun_organizationId_websiteId_idx" ON "AiMonitorRun"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "AiMonitorRun_websiteId_status_idx" ON "AiMonitorRun"("websiteId", "status");
CREATE INDEX IF NOT EXISTS "AiMonitorRun_websiteId_createdAt_idx" ON "AiMonitorRun"("websiteId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiMonitorRun_scheduleId_idx" ON "AiMonitorRun"("scheduleId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiVisibilityCheck_runId_fkey'
  ) THEN
    ALTER TABLE "AiVisibilityCheck" ADD CONSTRAINT "AiVisibilityCheck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiMonitorRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AiMonitorRun_scheduleId_fkey'
  ) THEN
    ALTER TABLE "AiMonitorRun" ADD CONSTRAINT "AiMonitorRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "AiMonitorSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
