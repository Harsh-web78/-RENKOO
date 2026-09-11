-- RENKOO Phase 40: First-Value & One-Product Consolidation (additive only).
-- Single append-only TelemetryEvent table for onboarding step events,
-- DataForSEO provider-call metering, dead-end records and acceptance
-- timestamps. No existing table is altered. No PII is stored.

-- CreateTable TelemetryEvent
CREATE TABLE IF NOT EXISTS "TelemetryEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT,
    "kind" TEXT NOT NULL,
    "step" TEXT,
    "status" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelemetryEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "TelemetryEvent_organizationId_idx" ON "TelemetryEvent"("organizationId");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_websiteId_idx" ON "TelemetryEvent"("websiteId");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_org_site_idx" ON "TelemetryEvent"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_kind_idx" ON "TelemetryEvent"("kind");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_org_kind_created_idx" ON "TelemetryEvent"("organizationId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "TelemetryEvent_createdAt_idx" ON "TelemetryEvent"("createdAt");
