-- RENKOO Phase 8D: AI crawler + agent analytics (additive only).
-- AiAgentImport is the bounded import ledger; AiAgentRequest stores
-- append-only privacy-safe request observations (IP hashes only, no
-- raw IPs, no cookies/headers/bodies). Re-imports dedupe on
-- identityKey. A visit is never a citation, mention, ranking,
-- traffic or conversion signal.

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiAgentImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fileName" TEXT,
    "received" INTEGER NOT NULL DEFAULT 0,
    "parsed" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "families" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiAgentRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "importId" TEXT,
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3),
    "method" TEXT NOT NULL DEFAULT 'GET',
    "requestPath" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "statusCode" INTEGER,
    "userAgent" TEXT NOT NULL,
    "agentCategory" TEXT NOT NULL,
    "agentFamily" TEXT NOT NULL,
    "verificationState" TEXT NOT NULL DEFAULT 'OBSERVED_USER_AGENT',
    "responseBytes" INTEGER,
    "referrer" TEXT,
    "country" TEXT,
    "ipHash" TEXT,
    "identityKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAgentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiAgentRequest_identityKey_key" ON "AiAgentRequest"("identityKey");
CREATE INDEX IF NOT EXISTS "AiAgentImport_organizationId_websiteId_idx" ON "AiAgentImport"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "AiAgentImport_websiteId_createdAt_idx" ON "AiAgentImport"("websiteId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiAgentRequest_organizationId_websiteId_idx" ON "AiAgentRequest"("organizationId", "websiteId");
CREATE INDEX IF NOT EXISTS "AiAgentRequest_websiteId_observedAt_idx" ON "AiAgentRequest"("websiteId", "observedAt");
CREATE INDEX IF NOT EXISTS "AiAgentRequest_websiteId_agentFamily_idx" ON "AiAgentRequest"("websiteId", "agentFamily");
CREATE INDEX IF NOT EXISTS "AiAgentRequest_websiteId_agentCategory_idx" ON "AiAgentRequest"("websiteId", "agentCategory");
CREATE INDEX IF NOT EXISTS "AiAgentRequest_websiteId_normalizedUrl_idx" ON "AiAgentRequest"("websiteId", "normalizedUrl");
CREATE INDEX IF NOT EXISTS "AiAgentRequest_websiteId_statusCode_idx" ON "AiAgentRequest"("websiteId", "statusCode");
