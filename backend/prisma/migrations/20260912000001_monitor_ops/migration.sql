-- RENKOO Phase 8A: monitoring ops hardening (additive only).
-- AiMonitorRun gains a bounded retry counter for run
-- observability. Stale-run lookups use a (status,
-- startedAt) index so recovery never scans the table.

-- AlterTable
ALTER TABLE "AiMonitorRun" ADD COLUMN IF NOT EXISTS "retryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiMonitorRun_status_startedAt_idx" ON "AiMonitorRun"("status", "startedAt");
