-- RENKOO Phase 8B: long-run heartbeat (additive only).
-- AiMonitorRun gains lastHeartbeatAt so stale recovery
-- prefers heartbeat freshness over wall-clock startedAt.
-- A live long run keeps beating and is never falsely
-- recovered; a crashed worker stops beating and its
-- RUNNING row becomes recoverable after the timeout.

-- AlterTable
ALTER TABLE "AiMonitorRun" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiMonitorRun_status_lastHeartbeatAt_idx" ON "AiMonitorRun"("status", "lastHeartbeatAt");
